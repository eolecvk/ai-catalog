const llmManager = require('../llm/LLMManager');

class TaskLibrary {
  constructor(driver) {
    this.driver = driver;
    this.llmManager = llmManager;
    
    // Graph schema for validation and context
    this.graphSchema = {
      nodeLabels: ['Industry', 'Sector', 'Department', 'PainPoint', 'ProjectOpportunity', 'ProjectBlueprint', 'Role', 'Module', 'SubModule'],
      relationships: [
        '(Industry)-[:HAS_SECTOR]->(Sector)',
        '(Sector)-[:EXPERIENCES]->(PainPoint)',
        '(Department)-[:EXPERIENCES]->(PainPoint)', 
        '(Sector)-[:HAS_OPPORTUNITY]->(ProjectOpportunity)',
        '(Department)-[:HAS_OPPORTUNITY]->(ProjectOpportunity)',
        '(ProjectOpportunity)-[:ADDRESSES]->(PainPoint)',
        '(ProjectOpportunity)-[:IS_INSTANCE_OF]->(ProjectBlueprint)',
        '(ProjectBlueprint)-[:REQUIRES_ROLE]->(Role)',
        '(ProjectBlueprint)-[:CONTAINS]->(Module)',
        '(Module)-[:NEEDS_SUBMODULE]->(SubModule)'
      ]
    };
  }

  async validateEntity(params) {
    console.log('[TaskLibrary] Executing validate_entity:', params);
    
    const { entity_type } = params;
    
    if (!entity_type) {
      return { success: false, error: 'Missing entity_type parameter' };
    }

    // Check if entity_type is in the schema
    if (this.graphSchema.nodeLabels.includes(entity_type)) {
      return {
        success: true,
        output: {
          valid: true,
          entity_type,
          exists_in_schema: true
        }
      };
    }

    // Check if entity exists as actual data in the graph
    const session = this.driver.session();
    try {
      const query = `
        MATCH (n)
        WHERE toLower(n.name) CONTAINS toLower($entity) 
          OR ANY(label IN labels(n) WHERE toLower(label) = toLower($entity))
        RETURN n, labels(n) as labels
        LIMIT 5
      `;
      
      const result = await session.run(query, { entity: entity_type });
      
      if (result.records.length > 0) {
        return {
          success: true,
          output: {
            valid: true,
            entity_type,
            exists_in_schema: false,
            exists_in_data: true,
            sample_data: result.records.map(r => ({
              node: r.get('n').properties,
              labels: r.get('labels')
            }))
          }
        };
      }

      return {
        success: true,
        output: {
          valid: false,
          entity_type,
          exists_in_schema: false,
          exists_in_data: false,
          suggested_entities: this.graphSchema.nodeLabels
        }
      };
    } catch (error) {
      console.error('Entity validation error:', error);
      return {
        success: false,
        error: `Failed to validate entity: ${entity_type}`,
        output: { valid: false, entity_type }
      };
    } finally {
      await session.close();
    }
  }

  async findConnectionPaths(params) {
    console.log('[TaskLibrary] Executing find_connection_paths:', params);
    
    const { entities, start_entity, end_entity } = params;
    
    // Handle both parameter formats: entities array or start_entity/end_entity pair
    let entityList = entities;
    if (!entityList || !Array.isArray(entityList) || entityList.length === 0) {
      // Try start_entity/end_entity format
      if (start_entity && end_entity) {
        entityList = [start_entity, end_entity];
      } else {
        return { success: false, error: 'Missing entities parameter (expected: entities[] or start_entity/end_entity)' };
      }
    }

    const session = this.driver.session();
    try {
      const connectionData = {
        directPaths: [],
        indirectPaths: [],
        sharedConnections: []
      };

      // For each pair of entities, find connection paths
      for (let i = 0; i < entityList.length - 1; i++) {
        for (let j = i + 1; j < entityList.length; j++) {
          const entity1 = entityList[i];
          const entity2 = entityList[j];
          
          // Check for direct connections
          const directQuery = `
            MATCH path = (a)-[*1..2]-(b)
            WHERE 
              (toLower(a.name) CONTAINS toLower($entity1) OR ANY(label IN labels(a) WHERE toLower(label) = toLower($entity1)))
              AND
              (toLower(b.name) CONTAINS toLower($entity2) OR ANY(label IN labels(b) WHERE toLower(label) = toLower($entity2)))
            RETURN path, length(path) as pathLength
            ORDER BY pathLength
            LIMIT 10
          `;
          
          const directResult = await session.run(directQuery, { entity1, entity2 });
          
          if (directResult.records.length > 0) {
            connectionData.directPaths.push({
              entity1,
              entity2,
              paths: directResult.records.map(r => ({
                path: r.get('path'),
                length: r.get('pathLength').toNumber()
              }))
            });
          }

          // Check for shared intermediate connections (for node types)
          if (this.graphSchema.nodeLabels.includes(entity1) && this.graphSchema.nodeLabels.includes(entity2)) {
            const sharedQuery = `
              MATCH (a:${entity1})-[r1]->(shared)<-[r2]-(b:${entity2})
              RETURN a, r1, shared, r2, b, labels(shared) as sharedType
              LIMIT 20
            `;
            
            const sharedResult = await session.run(sharedQuery);
            
            if (sharedResult.records.length > 0) {
              connectionData.sharedConnections.push({
                entity1,
                entity2,
                connections: sharedResult.records.map(r => ({
                  node1: r.get('a').properties,
                  relationship1: r.get('r1').type,
                  shared: r.get('shared').properties,
                  sharedType: r.get('sharedType'),
                  relationship2: r.get('r2').type,
                  node2: r.get('b').properties
                }))
              });
            }
          }
        }
      }

      return {
        success: true,
        output: connectionData
      };
    } catch (error) {
      console.error('Connection path analysis error:', error);
      return {
        success: false,
        error: `Failed to analyze connection paths: ${error.message}`
      };
    } finally {
      await session.close();
    }
  }

