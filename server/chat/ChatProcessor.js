const llmManager = require('../llm/LLMManager');

class ChatProcessor {
  constructor(driver) {
    this.driver = driver;
    this.llmManager = llmManager;
    
    // Initialize new V2 architecture components
    const ExecutionPlanner = require('./ExecutionPlanner');
    const Orchestrator = require('./Orchestrator');
    this.executionPlanner = new ExecutionPlanner(driver);
    this.orchestrator = new Orchestrator(driver);
    
    // Keep legacy components for fallback
    this.legacyMode = false; // Set to true to use old architecture
    
    // Graph schema for LLM context
    this.graphSchema = {
      nodeLabels: ['Industry', 'Sector', 'Department', 'PainPoint', 'ProjectOpportunity', 'ProjectBlueprint', 'Role', 'Module', 'SubModule'],
      relationships: [
        '(Industry)-[:HAS_SECTOR]->(Sector)',
        '(Sector)-[:EXPERIENCES]->(PainPoint)',
        '(Department)-[:EXPERIENCES]->(PainPoint)', 
        '(ProjectOpportunity)-[:ADDRESSES]->(PainPoint)',
        '(ProjectOpportunity)-[:IS_INSTANCE_OF]->(ProjectBlueprint)',
        '(ProjectBlueprint)-[:REQUIRES_ROLE]->(Role)',
        '(ProjectBlueprint)-[:CONTAINS]->(Module)',
        '(Module)-[:NEEDS_SUBMODULE]->(SubModule)'
      ]
    };
  }

  async processChat(query, conversationHistory = [], graphContext = {}) {
    console.log(`[ChatProcessor] Processing chat query: "${query}"`);
    console.log(`[ChatProcessor] Using V2 Architecture (orchestrated execution)`);
    
    const startTime = Date.now();
    
    try {
      // V2 Architecture: Generate Execution Plan
      console.log('[ChatProcessor] Stage 1: Generating execution plan...');
      const planStart = Date.now();
      const executionPlan = await this.executionPlanner.generateExecutionPlan(query, conversationHistory);
      console.log(`[ChatProcessor] Generated plan with ${executionPlan.plan?.length || 0} steps in ${Date.now() - planStart}ms`);
      
      // V2 Architecture: Execute Plan via Orchestrator
      console.log('[ChatProcessor] Stage 2: Executing plan via orchestrator...');
      const executionStart = Date.now();
      const result = await this.orchestrator.executeExecutionPlan(executionPlan, conversationHistory);
      console.log(`[ChatProcessor] Plan execution completed in ${Date.now() - executionStart}ms`);
      
      // Log total processing time
      const totalTime = Date.now() - startTime;
      console.log(`[ChatProcessor] Total processing time: ${totalTime}ms`);
      
      return result;
      
    } catch (error) {
      console.error('Chat processing error (V2):', error);
      
      // Fallback to a basic error response with reasoning steps format
      const reasoningSteps = [{
        type: 'execution_planning',
        description: `V2 Architecture failed: ${error.message}`,
        timestamp: Date.now(),
        duration: Date.now() - startTime,
        confidence: 0.0,
        metadata: {
          error_type: error.constructor.name,
          architecture_version: 'v2'
        }
      }];
      
      return {
        success: false,
        error: 'Failed to process your request using the new architecture. Please try again.',
        type: 'error',
        queryResult: {
          cypherQuery: '',
          graphData: { nodes: [], edges: [] },
          summary: 'Processing failed with V2 architecture',
          reasoningSteps: reasoningSteps
        }
      };
    }
  }

  async classifyIntent(query, conversationHistory, reasoningSteps = []) {
    const historyContext = conversationHistory
      .slice(-6) // Last 3 exchanges
      .map(msg => `${msg.type}: ${msg.content}`)
      .join('\n');

    const prompt = `
Analyze query intent. Return ONLY JSON.

Entities: ${this.graphSchema.nodeLabels.join(', ')}
Context: ${historyContext || 'None'}
Query: "${query}"

JSON format:
{
  "type": "QUERY|MUTATION|CREATIVE|ANALYSIS|UNCLEAR",
  "entities": ["extracted entities"],
  "action": "action if mutation",
  "missing_context": "needed context if unclear", 
  "confidence": 0.0-1.0
}

Types:
- QUERY: Retrieve (show, find, list)
- MUTATION: Modify (add, create, update, delete) 
- CREATIVE: Generate (suggest, brainstorm)
- ANALYSIS: Compare/analyze
- UNCLEAR: Vague
`;

    try {
      const response = await this.llmManager.generateText(prompt, {
        temperature: 0.1,
        maxTokens: 300
      });

      console.log(`[ChatProcessor] Intent classification raw response: "${response}"`);
      
      const result = JSON.parse(response.trim());
      console.log(`[ChatProcessor] Intent classification result:`, result);
      return result;
    } catch (error) {
      console.error('Intent classification error:', error);
      console.error('Error type:', error.constructor.name);
      console.error('Error message:', error.message);
      
      // If it's a JSON parsing error, try using the LLM manager's JSON parsing
      if (error instanceof SyntaxError && error.message.includes('JSON')) {
        try {
          console.log('[ChatProcessor] Attempting fallback JSON parsing...');
          const response = await this.llmManager.generateText(prompt, {
            temperature: 0.1,
            maxTokens: 300
          });
          
          // Use the LLM provider's parseJSONResponse method
          const currentProvider = this.llmManager.currentProvider;
          if (currentProvider && currentProvider.parseJSONResponse) {
            const result = currentProvider.parseJSONResponse(response);
            console.log(`[ChatProcessor] Fallback parsing succeeded:`, result);
            return result;
          }
        } catch (fallbackError) {
          console.error('[ChatProcessor] Fallback parsing also failed:', fallbackError);
        }
      }
      
      return {
        type: 'UNCLEAR',
        entities: [],
        action: null,
        missing_context: 'Could not understand the request due to parsing error',
        confidence: 0.0
      };
    }
  }

