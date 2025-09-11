const TaskLibrary = require('./TaskLibrary');

class Orchestrator {
  constructor(driver) {
    this.driver = driver;
    this.taskLibrary = new TaskLibrary(driver);
    this.executionState = new Map(); // Store outputs from previous steps
  }

  async executeExecutionPlan(plan, conversationHistory = []) {
    console.log(`[Orchestrator] Starting execution of plan with ${plan.plan?.length || 0} steps`);
    
    if (!plan || !plan.plan || !Array.isArray(plan.plan)) {
      return {
        success: false,
        error: 'Invalid execution plan structure',
        executionLog: []
      };
    }

    const executionLog = [];
    this.executionState.clear(); // Reset state for new execution
    
    let finalResult = null;
    let needsVisualizationConfirmation = false;
    let visualizationData = null;

    for (let i = 0; i < plan.plan.length; i++) {
      const step = plan.plan[i];
      const stepNumber = i + 1;
      
      console.log(`[Orchestrator] Executing step ${stepNumber}: ${step.task_type}`);
      
      const stepStart = Date.now();
      
      try {
        // Resolve parameters with dynamic references
        const resolvedParams = this.resolveParameters(step.params, this.executionState);
        
        // Execute the task
        const taskResult = await this.executeTask(step.task_type, resolvedParams);
        
        const stepDuration = Date.now() - stepStart;
        
        // Log the execution step
        const logEntry = {
          stepNumber,
          taskType: step.task_type,
          params: resolvedParams,
          result: taskResult,
          duration: stepDuration,
          timestamp: stepStart,
          reasoning: step.reasoning,
          success: taskResult.success
        };
        
        executionLog.push(logEntry);
        
        if (!taskResult.success) {
          console.log(`[Orchestrator] Step ${stepNumber} failed:`, taskResult.error);
          
          // CRITICAL: Check if this is a business context workflow failure
          const hasBusinessContext = this.detectBusinessContextInExecutionLog(executionLog);
          const businessContextParams = this.extractBusinessContextFromLog(executionLog);
          
          if (hasBusinessContext) {
            console.log(`[Orchestrator] ⚠️  Business context workflow failure detected - preserving business context`);
            return await this.handleBusinessContextFailure(
              stepNumber, 
              step, 
              taskResult, 
              businessContextParams, 
              executionLog
            );
          }
          
          // Check if this was a Cypher execution error that could benefit from intelligent handling
          const isRecoverableError = step.task_type === 'execute_cypher' && 
                                    taskResult.recoveryAttempted && 
                                    taskResult.errorType === 'execution_error';
                                    
          if (isRecoverableError) {
            // Provide meaningful user feedback instead of cascading failure
            console.log(`[Orchestrator] Cypher execution failed but recovery was attempted, providing graceful fallback`);
            return {
              success: true,
              message: `I encountered a query syntax issue but I'm working on improving these queries. Here's what's available in our database:`,
              queryResult: {
                type: 'error_recovery',
                error: taskResult.error,
                originalQuery: taskResult.originalQuery,
                recoveryAttempted: true,
                fallbackMessage: "Let me help you with what we have available instead."
              },
              executionLog,
              requiresFallback: true
            };
          }
          
          // Handle failure based on on_failure strategy
          const failureAction = step.on_failure || 'halt';
          
          if (failureAction === 'clarify_and_halt') {
            return {
              success: false,
              needsClarification: true,
              message: `I need clarification: ${taskResult.error}`,
              executionLog,
              failedAt: stepNumber
            };
          } else if (failureAction === 'halt') {
            return {
              success: false,
              error: `Execution failed at step ${stepNumber}: ${taskResult.error}`,
              executionLog,
              failedAt: stepNumber
            };
          } else if (failureAction === 'continue') {
            console.log(`[Orchestrator] Continuing execution despite step ${stepNumber} failure`);
            // Store null result and continue
            this.executionState.set(`step${stepNumber}`, { output: null, error: taskResult.error });
            continue;
          } else if (failureAction === 'retry' && !step._hasRetried) {
            console.log(`[Orchestrator] Retrying step ${stepNumber}`);
            step._hasRetried = true;
            i--; // Retry the same step
            continue;
          }
        } else {
          // Store successful result for future steps
          this.executionState.set(`step${stepNumber}`, taskResult);
          
          // Check for specific result types that need special handling
          if (taskResult.output && taskResult.output.needsClarification) {
            return {
              success: false,
              needsClarification: true,
              message: taskResult.output.message,
              suggestions: taskResult.output.suggestions,
              entity_issues: taskResult.output.entity_issues,
              corrected_entities: taskResult.output.corrected_entities,
              conversation_state: taskResult.output.conversation_state,
              alternative_approach: taskResult.output.alternative_approach,
              helpful_guidance: taskResult.output.helpful_guidance,
              executionLog
            };
          }
          
          // Smart entity validation failure handling with loop detection
          if (step.task_type === 'validate_entity' && taskResult.output && !taskResult.output.valid) {
            const confidence = taskResult.output.confidence || 0;
            const suggestedEntities = taskResult.output.suggested_entities || [];
            const entityType = taskResult.output.entity_type;
            
            // Check if we've been through validation failures before in this session
            const validationFailureCount = executionLog.filter(log => 
              log.taskType === 'validate_entity' && 
              log.result.output && 
              !log.result.output.valid
            ).length;
            
            // If we have multiple validation failures or very low confidence, provide final answer
            if (validationFailureCount >= 2 || confidence === 0.0) {
              console.log(`[Orchestrator] Detected potential clarification loop - providing final answer`);
              
              // Generate final answer instead of more clarification
              const finalAnswerTask = await this.executeTask('clarify_with_user', {
                provide_final_answer: true,
                entity_issues: [{
                  entity: entityType,
                  issue: 'not_found',
                  suggestions: suggestedEntities
                }],
                corrected_entities: suggestedEntities,
                conversation_state: 'provide_final_answer'
              });
              
              if (finalAnswerTask.success && finalAnswerTask.output.isFinalAnswer) {
                return {
                  success: true,
                  message: finalAnswerTask.output.message,
                  suggestions: finalAnswerTask.output.suggestions,
                  queryResult: {
                    type: 'final_answer',
                    summary: finalAnswerTask.output.message,
                    availableData: finalAnswerTask.output.availableData,
                    terminatesLoop: true,
                    reasoningSteps: this.convertExecutionLogToReasoningSteps(executionLog)
                  },
                  executionLog,
                  clarification_loop_terminated: true
                };
              }
            }
            
            // If we have good suggestions and moderate confidence, offer clarification (but only once)
            if (confidence > 0.0 && confidence < 0.5 && suggestedEntities.length > 0 && validationFailureCount < 2) {
              return {
                success: false,
                needsClarification: true,
                message: `I couldn't find "${entityType}" in the database. Did you mean: ${suggestedEntities.slice(0, 3).join(', ')}?`,
                suggestions: suggestedEntities.slice(0, 3).map(entity => 
                  `What projects are available for ${entity}?`
                ),
                entity_issues: [{
                  entity: entityType,
                  issue: 'not_found', 
                  suggestions: suggestedEntities
                }],
                corrected_entities: suggestedEntities,
                executionLog,
                early_halt_reason: 'entity_validation_failure',
                validation_attempt: validationFailureCount + 1
              };
            }
          }
          
          // Check for large graph data that needs confirmation
          if (taskResult.output && taskResult.output.graphData) {
            const nodeCount = taskResult.output.graphData.nodes?.length || 0;
            
            if (nodeCount > 100) {
              needsVisualizationConfirmation = true;
              visualizationData = taskResult.output;
            } else if (nodeCount > 0) {
              // Normal sized result - can be used as final result
              finalResult = {
                type: 'query',
                graphData: taskResult.output.graphData,
                cypherQuery: this.getLastCypherQuery(),
                summary: this.generateExecutionSummary(executionLog, taskResult.output)
              };
            } else if (nodeCount === 0 && step.task_type === 'execute_cypher') {
              // Empty result from cypher execution - provide final answer instead of more clarification
              const lastCypherQuery = this.getLastCypherQuery();
              const entityHints = this.extractEntityHintsFromQuery(lastCypherQuery);
              
              if (entityHints.length > 0) {
                console.log(`[Orchestrator] Empty result detected for entities: ${entityHints.join(', ')} - providing final answer`);
                
                // Generate final answer for empty results instead of more clarification
                const finalAnswerTask = await this.executeTask('clarify_with_user', {
                  provide_final_answer: true,
                  entity_issues: entityHints.map(entity => ({
                    entity,
                    issue: 'empty_result',
                    suggestions: this.getContextualSuggestions(entity)
                  })),
                  corrected_entities: entityHints.flatMap(entity => this.getContextualSuggestions(entity)),
                  conversation_state: 'provide_final_answer'
                });
                
                if (finalAnswerTask.success && finalAnswerTask.output.isFinalAnswer) {
                  return {
                    success: true,
                    message: finalAnswerTask.output.message,
                    suggestions: finalAnswerTask.output.suggestions,
                    queryResult: {
                      type: 'final_answer',
                      summary: finalAnswerTask.output.message,
                      availableData: finalAnswerTask.output.availableData,
                      terminatesLoop: true,
                      reasoningSteps: this.convertExecutionLogToReasoningSteps(executionLog)
                    },
                    executionLog,
                    clarification_loop_terminated: true
                  };
                }
              }
            }
          }
          
          // Handle exploration mode results
          if (step.params && step.params.exploration_mode && taskResult.output && taskResult.output.graphData) {
            finalResult = {
              type: 'exploration',
              graphData: taskResult.output.graphData,
              cypherQuery: this.getLastCypherQuery(),
              summary: `Showing ${taskResult.output.nodeCount} available entities to help with exploration`,
              isExploration: true
            };
          }

          // Handle analysis results
          if (taskResult.output && taskResult.output.analysis) {
            if (finalResult && finalResult.graphData) {
              // Enhance existing query result with analysis
              finalResult.analysis = taskResult.output.analysis;
              finalResult.summary = taskResult.output.analysis;
            } else {
              // Only analysis, no previous graph data
              finalResult = {
                type: 'analysis',
                analysis: taskResult.output.analysis,
                summary: taskResult.output.analysis
              };
            }
          }
          
          // Handle creative content results
          if (taskResult.output && taskResult.output.creative_content) {
            finalResult = {
              type: 'creative',
              suggestions: taskResult.output.suggestions,
              summary: taskResult.output.creative_content
            };
          }
        }
      } catch (error) {
        console.error(`[Orchestrator] Unexpected error at step ${stepNumber}:`, error);
        
        const logEntry = {
          stepNumber,
          taskType: step.task_type,
          params: step.params,
          result: { success: false, error: error.message },
          duration: Date.now() - stepStart,
          timestamp: stepStart,
          reasoning: step.reasoning,
          success: false
        };
        
        executionLog.push(logEntry);
        
        return {
          success: false,
          error: `Unexpected error at step ${stepNumber}: ${error.message}`,
          executionLog,
          failedAt: stepNumber
        };
      }
    }

    // Handle visualization confirmation case
    if (needsVisualizationConfirmation && visualizationData) {
      const nodeCount = visualizationData.graphData.nodes?.length || 0;
      const edgeCount = visualizationData.graphData.edges?.length || 0;
      
      return {
        success: true,
        needsVisualizationConfirmation: true,
        message: `Query returned ${nodeCount} nodes and ${edgeCount} edges. This may impact performance. Do you want to update the graph visualization?`,
        queryResult: {
          type: 'query',
          graphData: visualizationData.graphData,
          cypherQuery: this.getLastCypherQuery(),
          nodeCount,
          edgeCount,
          pendingVisualization: true,
          summary: this.generateExecutionSummary(executionLog, visualizationData)
        },
        executionLog
      };
    }

    // All steps completed successfully
    if (finalResult) {
      finalResult.reasoningSteps = this.convertExecutionLogToReasoningSteps(executionLog);
      
      return {
        success: true,
        message: this.generateSuccessMessage(finalResult, executionLog),
        queryResult: finalResult,
        executionLog
      };
    }

    // Check if execution provided meaningful results
    const hasMeaningfulResults = this.hasMeaningfulResults(executionLog);
    
    if (!hasMeaningfulResults) {
      console.log('[Orchestrator] No meaningful results found, triggering empty result handling');
      return await this.handleEmptyResults(executionLog);
    }
    
    // No specific result type identified but has some meaningful data
    return {
      success: true,
      message: 'Execution completed with partial results.',
      queryResult: {
        type: 'generic',
        summary: this.generateExecutionSummary(executionLog),
        reasoningSteps: this.convertExecutionLogToReasoningSteps(executionLog)
      },
      executionLog
    };
  }