  async generateCypher(params) {
    console.log('[TaskLibrary] Executing generate_cypher:', params);
    
    const { goal, entities, context } = params;
    
    if (!goal) {
      return { success: false, error: 'Missing goal parameter' };
    }

    const prompt = `
Generate a Cypher query for Neo4j based on the specific goal and entities.

# Graph Schema
${this.graphSchema.relationships.join('\n')}

# Goal
${goal}

# Entities
${entities ? entities.join(', ') : 'None specified'}

# Additional Context
${context ? JSON.stringify(context, null, 2) : 'None'}

⚠️ CRITICAL Cypher Syntax Rules - MUST FOLLOW EXACTLY:

🚫 FORBIDDEN PATTERNS - These will cause Neo4jError:
❌ RETURN sector, relationships(sector), painPoint    // ERROR: relationships() needs Path, not Node
❌ RETURN industry, relationships(industry)           // ERROR: relationships() needs Path, not Node
❌ RETURN nodes(sector)                              // ERROR: nodes() needs Path, not Node
❌ RETURN industry, sector, painPoint                // ERROR: Missing relationships - shows 0 connections!

✅ CORRECT PATTERNS - Use these instead:
✅ MATCH path = (industry:Industry)-[:HAS_SECTOR]->(sector:Sector) RETURN path
✅ MATCH (industry:Industry)-[r:HAS_SECTOR]->(sector:Sector) RETURN industry, r, sector
✅ MATCH path = (a)-[*1..3]->(b) RETURN nodes(path), relationships(path)
✅ MATCH (a:Sector)-[r1:EXPERIENCES]->(shared:PainPoint)<-[r2:EXPERIENCES]-(b:Department) RETURN a, r1, shared, r2, b

🔥 CRITICAL FOR GRAPH VISUALIZATION:
- Graph visualization REQUIRES both nodes AND relationships to display connections
- NEVER return just nodes like "RETURN industry, sector, painPoint" - this will show "0 connections"
- ALWAYS include relationship variables: "RETURN industry, r1, sector, r2, painPoint"
- For path queries, use: RETURN path OR RETURN nodes(path), relationships(path)
- For multi-hop: MATCH (a)-[r1]->(b)-[r2]->(c) RETURN a, r1, b, r2, c
- Example: MATCH (industry:Industry {name: 'Banking'})-[r1:HAS_SECTOR]->(sector:Sector)-[r2:EXPERIENCES]->(painPoint:PainPoint) RETURN industry, r1, sector, r2, painPoint

CRITICAL: Respond with ONLY pure JSON. No markdown, no backticks, no code blocks.

JSON format:
{
  "query": "MATCH... RETURN...",
  "params": {},
  "explanation": "brief explanation of what this query does",
  "connectionStrategy": "direct|indirect|both"
}
`;

    try {
      const response = await this.llmManager.generateText(prompt, {
        temperature: 0.1,
        maxTokens: 400
      });

      const result = JSON.parse(response.trim());
      
      // Validate and fix common Cypher errors
      const validatedResult = this.validateAndFixCypherQuery(result);
      
      return {
        success: true,
        output: validatedResult
      };
    } catch (error) {
      console.error('Cypher generation error:', error);
      
      // Try fallback parsing
      if (error instanceof SyntaxError && error.message.includes('JSON')) {
        try {
          const response = await this.llmManager.generateText(prompt, {
            temperature: 0.1,
            maxTokens: 400
          });
          
          const currentProvider = this.llmManager.currentProvider;
          if (currentProvider && currentProvider.parseJSONResponse) {
            const result = currentProvider.parseJSONResponse(response);
            const validatedResult = this.validateAndFixCypherQuery(result);
            return { success: true, output: validatedResult };
          }
        } catch (fallbackError) {
          console.error('Cypher fallback parsing failed:', fallbackError);
        }
      }
      
      return {
        success: false,
        error: `Failed to generate Cypher query: ${error.message}`
      };
    }
  }

