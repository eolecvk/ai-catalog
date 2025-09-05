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
                    terminatesLoop: true
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
                      terminatesLoop: true
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

    // No specific result type identified
    return {
      success: true,
      message: 'All execution steps completed successfully.',
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
        // Dynamic reference to previous step output
        const stepMatch = value.match(/\$step(\d+)\.output/);
        if (stepMatch) {
          const stepNumber = stepMatch[1];
          const stepResult = executionState.get(`step${stepNumber}`);
          
          if (stepResult && stepResult.output) {
            // Handle different output types
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
}

module.exports = Orchestrator;