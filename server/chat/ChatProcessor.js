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
    try {
      // Stage 1: Intent Classification & Context Analysis
      const classification = await this.classifyIntent(query, conversationHistory);
      
      // Stage 2: Context Gathering & Validation
      const contextData = await this.gatherContext(classification, graphContext);
      
      // Stage 3: Route to appropriate processor
      return await this.routeToProcessor(classification, contextData, query, conversationHistory);
    } catch (error) {
      console.error('Chat processing error:', error);
      return {
        success: false,
        error: 'Failed to process your request. Please try again.',
        type: 'error'
      };
    }
  }

  async classifyIntent(query, conversationHistory) {
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

Classify this query and respond with JSON only:
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

      return JSON.parse(response.trim());
    } catch (error) {
      console.error('Intent classification error:', error);
      return {
        type: 'UNCLEAR',
        entities: [],
        action: null,
        missing_context: 'Could not understand the request',
        confidence: 0.0
      };
    }
  }

  async gatherContext(classification, graphContext) {
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

  async routeToProcessor(classification, contextData, query, conversationHistory) {
    switch (classification.type) {
      case 'QUERY':
        return await this.processQuery(classification, contextData, query);
      
      case 'MUTATION':
        return await this.processMutation(classification, contextData, query);
      
      case 'CREATIVE':
        return await this.processCreative(classification, contextData, query, conversationHistory);
      
      case 'ANALYSIS':
        return await this.processAnalysis(classification, contextData, query);
      
      case 'UNCLEAR':
      default:
        return await this.processClarification(classification, query);
    }
  }

  async processQuery(classification, contextData, query) {
    // Generate and execute Cypher query
    const cypherQuery = await this.generateCypherQuery(query, classification.entities, contextData);
    
    if (!cypherQuery) {
      return {
        success: false,
        error: 'Could not generate a valid query for your request'
      };
    }

    const session = this.driver.session();
    try {
      const result = await session.run(cypherQuery.query, cypherQuery.params || {});
      const graphData = this.formatGraphData(result);
      
      return {
        success: true,
        message: cypherQuery.explanation || 'Here are the results:',
        queryResult: {
          type: 'query',
          graphData,
          query: cypherQuery.query
        }
      };
    } catch (error) {
      console.error('Query execution error:', error);
      return {
        success: false,
        error: 'Failed to execute query. Please try rephrasing your request.'
      };
    } finally {
      await session.close();
    }
  }

  async processMutation(classification, contextData, query) {
    // Generate mutation plan and Cypher
    const mutationPlan = await this.generateMutationPlan(classification, contextData, query);
    
    return {
      success: false, // Always return false to trigger confirmation flow
      needsConfirmation: true,
      mutationPlan,
      message: `I'm about to make changes to your graph. Please review and confirm:\n\n**Plan:** ${mutationPlan.explanation}\n\n**Cypher Query:**\n\`\`\`cypher\n${mutationPlan.query}\n\`\`\``
    };
  }

  async processCreative(classification, contextData, query, conversationHistory) {
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

  async processAnalysis(classification, contextData, query) {
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

  async processClarification(classification, query) {
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
      ]
    };
  }

  async generateCypherQuery(query, entities, contextData) {
    const prompt = `
Generate a Cypher query for Neo4j based on the user request.

# Graph Schema
${this.graphSchema.relationships.join('\n')}

# User Query
"${query}"

# Extracted Entities
${entities.join(', ')}

# Available Context
${Object.keys(contextData.entities).join(', ')}

Return JSON only:
{
  "query": "MATCH... RETURN...",
  "params": {},
  "explanation": "brief explanation of what this query does"
}

Make queries efficient and return relevant graph structure for visualization.
`;

    try {
      const response = await this.llmManager.generateText(prompt, {
        temperature: 0.1,
        maxTokens: 400
      });

      return JSON.parse(response.trim());
    } catch (error) {
      console.error('Cypher generation error:', error);
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

Return JSON only:
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
          // Handle Neo4j nodes
          if (value.identity !== undefined && value.labels) {
            const nodeId = value.identity.toString();
            if (!nodes.has(nodeId)) {
              nodes.set(nodeId, {
                id: nodeId,
                label: value.properties.name || value.properties.title || 'Unnamed',
                group: value.labels[0] || 'Unknown',
                properties: value.properties
              });
            }
          }
          
          // Handle Neo4j relationships
          if (value.type && value.start && value.end) {
            const edgeId = `${value.start}-${value.end}-${value.type}`;
            if (!edges.has(edgeId)) {
              edges.set(edgeId, {
                id: edgeId,
                from: value.start.toString(),
                to: value.end.toString(),
                label: value.type,
                properties: value.properties || {}
              });
            }
          }
        }
      });
    });

    return {
      nodes: Array.from(nodes.values()),
      edges: Array.from(edges.values())
    };
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