  async gatherContext(classification, graphContext, reasoningSteps = []) {
    const session = this.driver.session();
    
    try {
      const contextData = {
        entities: {},
        relatedData: {},
        validation: { valid: true, errors: [] }
      };

      // Validate entities against schema
      for (const entity of classification.entities) {
        const validation = await this.validateEntity(entity, session);
        if (!validation.valid) {
          contextData.validation.valid = false;
          contextData.validation.errors.push(validation.error);
        } else {
          contextData.entities[entity] = validation.data;
        }
      }

      // Gather additional context based on intent type
      if (classification.type === 'ANALYSIS') {
        contextData.relatedData = await this.gatherAnalysisContext(classification.entities, session);
      } else if (classification.type === 'CREATIVE') {
        contextData.relatedData = await this.gatherCreativeContext(classification.entities, session);
      }

      // Always explore connection paths for relationship queries
      if (classification.type === 'QUERY' && classification.entities.length > 0) {
        contextData.connectionPaths = await this.exploreConnectionPaths(classification.entities, session);
      }

      return contextData;
    } finally {
      await session.close();
    }
  }

  async validateEntity(entity, session) {
    try {
      // Simple entity validation - check if referenced nodes exist
      const query = `
        MATCH (n) 
        WHERE toLower(n.name) CONTAINS toLower($entity) 
          OR ANY(label IN labels(n) WHERE toLower(label) = toLower($entity))
        RETURN n, labels(n) as labels
        LIMIT 5
      `;
      
      const result = await session.run(query, { entity });
      
      if (result.records.length > 0) {
        return {
          valid: true,
          data: result.records.map(r => ({
            node: r.get('n').properties,
            labels: r.get('labels')
          }))
        };
      }

      return { valid: true, data: [] }; // Allow unknown entities for creative requests
    } catch (error) {
      return {
        valid: false,
        error: `Could not validate entity: ${entity}`
      };
    }
  }

  async gatherAnalysisContext(entities, session) {
    // Gather data for comparison/analysis
    const contextData = {};
    
    for (const entity of entities) {
      try {
        const query = `
          MATCH (n)
          WHERE toLower(n.name) CONTAINS toLower($entity)
          OPTIONAL MATCH (n)-[r]->(related)
          RETURN n, collect(distinct {rel: type(r), node: related}) as relationships
          LIMIT 10
        `;
        
        const result = await session.run(query, { entity });
        contextData[entity] = result.records.map(r => ({
          node: r.get('n').properties,
          relationships: r.get('relationships')
        }));
      } catch (error) {
        console.error(`Error gathering context for ${entity}:`, error);
      }
    }
    
    return contextData;
  }

  async gatherCreativeContext(entities, session) {
    // Gather existing patterns for creative suggestions
    const contextData = {};
    
    try {
      const query = `
        MATCH (p:PainPoint)<-[:ADDRESSES]-(proj:ProjectOpportunity)
        RETURN p.name as painPoint, collect(proj.title) as existingProjects
        LIMIT 10
      `;
      
      const result = await session.run(query);
      contextData.existingPatterns = result.records.map(r => ({
        painPoint: r.get('painPoint'),
        projects: r.get('existingProjects')
      }));
    } catch (error) {
      console.error('Error gathering creative context:', error);
    }
    
    return contextData;
  }

