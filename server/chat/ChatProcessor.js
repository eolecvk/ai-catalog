const llmManager = require('../llm/LLMManager');

class ChatProcessor {
  constructor(driver) {
    this.driver = driver;
    this.llmManager = llmManager;
    
    // Graph schema for LLM context
    this.graphSchema = {
      nodeLabels: ['Industry', 'Sector', 'Department', 'PainPoint', 'ProjectOpportunity', 'ProjectBlueprint', 'Role', 'Module', 'SubModule'],
      relationships: [
        '(Industry)-[:HAS_SECTOR]->(Sector)',
        '(Sector)-[:HAS_DEPARTMENT]->(Department)', 
        '(Department)-[:EXPERIENCES]->(PainPoint)',
        '(ProjectOpportunity)-[:ADDRESSES]->(PainPoint)',
        '(ProjectOpportunity)-[:BELONGS_TO_SECTOR]->(Sector)',
        '(ProjectOpportunity)-[:TARGETS_DEPARTMENT]->(Department)',
        '(ProjectOpportunity)-[:HAS_BLUEPRINT]->(ProjectBlueprint)',
        '(ProjectBlueprint)-[:REQUIRES]->(Role)',
        '(ProjectBlueprint)-[:CONTAINS]->(Module)',
        '(Module)-[:HAS_SUBMODULE]->(SubModule)'
      ]
    };
  }