  async executeCypher(params) {
    console.log('[TaskLibrary] Executing execute_cypher:', params);
    
    const { query, queryParams } = params;
    
    if (!query) {
      return { success: false, error: 'Missing query parameter' };
    }

    const session = this.driver.session();
    try {
      console.log(`[TaskLibrary] Executing query: ${query}`);
      console.log(`[TaskLibrary] Query params:`, queryParams || {});
      
      const result = await session.run(query, queryParams || {});
      
      const graphData = this.formatGraphData(result);
      
      return {
        success: true,
        output: {
          graphData,
          recordCount: result.records.length,
          nodeCount: graphData.nodes.length,
          edgeCount: graphData.edges.length
        }
      };
    } catch (error) {
      console.error('Cypher execution error:', error);
      
      // Check for common Path/Node type mismatch errors and suggest fixes
      const isPathNodeError = error.message && (
        error.message.includes('expected Path but was Node') ||
        error.message.includes('Invalid input \'Node\' for argument at index 0 of function relationships()') ||
        error.message.includes('Invalid input \'Node\' for argument at index 0 of function nodes()')
      );
      
      return {
        success: false,
        error: isPathNodeError 
          ? 'Query syntax error: relationships() and nodes() functions require Path variables, not Node variables'
          : `Query execution failed: ${error.message}`,
        errorType: isPathNodeError ? 'path_node_mismatch' : 'execution_error'
      };
    } finally {
      await session.close();
    }
  }

  async analyzeAndSummarize(params) {
    console.log('[TaskLibrary] Executing analyze_and_summarize:', params);
    
    const { dataset1, dataset2, dataset, comparison_type, analysis_goal } = params;
    
    // Handle both single dataset and comparison scenarios
    let primaryDataset = dataset1 || dataset;
    let secondaryDataset = dataset2;
    
    if (!primaryDataset && !secondaryDataset) {
      return { success: false, error: 'Missing dataset(s) to analyze' };
    }

    // Determine if this is a comparison or single dataset analysis
    const isComparison = secondaryDataset && primaryDataset;
    
    const prompt = isComparison ? `
Analyze and compare the following graph data.

# Dataset 1
${JSON.stringify(primaryDataset, null, 2)}

# Dataset 2
${JSON.stringify(secondaryDataset, null, 2)}

# Analysis Type
${comparison_type || 'comparative_analysis'}

# Analysis Goal
${analysis_goal || 'Compare and contrast the two datasets'}

Provide a clear, structured analysis with specific insights. Focus on:
- Key patterns and trends in each dataset
- Differences and similarities between the datasets
- Notable findings or outliers
- Actionable insights for decision-making

Keep the analysis concise but comprehensive.
` : `
Analyze the following graph data and provide insights.

# Dataset
${JSON.stringify(primaryDataset, null, 2)}

# Analysis Type
${comparison_type || 'single_dataset_analysis'}

# Analysis Goal
${analysis_goal || 'Provide insights and summary of the data'}

Provide a clear, structured analysis with specific insights. Focus on:
- Key patterns and trends in the data
- Notable findings, outliers, or important relationships
- Distribution and characteristics of the nodes and connections
- Actionable insights and recommendations

Keep the analysis concise but comprehensive.
`;

    try {
      const response = await this.llmManager.generateText(prompt, {
        temperature: 0.3,
        maxTokens: 600
      });

      return {
        success: true,
        output: {
          analysis: response,
          comparison_type: isComparison ? (comparison_type || 'comparative_analysis') : (comparison_type || 'single_dataset_analysis'),
          datasets_analyzed: isComparison ? 2 : 1,
          is_comparison: isComparison
        }
      };
    } catch (error) {
      console.error('Analysis error:', error);
      return {
        success: false,
        error: `Failed to perform analysis: ${error.message}`
      };
    }
  }