  async exploreConnectionPaths(entities, session) {
    const connectionData = {
      directConnections: {},
      indirectConnections: {},
      pathSummary: {}
    };

    try {
      // For each entity, explore both direct and indirect connections
      for (const entity of entities) {
        // Check if entity is a node type (like "Sector") vs specific name (like "Banking")
        const isNodeType = this.graphSchema.nodeLabels.includes(entity);
        
        let directQuery;
        if (isNodeType) {
          // Search for nodes by label
          directQuery = `
            MATCH (n:${entity})
            OPTIONAL MATCH (n)-[r1]->(direct)
            OPTIONAL MATCH (source)-[r2]->(n)
            RETURN n, 
                   collect(DISTINCT {node: direct, relationship: type(r1), direction: 'outgoing'}) as outgoing,
                   collect(DISTINCT {node: source, relationship: type(r2), direction: 'incoming'}) as incoming
            LIMIT 10
          `;
        } else {
          // Search for nodes by name
          directQuery = `
            MATCH (n) 
            WHERE toLower(n.name) CONTAINS toLower($entity) OR toLower(n.title) CONTAINS toLower($entity)
            OPTIONAL MATCH (n)-[r1]->(direct)
            OPTIONAL MATCH (source)-[r2]->(n)
            RETURN n, 
                   collect(DISTINCT {node: direct, relationship: type(r1), direction: 'outgoing'}) as outgoing,
                   collect(DISTINCT {node: source, relationship: type(r2), direction: 'incoming'}) as incoming
            LIMIT 5
          `;
        }

        const directResult = await session.run(directQuery, { entity });
        const directConnections = [];
        
        directResult.records.forEach(record => {
          const node = record.get('n');
          const outgoing = record.get('outgoing').filter(conn => conn.node !== null);
          const incoming = record.get('incoming').filter(conn => conn.node !== null);
          
          if (outgoing.length > 0 || incoming.length > 0) {
            directConnections.push({
              centerNode: node.properties,
              centerLabels: node.labels,
              outgoing: outgoing,
              incoming: incoming
            });
          }
        });

        connectionData.directConnections[entity] = directConnections;

        // Find indirect connections (2-3 hops)
        let indirectQuery;
        if (isNodeType) {
          indirectQuery = `
            MATCH (n:${entity})
            MATCH path = (n)-[*2..3]->(target)
            WHERE NOT target = n
            RETURN n as source, 
                   target,
                   length(path) as pathLength,
                   [rel in relationships(path) | type(rel)] as relationshipTypes,
                   [node in nodes(path)[1..-1] | {labels: labels(node), properties: node.properties}] as pathNodes
            LIMIT 15
          `;
        } else {
          indirectQuery = `
            MATCH (n) 
            WHERE toLower(n.name) CONTAINS toLower($entity) OR toLower(n.title) CONTAINS toLower($entity)
            MATCH path = (n)-[*2..3]->(target)
            WHERE NOT target = n
            RETURN n as source, 
                   target,
                   length(path) as pathLength,
                   [rel in relationships(path) | type(rel)] as relationshipTypes,
                   [node in nodes(path)[1..-1] | {labels: labels(node), properties: node.properties}] as pathNodes
            LIMIT 10
          `;
        }

        const indirectResult = await session.run(indirectQuery, { entity });
        const indirectConnections = [];

        indirectResult.records.forEach(record => {
          const pathLength = record.get('pathLength').toNumber();
          const relationshipTypes = record.get('relationshipTypes');
          const pathNodes = record.get('pathNodes');
          const target = record.get('target');

          indirectConnections.push({
            pathLength: pathLength,
            relationshipTypes: relationshipTypes,
            pathNodes: pathNodes,
            target: target.properties,
            targetLabels: target.labels
          });
        });

        connectionData.indirectConnections[entity] = indirectConnections;

        // Create path summary for this entity
        const totalDirect = directConnections.reduce((sum, conn) => 
          sum + conn.outgoing.length + conn.incoming.length, 0);
        const totalIndirect = indirectConnections.length;

        connectionData.pathSummary[entity] = {
          directConnections: totalDirect,
          indirectConnections: totalIndirect,
          hasConnections: totalDirect > 0 || totalIndirect > 0,
          recommendPathExploration: totalDirect === 0 && totalIndirect > 0
        };
      }

      // For multi-entity queries, also look for shared connections
      if (entities.length > 1) {
        const nodeTypes = entities.filter(e => this.graphSchema.nodeLabels.includes(e));
        if (nodeTypes.length === 2) {
          await this.exploreSharedConnections(nodeTypes, connectionData, session);
        }
      }

      return connectionData;
    } catch (error) {
      console.error('Error exploring connection paths:', error);
      return connectionData; // Return partial data even if there's an error
    }
  }

  async exploreSharedConnections(nodeTypes, connectionData, session) {
    try {
      // Look for shared connections between two node types through intermediate nodes
      const [type1, type2] = nodeTypes;
      
      // Find shared PainPoints between sectors and departments
      const sharedPainPointsQuery = `
        MATCH (a:${type1})-[:EXPERIENCES]->(pp:PainPoint)<-[:EXPERIENCES]-(b:${type2})
        RETURN a, pp, b, 'EXPERIENCES' as sharedRelation
        LIMIT 20
        UNION
        MATCH (a:${type1})-[:EXPERIENCES]->(painpoint:PainPoint)<-[:ADDRESSES]-(po:ProjectOpportunity)-[:ADDRESSES]->(shared_pain:PainPoint)<-[:EXPERIENCES]-(b:${type2})
        RETURN a, po as pp, b, 'PROJECT_CONNECTION' as sharedRelation
        LIMIT 20
      `;
      
      const sharedResult = await session.run(sharedPainPointsQuery);
      const sharedConnections = [];
      
      sharedResult.records.forEach(record => {
        const nodeA = record.get('a');
        const intermediate = record.get('pp');
        const nodeB = record.get('b');
        const relationType = record.get('sharedRelation');
        
        sharedConnections.push({
          pathLength: 2,
          relationshipTypes: [relationType],
          pathNodes: [intermediate],
          source: nodeA.properties,
          target: nodeB.properties,
          intermediate: intermediate.properties,
          connectionType: 'shared'
        });
      });
      
      // Add shared connections to the connection data
      if (sharedConnections.length > 0) {
        const sharedSummary = {
          sharedConnections: sharedConnections.length,
          hasSharedConnections: true,
          connectionTypes: [...new Set(sharedConnections.map(c => c.relationshipTypes[0]))]
        };
        
        connectionData.sharedConnections = {
          [type1 + '_' + type2]: sharedConnections
        };
        
        connectionData.pathSummary.sharedConnections = sharedSummary;
      }
      
    } catch (error) {
      console.error('Error exploring shared connections:', error);
    }
  }