  async processChat(query, conversationHistory = [], graphContext = {}) {
    const reasoningSteps = [];
    const startTime = Date.now();
    
    try {
      // Stage 1: Intent Classification & Context Analysis
      const classificationStart = Date.now();
      const classification = await this.classifyIntent(query, conversationHistory, reasoningSteps);
      reasoningSteps.push({
        type: 'intent_parsing',
        description: `Classified query intent as "${classification.type}" with ${Math.round(classification.confidence * 100)}% confidence`,
        input: query,
        output: JSON.stringify({type: classification.type, entities: classification.entities}),
        timestamp: classificationStart,
        duration: Date.now() - classificationStart,
        confidence: classification.confidence,
        metadata: {
          entities_found: classification.entities.length,
          action: classification.action
        }
      });
      
      // Stage 2: Context Gathering & Validation
      const contextStart = Date.now();
      const contextData = await this.gatherContext(classification, graphContext, reasoningSteps);
      reasoningSteps.push({
        type: 'context_analysis',
        description: `Analyzed context and validated ${classification.entities.length} entities`,
        timestamp: contextStart,
        duration: Date.now() - contextStart,
        metadata: {
          entities_validated: Object.keys(contextData.entities).length,
          validation_errors: contextData.validation.errors.length
        }
      });
      
      // Stage 3: Route to appropriate processor
      const processingStart = Date.now();
      const result = await this.routeToProcessor(classification, contextData, query, conversationHistory, reasoningSteps);
      
      // Add reasoning steps to the result if it has queryResult
      if (result.queryResult) {
        result.queryResult.reasoningSteps = reasoningSteps;
      }
      
      return result;
    } catch (error) {
      console.error('Chat processing error:', error);
      reasoningSteps.push({
        type: 'validation',
        description: `Processing failed: ${error.message}`,
        timestamp: Date.now(),
        duration: Date.now() - startTime,
        confidence: 0.0,
        metadata: {
          error_type: error.constructor.name
        }
      });
      
      return {
        success: false,
        error: 'Failed to process your request. Please try again.',
        type: 'error',
        queryResult: {
          cypherQuery: '',
          graphData: { nodes: [], edges: [] },
          summary: '',
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
You are analyzing a user query to a graph database containing business data.

# Graph Schema
Node Labels: ${this.graphSchema.nodeLabels.join(', ')}
Relationships: 
${this.graphSchema.relationships.map(rel => `- ${rel}`).join('\n')}

# Recent Chat History
${historyContext || 'No previous context'}

# Current Query
"${query}"

CRITICAL: You must respond with ONLY a JSON object. No markdown, no backticks, no explanations - just pure JSON.

Expected JSON format:
{
  "type": "QUERY|MUTATION|CREATIVE|ANALYSIS|UNCLEAR",
  "entities": ["extracted entities from query"],
  "action": "specific action if MUTATION",
  "missing_context": "what context is needed if unclear", 
  "confidence": 0.0-1.0
}

Intent Types:
- QUERY: Retrieving existing data (show, find, list, what are)
- MUTATION: Modifying graph (add, create, connect, update, delete) 
- CREATIVE: Generate ideas/suggestions (suggest, brainstorm, imagine)
- ANALYSIS: Compare/analyze data (compare, analyze, summarize differences)
- UNCLEAR: Vague or ambiguous requests
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
        MATCH (a:${type1})-[:HAS_OPPORTUNITY]->(po:ProjectOpportunity)-[:TARGETS_DEPARTMENT]->(b:${type2})
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

    const session = this.driver.session();
    try {
      console.log(`[ChatProcessor] Executing Cypher query: ${cypherQuery.query}`);
      console.log(`[ChatProcessor] Query params:`, cypherQuery.params || {});
      
      const executionStart = Date.now();
      const result = await session.run(cypherQuery.query, cypherQuery.params || {});
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
      
      // Include connection strategy information in the response
      let enhancedMessage = cypherQuery.explanation || 'Here are the results:';
      if (cypherQuery.connectionStrategy) {
        const strategyInfo = {
          'direct': 'showing direct connections',
          'indirect': 'showing indirect connections through intermediate nodes',
          'both': 'showing both direct and indirect connections'
        };
        enhancedMessage += ` (${strategyInfo[cypherQuery.connectionStrategy] || 'exploring connections'})`;
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
      reasoningSteps.push({
        type: 'validation',
        description: `Query execution failed: ${error.message}`,
        timestamp: Date.now(),
        confidence: 0.0,
        metadata: {
          error_type: error.constructor.name
        }
      });
      
      return {
        success: false,
        error: 'Failed to execute query. Please try rephrasing your request.'
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
Based on the graph data context and user request, generate creative suggestions.

# Context Data
${JSON.stringify(contextData.relatedData.existingPatterns || [], null, 2)}

# User Request
"${query}"

# Recent Conversation
${conversationHistory.slice(-4).map(msg => `${msg.type}: ${msg.content}`).join('\n')}

Provide 3-5 creative, actionable suggestions that fit the graph schema. Focus on practical solutions.
`;

    try {
      const response = await this.llmManager.generateText(prompt, {
        temperature: 0.7,
        maxTokens: 500
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
Analyze and compare the following graph data based on the user's request.

# Data to Analyze
${JSON.stringify(analysisData, null, 2)}

# User Request
"${query}"

Provide a clear, structured analysis with specific insights and comparisons.
`;

    try {
      const response = await this.llmManager.generateText(prompt, {
        temperature: 0.3,
        maxTokens: 600
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

# Graph Schema
${this.graphSchema.relationships.join('\n')}

# User Query
"${query}"

# Extracted Entities
${entities.join(', ')}

# Available Context
${Object.keys(contextData.entities).join(', ')}
${connectionContext}

CRITICAL Cypher Syntax Rules:
- relationships() function requires a Path, not a Node
- Variable-length patterns: [:REL*1..3] not [:REL1|REL2*1..3] 
- For paths: MATCH path = (a)-[*1..3]->(b) RETURN nodes(path), relationships(path)
- For direct relationships: MATCH (a)-[r:REL]->(b) RETURN a, r, b
- For shared connections: MATCH (a)-[:REL1]->(shared)<-[:REL2]-(b) RETURN a, shared, b

Connection Strategy:
- If direct connections exist, include them in results
- If no direct connections but indirect ones exist, use variable-length relationships
- For multi-entity queries, look for shared connections through intermediate nodes
- NEVER use relationships(node) - only relationships(path)

CRITICAL: Respond with ONLY pure JSON. No markdown, no backticks, no code blocks.

JSON format:
{
  "query": "MATCH... RETURN...",
  "params": {},
  "explanation": "brief explanation of what this query does and what connection types it explores",
  "connectionStrategy": "direct|indirect|both"
}

Make queries efficient and return relevant graph structure for visualization.
`;

    try {
      const response = await this.llmManager.generateText(prompt, {
        temperature: 0.1,
        maxTokens: 400
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

  async generateMutationPlan(classification, contextData, query) {
    const prompt = `
Create a plan for modifying the graph database based on the user request.

# Graph Schema
${this.graphSchema.relationships.join('\n')}

# User Request
"${query}"

# Action Type
${classification.action || 'CREATE'}

# Context
${JSON.stringify(contextData.entities, null, 2)}

CRITICAL: Respond with ONLY pure JSON. No markdown, no backticks, no code blocks.

JSON format:
{
  "explanation": "Human-readable explanation of the changes",
  "query": "MATCH/CREATE/MERGE Cypher query", 
  "params": {},
  "affectedNodes": ["list of node types affected"],
  "riskLevel": "LOW|MEDIUM|HIGH"
}
`;

    try {
      const response = await this.llmManager.generateText(prompt, {
        temperature: 0.2,
        maxTokens: 400
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
}

module.exports = ChatProcessor;