  async executeTask(taskType, params) {
    switch (taskType) {
      case 'validate_entity':
        return await this.taskLibrary.validateEntity(params);
      
      case 'find_connection_paths':
        return await this.taskLibrary.findConnectionPaths(params);
      
      case 'generate_cypher':
        return await this.taskLibrary.generateCypher(params);
      
      case 'execute_cypher':
        return await this.taskLibrary.executeCypher(params);
      
      case 'analyze_and_summarize':
        return await this.taskLibrary.analyzeAndSummarize(params);
      
      case 'generate_creative_text':
        return await this.taskLibrary.generateCreativeText(params);
      
      case 'clarify_with_user':
        return await this.taskLibrary.clarifyWithUser(params);
      
      default:
        return {
          success: false,
          error: `Unknown task type: ${taskType}`
        };
    }
  }

  resolveParameters(params, executionState) {
    const resolved = {};
    
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string' && value.startsWith('$step')) {
        // Dynamic reference to previous step output - support deeper property access
        const stepMatch = value.match(/\$step(\d+)\.output(?:\.(.+))?/);
        if (stepMatch) {
          const stepNumber = stepMatch[1];
          const propertyPath = stepMatch[2]; // e.g., "params" or "query"
          const stepResult = executionState.get(`step${stepNumber}`);
          
          if (stepResult && stepResult.output) {
            if (propertyPath) {
              // Access specific property like $step1.output.params
              resolved[key] = stepResult.output[propertyPath];
            } else {
              // Handle different output types for $step1.output
              if (stepResult.output.query) {
                // Cypher query result
                resolved[key] = stepResult.output.query;
              } else if (stepResult.output.graphData) {
                // Graph data result
                resolved[key] = stepResult.output.graphData;
              } else {
                // Generic output
                resolved[key] = stepResult.output;
              }
            }
          } else {
            console.warn(`[Orchestrator] Could not resolve reference: ${value}`);
            resolved[key] = null;
          }
        } else {
          // Invalid reference format
          resolved[key] = value;
        }
      } else {
        // Static parameter
        resolved[key] = value;
      }
    }
    
    return resolved;
  }

  getLastCypherQuery() {
    // Find the last successful Cypher query from execution state
    const entries = Array.from(this.executionState.entries());
    
    for (let i = entries.length - 1; i >= 0; i--) {
      const [stepKey, result] = entries[i];
      if (result.output && result.output.query) {
        return result.output.query;
      }
    }
    
    return 'Multiple queries executed in sequence';
  }

  generateExecutionSummary(executionLog, finalOutput = null) {
    const totalSteps = executionLog.length;
    const successfulSteps = executionLog.filter(log => log.success).length;
    const totalDuration = executionLog.reduce((sum, log) => sum + log.duration, 0);
    
    let summary = `Executed ${totalSteps} steps (${successfulSteps} successful) in ${totalDuration}ms.`;
    
    if (finalOutput) {
      if (finalOutput.graphData) {
        const nodeCount = finalOutput.graphData.nodes?.length || 0;
        const edgeCount = finalOutput.graphData.edges?.length || 0;
        summary += ` Retrieved ${nodeCount} nodes and ${edgeCount} connections.`;
      } else if (finalOutput.analysis) {
        summary += ' Completed data analysis.';
      }
    }
    
    return summary;
  }

  generateSuccessMessage(finalResult, executionLog) {
    const taskTypes = [...new Set(executionLog.map(log => log.taskType))];
    
    if (finalResult.type === 'query') {
      const nodeCount = finalResult.graphData?.nodes?.length || 0;
      const edgeCount = finalResult.graphData?.edges?.length || 0;
      return `Found ${nodeCount} nodes and ${edgeCount} connections using ${taskTypes.length} different operations.`;
    } else if (finalResult.type === 'analysis') {
      return `Completed analysis using ${taskTypes.length} steps including data retrieval and comparison.`;
    } else if (finalResult.type === 'creative') {
      return `Generated creative suggestions based on graph data analysis.`;
    }
    
    return `Successfully completed execution plan with ${executionLog.length} steps.`;
  }

  convertExecutionLogToReasoningSteps(executionLog) {
    return executionLog.map(log => ({
      type: log.taskType.replace(/_/g, ' '),
      description: log.reasoning,
      input: JSON.stringify(log.params),
      output: log.success ? JSON.stringify(log.result.output) : log.result.error,
      timestamp: log.timestamp,
      duration: log.duration,
      confidence: log.success ? 0.8 : 0.0,
      metadata: {
        step_number: log.stepNumber,
        execution_success: log.success
      }
    }));
  }

  // Helper methods for smart error handling
  extractEntityHintsFromQuery(cypherQuery) {
    if (!cypherQuery || typeof cypherQuery !== 'string') {
      return [];
    }
    
    const entityHints = [];
    
    // Extract entity names from WHERE clauses
    const whereMatches = cypherQuery.match(/WHERE\s+.*?[\s\w]+\s*=\s*['"]([^'"]+)['"]/gi);
    if (whereMatches) {
      whereMatches.forEach(match => {
        const nameMatch = match.match(/['"]([^'"]+)['"]/);
        if (nameMatch) {
          entityHints.push(nameMatch[1]);
        }
      });
    }
    
    // Extract from CONTAINS clauses
    const containsMatches = cypherQuery.match(/CONTAINS\s+['"]([^'"]+)['"]/gi);
    if (containsMatches) {
      containsMatches.forEach(match => {
        const nameMatch = match.match(/['"]([^'"]+)['"]/);
        if (nameMatch) {
          entityHints.push(nameMatch[1]);
        }
      });
    }
    
    // Extract node label constraints like (n:Industry)
    const labelMatches = cypherQuery.match(/\(\w+:(\w+)\s*\{[^}]*name:\s*['"]([^'"]+)['"]/gi);
    if (labelMatches) {
      labelMatches.forEach(match => {
        const nameMatch = match.match(/name:\s*['"]([^'"]+)['"]/);
        if (nameMatch) {
          entityHints.push(nameMatch[1]);
        }
      });
    }
    
    return [...new Set(entityHints)]; // Remove duplicates
  }

  generateEntitySuggestions(entityHints) {
    const suggestions = [];
    
    for (const entity of entityHints) {
      const contextualSuggestions = this.getContextualSuggestions(entity);
      suggestions.push(...contextualSuggestions.slice(0, 2).map(suggestion => 
        `What projects are available for ${suggestion}?`
      ));
    }
    
    // Add some generic helpful suggestions if no specific ones found
    if (suggestions.length === 0) {
      suggestions.push(
        'Show me all available industries',
        'What sectors are in Banking?',
        'Find projects in Retail Banking',
        'What pain points exist in Commercial Banking?'
      );
    }
    
    return [...new Set(suggestions)].slice(0, 4);
  }

  getContextualSuggestions(entity) {
    const entityLower = entity.toLowerCase();
    
    // Context-based suggestions matching TaskLibrary logic
    if (entityLower.includes('retail') || entityLower.includes('consumer') || entityLower.includes('personal')) {
      return ['Retail Banking', 'Consumer Banking'];
    }
    
    if (entityLower.includes('commercial') || entityLower.includes('business') || entityLower.includes('corporate')) {
      return ['Commercial Banking', 'Investment Banking'];
    }
    
    if (entityLower.includes('health') || entityLower.includes('medical') || entityLower.includes('healthcare')) {
      return ['Health Insurance'];
    }
    
    if (entityLower.includes('property') || entityLower.includes('home') || entityLower.includes('real estate')) {
      return ['Property Insurance'];
    }
    
    if (entityLower.includes('life') || entityLower.includes('mortality')) {
      return ['Life Insurance'];
    }
    
    if (entityLower.includes('investment') || entityLower.includes('securities') || entityLower.includes('trading')) {
      return ['Investment Banking'];
    }
    
    // Default suggestions
    return ['Banking', 'Insurance', 'Retail Banking', 'Commercial Banking'];
  }
  
  // Business Context Error Recovery Methods
  detectBusinessContextInExecutionLog(executionLog) {
    return executionLog.some(log => {
      // Check for business context parameters in execution log
      return log.params && (
        log.params.proxy_context ||
        log.params.business_context ||
        log.params.consultant_response ||
        log.params.original_company ||
        log.params.proxy_sectors ||
        (log.taskType === 'generate_cypher' && log.params.proxy_context)
      );
    });
  }
  
  extractBusinessContextFromLog(executionLog) {
    // Extract business context parameters from the execution log including gap analysis fields
    let businessContext = {};
    
    for (const log of executionLog) {
      if (log.params) {
        if (log.params.proxy_context) businessContext.proxy_context = log.params.proxy_context;
        if (log.params.business_context) businessContext.business_context = log.params.business_context;
        if (log.params.consultant_response) businessContext.consultant_response = log.params.consultant_response;
        if (log.params.original_company) businessContext.original_company = log.params.original_company;
        if (log.params.proxy_sectors) businessContext.proxy_sectors = log.params.proxy_sectors;
        if (log.params.transparency_message) businessContext.transparency_message = log.params.transparency_message;
        
        // New gap analysis fields
        if (log.params.missing_sectors) businessContext.missing_sectors = log.params.missing_sectors;
        if (log.params.business_impact_of_gaps) businessContext.business_impact_of_gaps = log.params.business_impact_of_gaps;
        if (log.params.data_completeness_score !== undefined) businessContext.data_completeness_score = log.params.data_completeness_score;
      }
    }
    
    return businessContext;
  }
  
  async handleBusinessContextFailure(stepNumber, step, taskResult, businessContextParams, executionLog) {
    console.log(`[Orchestrator] 🔧 Handling business context failure at step ${stepNumber}`);
    console.log(`[Orchestrator] Business context params:`, businessContextParams);
    
    // Preserve business context in the error response
    const originalCompany = businessContextParams.original_company;
    const businessContext = businessContextParams.business_context;
    const proxySectors = businessContextParams.proxy_sectors;
    
    // Create a business-context-aware fallback response
    let fallbackMessage;
    
    if (originalCompany) {
      fallbackMessage = `I understand you're asking about ${originalCompany}. While I encountered a processing issue, I can help you explore similar business challenges using our available data.`;
      
      if (businessContext) {
        fallbackMessage += ` Based on business intelligence, ${originalCompany} ${businessContext.toLowerCase()}. `;
      }
      
      if (proxySectors) {
        fallbackMessage += `I'll analyze sectors with similar operational challenges: ${proxySectors}.`;
      }
    } else {
      fallbackMessage = `I encountered a processing issue with your business query, but I can help you explore relevant business opportunities.`;
    }
    
    // Generate business-context-aware suggestions
    const suggestions = [];
    
    if (originalCompany && proxySectors) {
      const sectorsArray = typeof proxySectors === 'string' ? 
        proxySectors.split(', ').slice(0, 2) : 
        (Array.isArray(proxySectors) ? proxySectors.slice(0, 2) : ['Banking', 'Insurance']);
      
      suggestions.push(`Show me projects in ${sectorsArray[0]}`);
      if (sectorsArray[1]) {
        suggestions.push(`Find opportunities in ${sectorsArray[1]}`);
      }
      suggestions.push(`What pain points exist in these sectors?`);
      suggestions.push(`Browse all available business opportunities`);
    } else {
      suggestions.push('Show me all industries');
      suggestions.push('Find pain points in banking');
      suggestions.push('Browse available sectors');
      suggestions.push('What business opportunities are available?');
    }
    
    return {
      success: true, // Mark as successful to prevent cascading failures
      message: fallbackMessage,
      suggestions: suggestions,
      queryResult: {
        type: 'business_context_recovery',
        error: taskResult.error,
        failedStep: stepNumber,
        originalCompany: originalCompany,
        businessContext: businessContext,
        proxySectors: proxySectors,
        recoveryStrategy: 'business_context_preserved',
        fallbackMessage: fallbackMessage,
        reasoningSteps: this.convertExecutionLogToReasoningSteps(executionLog)
      },
      executionLog,
      businessContextPreserved: true,
      requiresBusinessFallback: true
    };
  }
  
  // Enhanced error recovery with business context preservation
  async attemptProgressiveFallback(error, stepNumber, executionLog, businessContextParams) {
    console.log(`[Orchestrator] 🔄 Attempting progressive fallback for step ${stepNumber}`);
    
    const hasBusinessContext = Object.keys(businessContextParams).length > 0;
    
    if (hasBusinessContext) {
      // Business context fallback strategy
      console.log(`[Orchestrator] Using business context fallback strategy`);
      
      // Try to generate a simpler business context query
      try {
        const fallbackCypher = await this.executeTask('generate_cypher', {
          goal: `Find basic project information related to business sectors`,
          entities: ['Sector', 'ProjectOpportunity'],
          proxy_context: `Simplified query for ${businessContextParams.original_company || 'business analysis'}`,
          fallback_mode: true
        });
        
        if (fallbackCypher.success) {
          const fallbackExecution = await this.executeTask('execute_cypher', {
            query: fallbackCypher.output.query,
            queryParams: fallbackCypher.output.params || {}
          });
          
          if (fallbackExecution.success) {
            return {
              success: true,
              message: `I used a simplified approach to find relevant business information for ${businessContextParams.original_company || 'your query'}.`,
              queryResult: {
                type: 'progressive_fallback',
                graphData: fallbackExecution.output.graphData,
                cypherQuery: fallbackCypher.output.query,
                summary: `Simplified business analysis using progressive fallback`,
                originalError: error,
                fallbackLevel: 1,
                businessContextPreserved: true
              },
              executionLog,
              wasProgressiveFallback: true
            };
          }
        }
      } catch (fallbackError) {
        console.log(`[Orchestrator] Progressive fallback attempt failed:`, fallbackError.message);
      }
    }
    
    // Standard progressive fallback
    return {
      success: false,
      error: `Progressive fallback failed: ${error}`,
      executionLog,
      fallbackAttempted: true
    };
  }

  // Check if execution log contains any meaningful results
  hasMeaningfulResults(executionLog) {
    for (const logEntry of executionLog) {
      // Check for successful cypher execution with data
      if (logEntry.taskType === 'execute_cypher' && logEntry.success && logEntry.result.output) {
        const nodeCount = logEntry.result.output.nodeCount || 0;
        const edgeCount = logEntry.result.output.edgeCount || 0;
        if (nodeCount > 0 || edgeCount > 0) {
          return true;
        }
      }
      
      // Check for successful analysis results
      if (logEntry.taskType === 'analyze_and_summarize' && logEntry.success && logEntry.result.output) {
        if (logEntry.result.output.analysis || logEntry.result.output.creative_content) {
          return true;
        }
      }
      
      // Check for creative content
      if (logEntry.taskType === 'generate_creative_text' && logEntry.success && logEntry.result.output) {
        if (logEntry.result.output.creative_content) {
          return true;
        }
      }
    }
    
    return false;
  }

  // Handle empty results with meaningful user feedback
  async handleEmptyResults(executionLog) {
    console.log('[Orchestrator] Handling empty results with context-aware response');
    
    // Extract query context from execution log
    const queryContext = this.extractQueryContext(executionLog);
    
    // Generate contextual empty result response
    try {
      const finalAnswerTask = await this.executeTask('clarify_with_user', {
        provide_final_answer: true,
        entity_issues: queryContext.entities.map(entity => ({
          entity,
          issue: 'empty_result',
          suggestions: this.getContextualSuggestions(entity)
        })),
        corrected_entities: queryContext.entities.flatMap(entity => 
          this.getContextualSuggestions(entity)
        ),
        conversation_state: 'provide_final_answer_empty_results',
        query_context: queryContext
      });
      
      if (finalAnswerTask.success && finalAnswerTask.output) {
        return {
          success: true,  // This is success from user perspective - we gave them helpful info
          message: finalAnswerTask.output.message || 'I found some alternative suggestions for your query.',
          queryResult: {
            type: 'empty_result_handled',
            summary: finalAnswerTask.output.message,
            suggestions: finalAnswerTask.output.suggestions || [],
            availableData: finalAnswerTask.output.availableData || [],
            isEmpty: true,
            contextPreserved: true,
            reasoningSteps: this.convertExecutionLogToReasoningSteps(executionLog)
          },
          executionLog,
          isEmpty: true,
          wasEmptyResultHandled: true
        };
      }
    } catch (error) {
      console.error('[Orchestrator] Error in empty result handling:', error);
    }
    
    // Fallback empty result response
    return {
      success: false,
      message: queryContext.isCompanyQuery ? 
        `I don't have specific data for ${queryContext.companyName}, but I can show you what's available in related areas.` :
        'I couldn\'t find specific data matching your query. Let me suggest some alternatives.',
      queryResult: {
        type: 'empty_result',
        summary: 'No matching data found',
        isEmpty: true,
        queryContext: queryContext,
        reasoningSteps: this.convertExecutionLogToReasoningSteps(executionLog)
      },
      executionLog,
      isEmpty: true
    };
  }

  // Extract query context from execution log to understand what user was looking for
  extractQueryContext(executionLog) {
    let entities = [];
    let isCompanyQuery = false;
    let companyName = '';
    
    for (const logEntry of executionLog) {
      if (logEntry.taskType === 'generate_cypher' && logEntry.params) {
        if (logEntry.params.entities && Array.isArray(logEntry.params.entities)) {
          entities = [...entities, ...logEntry.params.entities];
        }
        if (logEntry.params.proxy_context || logEntry.params.original_company) {
          isCompanyQuery = true;
          companyName = logEntry.params.original_company || 
                       (logEntry.params.goal && logEntry.params.goal.includes('for ') ? 
                        logEntry.params.goal.split('for ')[1] : '');
        }
      }
    }
    
    return {
      entities: [...new Set(entities)], // Remove duplicates
      isCompanyQuery,
      companyName: companyName.trim(),
      executionAttempts: executionLog.length
    };
  }
}

module.exports = Orchestrator;