  async routeToProcessor(classification, contextData, query, conversationHistory, reasoningSteps = []) {
    switch (classification.type) {
      case 'QUERY':
        return await this.processQuery(classification, contextData, query, reasoningSteps);
      
      case 'MUTATION':
        return await this.processMutation(classification, contextData, query, reasoningSteps);
      
      case 'CREATIVE':
        return await this.processCreative(classification, contextData, query, conversationHistory, reasoningSteps);
      
      case 'ANALYSIS':
        return await this.processAnalysis(classification, contextData, query, reasoningSteps);
      
      case 'UNCLEAR':
      default:
        return await this.processClarification(classification, query, reasoningSteps);
    }
  }

  async processQuery(classification, contextData, query, reasoningSteps = []) {
    // Generate and execute Cypher query
    const cypherStart = Date.now();
    const cypherQuery = await this.generateCypherQuery(query, classification.entities, contextData, reasoningSteps);
    
    if (!cypherQuery) {
      reasoningSteps.push({
        type: 'cypher_generation',
        description: 'Failed to generate valid Cypher query',
        input: query,
        timestamp: cypherStart,
        duration: Date.now() - cypherStart,
        confidence: 0.0
      });
      
      return {
        success: false,
        error: 'Could not generate a valid query for your request'
      };
    }

    reasoningSteps.push({
      type: 'cypher_generation',
      description: cypherQuery.explanation || 'Generated Cypher query for data retrieval',
      input: `Query: "${query}", Entities: ${classification.entities.join(', ')}`,
      output: cypherQuery.query,
      timestamp: cypherStart,
      duration: Date.now() - cypherStart,
      confidence: 0.85,
      metadata: {
        has_params: Object.keys(cypherQuery.params || {}).length > 0
      }
    });

    // Validate and fix common Cypher syntax errors before execution
    const validatedQuery = this.validateAndFixCypherQuery(cypherQuery);
    
    const session = this.driver.session();
    try {
      console.log(`[ChatProcessor] Executing Cypher query: ${validatedQuery.query}`);
      console.log(`[ChatProcessor] Query params:`, validatedQuery.params || {});
      
      const executionStart = Date.now();
      const result = await session.run(validatedQuery.query, validatedQuery.params || {});
      console.log(`[ChatProcessor] Query executed, record count: ${result.records.length}`);
      
      const formattingStart = Date.now();
      const graphData = this.formatGraphData(result);
      console.log(`[ChatProcessor] Formatted graph data:`, {
        nodeCount: graphData.nodes.length,
        edgeCount: graphData.edges.length,
        nodes: graphData.nodes.slice(0, 3), // Log first 3 nodes for debugging
        edges: graphData.edges.slice(0, 3)  // Log first 3 edges for debugging
      });
      
      reasoningSteps.push({
        type: 'result_formatting',
        description: `Formatted query results into graph structure with ${graphData.nodes.length} nodes and ${graphData.edges.length} edges`,
        timestamp: formattingStart,
        duration: Date.now() - formattingStart,
        metadata: {
          records_processed: result.records.length,
          nodes_created: graphData.nodes.length,
          edges_created: graphData.edges.length,
          execution_time: Date.now() - executionStart
        }
      });
      
      // Check node count before visualization
      if (graphData.nodes.length > 100) {
        return {
          success: true,
          needsVisualizationConfirmation: true,
          message: `Query returned ${graphData.nodes.length} nodes and ${graphData.edges.length} edges. This may impact performance. Do you want to update the graph visualization?`,
          queryResult: {
            type: 'query',
            graphData, // Data is ready but won't update graph yet
            cypherQuery: cypherQuery.query,
            nodeCount: graphData.nodes.length,
            edgeCount: graphData.edges.length,
            connectionPaths: contextData.connectionPaths,
            connectionStrategy: cypherQuery.connectionStrategy,
            pendingVisualization: true // Flag to indicate data is waiting
          }
        };
      }
      
      // Check for empty results and provide helpful messaging
      let enhancedMessage = cypherQuery.explanation || 'Here are the results:';
      
      if (graphData.nodes.length === 0) {
        // Provide helpful messaging for empty results
        enhancedMessage = this.generateEmptyResultMessage(query, classification.entities);
      } else {
        // Include connection strategy information for non-empty results
        if (cypherQuery.connectionStrategy) {
          const strategyInfo = {
            'direct': 'showing direct connections',
            'indirect': 'showing indirect connections through intermediate nodes',
            'both': 'showing both direct and indirect connections'
          };
          enhancedMessage += ` (${strategyInfo[cypherQuery.connectionStrategy] || 'exploring connections'})`;
        }
      }
      
      return {
        success: true,
        message: enhancedMessage,
        queryResult: {
          type: 'query',
          graphData,
          cypherQuery: cypherQuery.query,
          connectionPaths: contextData.connectionPaths,
          connectionStrategy: cypherQuery.connectionStrategy
        }
      };
    } catch (error) {
      console.error('Query execution error:', error);
      
      // Check if this is the specific Path/Node type mismatch error
      const isPathNodeError = error.message && (
        error.message.includes('expected Path but was Node') ||
        error.message.includes('Invalid input \'Node\' for argument at index 0 of function relationships()') ||
        error.message.includes('Invalid input \'Node\' for argument at index 0 of function nodes()')
      );
      
      if (isPathNodeError && !validatedQuery._wasAutoFixed) {
        console.log('[ChatProcessor] 🔄 Detected Path/Node type mismatch - attempting recovery...');
        
        try {
          // Try to generate a simpler, more robust query as fallback
          const fallbackQuery = this.generateFallbackQuery(validatedQuery, entities);
          
          if (fallbackQuery && fallbackQuery.query !== validatedQuery.query) {
            console.log(`[ChatProcessor] 🔄 Attempting fallback query: ${fallbackQuery.query}`);
            
            const fallbackResult = await session.run(fallbackQuery.query, fallbackQuery.params || {});
            console.log(`[ChatProcessor] ✅ Fallback query succeeded with ${fallbackResult.records.length} records`);
            
            const graphData = this.formatGraphData(fallbackResult);
            
            reasoningSteps.push({
              type: 'error_recovery',
              description: `Recovered from Path/Node type mismatch using fallback query`,
              timestamp: Date.now(),
              confidence: 0.7,
              metadata: {
                original_error: error.message,
                fallback_query: fallbackQuery.query,
                recovery_successful: true
              }
            });
            
            return {
              success: true,
              queryResult: {
                cypherQuery: fallbackQuery.query,
                graphData: graphData,
                summary: `Found ${graphData.nodes.length} nodes and ${graphData.edges.length} connections (recovered from query error)`,
                reasoningSteps: reasoningSteps,
                _wasRecovered: true
              }
            };
          }
        } catch (fallbackError) {
          console.error('[ChatProcessor] ❌ Fallback query also failed:', fallbackError);
        }
      }
      
      reasoningSteps.push({
        type: 'validation',
        description: `Query execution failed: ${error.message}`,
        timestamp: Date.now(),
        confidence: 0.0,
        metadata: {
          error_type: error.constructor.name,
          is_path_node_error: isPathNodeError,
          recovery_attempted: isPathNodeError && !validatedQuery._wasAutoFixed
        }
      });
      
      return {
        success: false,
        error: isPathNodeError 
          ? 'Query syntax error detected. This issue has been logged for improvement.' 
          : 'Failed to execute query. Please try rephrasing your request.'
      };
    } finally {
      await session.close();
    }
  }