  async generateCreativeText(params) {
    console.log('[TaskLibrary] Executing generate_creative_text:', params);
    
    const { context, creative_goal, style } = params;
    
    if (!creative_goal) {
      return { success: false, error: 'Missing creative_goal parameter' };
    }

    const prompt = `
Based on the graph data context, generate creative content.

# Context Data
${context ? JSON.stringify(context, null, 2) : 'No specific context provided'}

# Creative Goal
${creative_goal}

# Style
${style || 'Professional and practical'}

Generate creative, actionable content that fits the graph schema and addresses the goal.
Provide 3-5 specific, implementable suggestions or ideas.
`;

    try {
      const response = await this.llmManager.generateText(prompt, {
        temperature: 0.7,
        maxTokens: 500
      });

      return {
        success: true,
        output: {
          creative_content: response,
          suggestions: response.split('\n').filter(line => line.trim()),
          style
        }
      };
    } catch (error) {
      console.error('Creative generation error:', error);
      return {
        success: false,
        error: `Failed to generate creative content: ${error.message}`
      };
    }
  }

  async clarifyWithUser(params) {
    console.log('[TaskLibrary] Executing clarify_with_user:', params);
    
    const { message, suggestions } = params;
    
    return {
      success: true,
      output: {
        needsClarification: true,
        message: message || 'I need more information to help you better.',
        suggestions: suggestions || [
          'Show me all industries',
          'Find pain points in banking',
          'Compare sectors and departments',
          'Add a new project opportunity'
        ]
      }
    };
  }

  // Helper methods
  validateAndFixCypherQuery(cypherResult) {
    if (!cypherResult || !cypherResult.query) {
      return cypherResult;
    }

    let query = cypherResult.query;
    let wasFixed = false;
    const fixes = [];

    // Check for relationships(node) patterns
    const relationshipsNodePattern = /relationships\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)/g;
    const matches = [...query.matchAll(relationshipsNodePattern)];
    
    if (matches.length > 0) {
      console.log(`[TaskLibrary] ⚠️  Found ${matches.length} relationships(node) pattern(s) - fixing...`);
      
      for (const match of matches) {
        const nodeVar = match[1];
        
        // Look for relationship pattern leading to this node
        const relationshipPattern = new RegExp(`-\\[([^\\]]*):([^\\]]+)\\]->\\(${nodeVar}[^\\)]*\\)`, 'g');
        const relMatch = relationshipPattern.exec(query);
        
        if (relMatch) {
          const existingRelVar = relMatch[1];
          let relVar = existingRelVar;
          
          if (!existingRelVar) {
            relVar = 'r' + Math.floor(Math.random() * 1000);
            const oldPattern = `-[:${relMatch[2]}]->(${nodeVar}`;
            const newPattern = `-[${relVar}:${relMatch[2]}]->(${nodeVar}`;
            query = query.replace(oldPattern, newPattern);
          }
          
          query = query.replace(match[0], relVar);
          fixes.push(`Replaced relationships(${nodeVar}) with relationship variable ${relVar}`);
          wasFixed = true;
        }
      }
    }

    // Check for nodes(node) patterns
    const nodesNodePattern = /nodes\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)/g;
    const nodeMatches = [...query.matchAll(nodesNodePattern)];
    
    if (nodeMatches.length > 0) {
      for (const match of nodeMatches) {
        const nodeVar = match[1];
        query = query.replace(match[0], nodeVar);
        fixes.push(`Replaced nodes(${nodeVar}) with node variable ${nodeVar}`);
        wasFixed = true;
      }
    }

    if (wasFixed) {
      console.log(`[TaskLibrary] ✅ Fixed Cypher query:`, fixes);
      return {
        ...cypherResult,
        query: query,
        _wasAutoFixed: true,
        _fixes: fixes
      };
    }

    return cypherResult;
  }

  formatGraphData(result) {
    const nodes = new Map();
    const edges = new Map();

    result.records.forEach(record => {
      record.keys.forEach(key => {
        const value = record.get(key);
        
        if (value && typeof value === 'object') {
          if (Array.isArray(value)) {
            value.forEach(item => {
              this.processGraphItem(item, nodes, edges);
            });
          } else {
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
      if (item.start) this.processGraphItem(item.start, nodes, edges);
      if (item.end) this.processGraphItem(item.end, nodes, edges);
      
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
}

module.exports = TaskLibrary;