  async processMutation(classification, contextData, query, reasoningSteps = []) {
    // Generate mutation plan and Cypher
    const mutationPlan = await this.generateMutationPlan(classification, contextData, query);
    
    return {
      success: false, // Always return false to trigger confirmation flow
      needsConfirmation: true,
      mutationPlan,
      message: `I'm about to make changes to your graph. Please review and confirm:\n\n**Plan:** ${mutationPlan.explanation}\n\n**Cypher Query:**\n\`\`\`cypher\n${mutationPlan.query}\n\`\`\``
    };
  }

  async processCreative(classification, contextData, query, conversationHistory, reasoningSteps = []) {
    const prompt = `
Generate 3-5 creative suggestions. Return ONLY text, no JSON.

Context: ${JSON.stringify(contextData.relatedData.existingPatterns || [])}
Query: "${query}"
Recent chat: ${conversationHistory.slice(-2).map(msg => `${msg.type}: ${msg.content}`).join('; ')}

Provide actionable suggestions (max 200 words total).
`;

    try {
      const response = await this.llmManager.generateText(prompt, {
        temperature: 0.7,
        maxTokens: 300
      });

      return {
        success: true,
        message: response,
        queryResult: {
          type: 'creative',
          suggestions: response.split('\n').filter(line => line.trim())
        }
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to generate suggestions. Please try again.'
      };
    }
  }

  async processAnalysis(classification, contextData, query, reasoningSteps = []) {
    const analysisData = contextData.relatedData;
    
    const prompt = `
Analyze data. Return ONLY text, no JSON.

Data: ${JSON.stringify(analysisData)}
Query: "${query}"

Provide structured analysis with key insights (max 400 words).
`;

    try {
      const response = await this.llmManager.generateText(prompt, {
        temperature: 0.3,
        maxTokens: 500
      });

      return {
        success: true,
        message: response,
        queryResult: {
          type: 'analysis',
          analysis: response,
          data: analysisData
        }
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to perform analysis. Please try again.'
      };
    }
  }

  async processClarification(classification, query, reasoningSteps = []) {
    const clarificationStart = Date.now();
    
    reasoningSteps.push({
      type: 'clarification',
      description: `Query was unclear (confidence: ${Math.round((classification.confidence || 0) * 100)}%), requesting clarification`,
      input: query,
      timestamp: clarificationStart,
      duration: Date.now() - clarificationStart,
      confidence: classification.confidence || 0.0,
      metadata: {
        missing_context: classification.missing_context || 'Unknown reason',
        entities_extracted: classification.entities?.length || 0
      }
    });
    
    const clarificationPrompts = [
      "Could you be more specific about what you're looking for?",
      "What particular aspect of the graph data interests you?",
      "Would you like to see data, create something new, or analyze relationships?"
    ];

    return {
      success: false,
      needsClarification: true,
      message: `I need more details to help you. ${clarificationPrompts[Math.floor(Math.random() * clarificationPrompts.length)]}`,
      suggestions: [
        "Show me all industries",
        "Find pain points in banking",
        "Add a new department to Operations",
        "Compare pain points between sectors"
      ],
      queryResult: {
        cypherQuery: '',
        graphData: { nodes: [], edges: [] },
        summary: 'Clarification needed',
        reasoningSteps: reasoningSteps
      }
    };
  }

  async generateCypherQuery(query, entities, contextData, reasoningSteps = []) {
    // Generate connection context summary
    let connectionContext = '';
    if (contextData.connectionPaths) {
      connectionContext = '\n# Connection Analysis\n';
      for (const [entity, summary] of Object.entries(contextData.connectionPaths.pathSummary)) {
        if (entity === 'sharedConnections') {
          connectionContext += `- Shared connections found: ${summary.sharedConnections} connections of types: ${summary.connectionTypes.join(', ')}\n`;
          connectionContext += `  * Recommendation: Use shared connection patterns\n`;
        } else {
          connectionContext += `- ${entity}: ${summary.directConnections} direct, ${summary.indirectConnections} indirect connections\n`;
          if (summary.recommendPathExploration) {
            connectionContext += `  * Recommendation: Use indirect paths (${summary.indirectConnections} found)\n`;
          }
        }
      }
      
      // Add shared connection details if available
      if (contextData.connectionPaths.sharedConnections) {
        connectionContext += '\n# Shared Connection Patterns:\n';
        for (const [key, connections] of Object.entries(contextData.connectionPaths.sharedConnections)) {
          connectionContext += `- ${key}: Found ${connections.length} shared connections\n`;
          const sampleConnection = connections[0];
          connectionContext += `  * Example: ${sampleConnection.source.name} -> ${sampleConnection.intermediate.name} <- ${sampleConnection.target.name}\n`;
        }
      }
    }

    const prompt = `
Generate a Cypher query for Neo4j based on the user request and connection analysis.

Schema: ${this.graphSchema.relationships.join('; ')}
Query: "${query}"
Entities: ${entities.join(', ')}
Context: ${Object.keys(contextData.entities).join(', ')}
${connectionContext}

CRITICAL Rules:
❌ NEVER: relationships(node), nodes(node) - Path only
❌ NEVER: [:REL1|REL2*1..3] - Invalid syntax
✅ ALWAYS: Include relationships in RETURN for visualization
✅ Pattern: MATCH (a)-[r]->(b) RETURN a, r, b
✅ Path: MATCH path = (a)-[]->(b) RETURN path

Return ONLY JSON:
{
  "query": "MATCH... RETURN...",
  "params": {},
  "explanation": "brief explanation",
  "connectionStrategy": "direct|indirect|both"
}
`;

    try {
      const response = await this.llmManager.generateText(prompt, {
        temperature: 0.1,
        maxTokens: 600
      });

      console.log(`[ChatProcessor] Cypher generation raw response: "${response}"`);
      
      const result = JSON.parse(response.trim());
      console.log(`[ChatProcessor] Cypher generation result:`, result);
      return result;
    } catch (error) {
      console.error('Cypher generation error:', error);
      console.error('Error type:', error.constructor.name);
      
      // If it's a JSON parsing error, try using the LLM manager's JSON parsing
      if (error instanceof SyntaxError && error.message.includes('JSON')) {
        try {
          console.log('[ChatProcessor] Attempting fallback JSON parsing for Cypher...');
          const response = await this.llmManager.generateText(prompt, {
            temperature: 0.1,
            maxTokens: 400
          });
          
          // Use the LLM provider's parseJSONResponse method
          const currentProvider = this.llmManager.currentProvider;
          if (currentProvider && currentProvider.parseJSONResponse) {
            const result = currentProvider.parseJSONResponse(response);
            console.log(`[ChatProcessor] Cypher fallback parsing succeeded:`, result);
            return result;
          }
        } catch (fallbackError) {
          console.error('[ChatProcessor] Cypher fallback parsing also failed:', fallbackError);
        }
      }
      
      return null;
    }
  }

  validateAndFixCypherQuery(cypherQuery) {
    if (!cypherQuery || !cypherQuery.query) {
      return cypherQuery;
    }

    let query = cypherQuery.query;
    let wasFixed = false;
    const fixes = [];

    // Check for relationships(node) patterns - this is the main issue
    const relationshipsNodePattern = /relationships\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)/g;
    const matches = [...query.matchAll(relationshipsNodePattern)];
    
    if (matches.length > 0) {
      console.log(`[ChatProcessor] ⚠️  Found ${matches.length} relationships(node) pattern(s) - fixing...`);
      
      // For each relationships(node) pattern, we need to fix it
      for (const match of matches) {
        const nodeVar = match[1];
        
        // Check if this is a simple traversal pattern that can be converted to named relationships
        if (query.includes(`MATCH (`) && query.includes(`)-[`) && query.includes(`]->(${nodeVar})`)) {
          // This looks like it could be fixed by naming the relationships
          // Pattern: MATCH (a)-[:REL]->(node) ... RETURN ..., relationships(node), ...
          // Fix: MATCH (a)-[r:REL]->(node) ... RETURN ..., r, ...
          
          // Find the relationship pattern leading to this node
          const relationshipPattern = new RegExp(`-\\[([^\\]]*):([^\\]]+)\\]->\\(${nodeVar}[^\\)]*\\)`, 'g');
          const relMatch = relationshipPattern.exec(query);
          
          if (relMatch) {
            const existingRelVar = relMatch[1];
            let relVar = existingRelVar;
            
            // If no relationship variable exists, add one
            if (!existingRelVar) {
              relVar = 'r' + Math.floor(Math.random() * 1000); // Generate unique var name
              const oldPattern = `-[:${relMatch[2]}]->(${nodeVar}`;
              const newPattern = `-[${relVar}:${relMatch[2]}]->(${nodeVar}`;
              query = query.replace(oldPattern, newPattern);
            }
            
            // Replace relationships(node) with the relationship variable
            query = query.replace(match[0], relVar);
            fixes.push(`Replaced relationships(${nodeVar}) with relationship variable ${relVar}`);
            wasFixed = true;
          }
        } else {
          // More complex case - suggest using a path variable
          // Look for the MATCH clause and convert to path
          const matchClausePattern = /MATCH\s+\(([^)]+)\)(.*?)->\(([^)]+)\)/;
          const matchResult = matchClausePattern.exec(query);
          
          if (matchResult) {
            // Convert to path-based query
            const pathVar = 'path' + Math.floor(Math.random() * 1000);
            const originalMatch = matchResult[0];
            const newMatch = `MATCH ${pathVar} = (${matchResult[1]})${matchResult[2]})->(${matchResult[3]})`;
            
            query = query.replace(originalMatch, newMatch);
            query = query.replace(match[0], `relationships(${pathVar})`);
            fixes.push(`Converted to path-based query using ${pathVar}`);
            wasFixed = true;
          }
        }
      }
    }

    // Check for nodes(node) patterns as well
    const nodesNodePattern = /nodes\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)/g;
    const nodeMatches = [...query.matchAll(nodesNodePattern)];
    
    if (nodeMatches.length > 0) {
      console.log(`[ChatProcessor] ⚠️  Found ${nodeMatches.length} nodes(node) pattern(s) - fixing...`);
      
      for (const match of nodeMatches) {
        const nodeVar = match[1];
        // Similar logic to fix nodes(node) patterns
        const pathVar = 'path' + Math.floor(Math.random() * 1000);
        
        // This is more complex to fix automatically, so we'll log it and remove the problematic part
        query = query.replace(match[0], nodeVar);
        fixes.push(`Replaced nodes(${nodeVar}) with node variable ${nodeVar}`);
        wasFixed = true;
      }
    }

    if (wasFixed) {
      console.log(`[ChatProcessor] ✅ Fixed Cypher query:`);
      console.log(`[ChatProcessor] Original: ${cypherQuery.query}`);
      console.log(`[ChatProcessor] Fixed:    ${query}`);
      console.log(`[ChatProcessor] Fixes applied: ${fixes.join(', ')}`);
      
      return {
        ...cypherQuery,
        query: query,
        _wasAutoFixed: true,
        _fixes: fixes
      };
    }

    return cypherQuery;
  }

  generateFallbackQuery(failedQuery, entities) {
    // Generate simple, robust fallback queries based on entities
    if (!entities || entities.length === 0) {
      return null;
    }

    // Extract the main entity types from the entities array
    const nodeTypes = entities.filter(e => this.graphSchema.nodeLabels.includes(e));
    
    if (nodeTypes.length === 0) {
      return null;
    }

    let fallbackQuery = '';
    let explanation = '';

    if (nodeTypes.length === 1) {
      // Single entity - simple node retrieval with connected relationships
      const nodeType = nodeTypes[0];
      fallbackQuery = `MATCH (n:${nodeType})-[r]-(connected) RETURN n, r, connected LIMIT 50`;
      explanation = `Fallback query to show ${nodeType} nodes with their direct connections`;
    } else if (nodeTypes.length === 2) {
      // Two entities - look for connections between them
      const [type1, type2] = nodeTypes;
      
      // Try direct connection first
      fallbackQuery = `
        MATCH (a:${type1})-[r]-(b:${type2}) 
        RETURN a, r, b 
        LIMIT 20
        UNION
        MATCH (a:${type1})-[r1]-(intermediate)-[r2]-(b:${type2}) 
        RETURN a, r1, intermediate, r2, b 
        LIMIT 20
      `;
      explanation = `Fallback query to find connections between ${type1} and ${type2}`;
    } else {
      // Multiple entities - get a sample of each
      const entityQueries = nodeTypes.slice(0, 3).map(type => 
        `MATCH (n:${type}) RETURN n LIMIT 10`
      );
      fallbackQuery = entityQueries.join(' UNION ');
      explanation = `Fallback query to show samples from multiple entity types: ${nodeTypes.join(', ')}`;
    }

    console.log(`[ChatProcessor] Generated fallback query: ${fallbackQuery}`);

    return {
      query: fallbackQuery,
      params: {},
      explanation: explanation,
      connectionStrategy: 'fallback'
    };
  }

  async generateMutationPlan(classification, contextData, query) {
    const prompt = `
Create graph modification plan. Return ONLY JSON.

Schema: ${this.graphSchema.relationships.join('; ')}
Query: "${query}"
Action: ${classification.action || 'CREATE'}
Context: ${JSON.stringify(contextData.entities)}

JSON format:
{
  "explanation": "Brief explanation (max 50 words)",
  "query": "MATCH/CREATE/MERGE query",
  "params": {},
  "affectedNodes": ["node types"],
  "riskLevel": "LOW|MEDIUM|HIGH"
}
`;

    try {
      const response = await this.llmManager.generateText(prompt, {
        temperature: 0.2,
        maxTokens: 500
      });

      return JSON.parse(response.trim());
    } catch (error) {
      console.error('Mutation plan generation error:', error);
      return {
        explanation: 'Could not generate a safe mutation plan',
        query: '',
        params: {},
        affectedNodes: [],
        riskLevel: 'HIGH'
      };
    }
  }

  formatGraphData(result) {
    const nodes = new Map();
    const edges = new Map();

    result.records.forEach(record => {
      record.keys.forEach(key => {
        const value = record.get(key);
        
        if (value && typeof value === 'object') {
          // Handle arrays (from nodes(path) and relationships(path))
          if (Array.isArray(value)) {
            value.forEach(item => {
              this.processGraphItem(item, nodes, edges);
            });
          } else {
            // Handle single items (direct node/relationship returns)
            this.processGraphItem(value, nodes, edges);
          }
        }
      });
    });

    return {
      nodes: Array.from(nodes.values()),
      edges: Array.from(edges.values())
    };
  }

  processGraphItem(item, nodes, edges) {
    if (!item || typeof item !== 'object') return;
    
    // Handle Neo4j Path objects
    if (item.segments && Array.isArray(item.segments)) {
      // Extract start node
      if (item.start) this.processGraphItem(item.start, nodes, edges);
      
      // Extract end node  
      if (item.end) this.processGraphItem(item.end, nodes, edges);
      
      // Extract all segments (relationships + intermediate nodes)
      item.segments.forEach(segment => {
        this.processGraphItem(segment.start, nodes, edges);
        this.processGraphItem(segment.relationship, nodes, edges);
        this.processGraphItem(segment.end, nodes, edges);
      });
      return;
    }
    
    // Handle Neo4j nodes
    if (item.identity !== undefined && item.labels) {
      const nodeId = item.identity.toString();
      if (!nodes.has(nodeId)) {
        nodes.set(nodeId, {
          id: nodeId,
          label: item.properties.name || item.properties.title || 'Unnamed',
          group: item.labels[0] || 'Unknown',
          properties: item.properties
        });
      }
    }
    
    // Handle Neo4j relationships
    if (item.type && item.start && item.end) {
      const edgeId = `${item.start}-${item.end}-${item.type}`;
      if (!edges.has(edgeId)) {
        edges.set(edgeId, {
          id: edgeId,
          from: item.start.toString(),
          to: item.end.toString(),
          label: item.type,
          properties: item.properties || {}
        });
      }
    }
  }

  // Generate helpful message for empty results
  generateEmptyResultMessage(query, entities) {
    const queryLower = query.toLowerCase();
    
    // Check for specific problematic terms
    if (queryLower.includes('retail')) {
      return "I couldn't find 'retail' in the database. However, I found 'Retail Banking' sector which has several available projects. Try asking about 'retail banking' projects instead, or explore available sectors: Banking, Insurance.";
    }
    
    if (queryLower.includes('agriculture')) {
      return "I couldn't find 'agriculture' in the database. The available industries are Banking and Insurance. Try asking about projects in Banking or Insurance instead.";
    }
    
    // Check for other common entity types
    if (entities && entities.length > 0) {
      const entityList = entities.join(', ');
      return `I couldn't find information about "${entityList}" in the database. The available data includes industries (Banking, Insurance), sectors (Retail Banking, Commercial Banking, Investment Banking, Life Insurance, Property & Casualty), and various AI project opportunities. Try asking about these specific areas instead.`;
    }
    
    // Generic fallback
    return "I don't have information about that in the graph. Try asking about industries (Banking, Insurance), sectors, departments, pain points, or AI projects instead.";
  }

  // Method to execute confirmed mutations
  async executeMutation(mutationPlan) {
    const session = this.driver.session();
    
    try {
      const result = await session.run(mutationPlan.query, mutationPlan.params || {});
      
      return {
        success: true,
        message: 'Changes applied successfully!',
        queryResult: {
          type: 'mutation',
          summary: result.summary,
          changes: mutationPlan.explanation
        }
      };
    } catch (error) {
      console.error('Mutation execution error:', error);
      return {
        success: false,
        error: 'Failed to execute changes. Please check your request and try again.'
      };
    } finally {
      await session.close();
    }
  }
  
  // Legacy mode toggle for fallback
  enableLegacyMode() {
    this.legacyMode = true;
    console.log('[ChatProcessor] Switched to legacy V1 architecture');
  }
  
  disableLegacyMode() {
    this.legacyMode = false;
    console.log('[ChatProcessor] Switched to V2 orchestrated architecture');
  }
}

module.exports = ChatProcessor;