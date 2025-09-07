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

    // Check if entity_type is in the schema (exact match)
    if (this.graphSchema.nodeLabels.includes(entity_type)) {
      return {
        success: true,
        output: {
          valid: true,
          entity_type,
          exists_in_schema: true,
          confidence: 1.0
        }
      };
    }

    // Enhanced entity validation with fuzzy matching
    const session = this.driver.session();
    try {
      // First check for exact name/title matches in the data
      const exactQuery = `
        MATCH (n)
        WHERE toLower(n.name) = toLower($entity) OR toLower(n.title) = toLower($entity)
        RETURN n, labels(n) as labels
        LIMIT 5
      `;
      
      const exactResult = await session.run(exactQuery, { entity: entity_type });
      
      if (exactResult.records.length > 0) {
        return {
          success: true,
          output: {
            valid: true,
            entity_type,
            exists_in_schema: false,
            exists_in_data: true,
            confidence: 1.0,
            match_type: 'exact',
            sample_data: exactResult.records.map(r => ({
              node: r.get('n').properties,
              labels: r.get('labels')
            }))
          }
        };
      }

      // Check for partial/fuzzy matches with enhanced search
      const fuzzyQuery = `
        MATCH (n)
        WHERE toLower(n.name) CONTAINS toLower($entity) 
          OR toLower(n.title) CONTAINS toLower($entity)
          OR ANY(label IN labels(n) WHERE toLower(label) CONTAINS toLower($entity))
        RETURN n, labels(n) as labels, 
               CASE 
                 WHEN toLower(n.name) CONTAINS toLower($entity) THEN n.name
                 WHEN toLower(n.title) CONTAINS toLower($entity) THEN n.title
                 ELSE labels(n)[0]
               END as matched_field
        ORDER BY size(matched_field) ASC
        LIMIT 10
      `;
      
      const fuzzyResult = await session.run(fuzzyQuery, { entity: entity_type });
      
      if (fuzzyResult.records.length > 0) {
        // Calculate similarity scores for better matching
        const matches = fuzzyResult.records.map(r => {
          const node = r.get('n');
          const labels = r.get('labels');
          const matchedField = r.get('matched_field');
          
          // Calculate similarity score
          const similarity = this.calculateEntitySimilarity(entity_type, matchedField);
          
          return {
            node: node.properties,
            labels,
            matched_field: matchedField,
            similarity_score: similarity
          };
        });
        
        // Sort by similarity and take best matches
        const bestMatches = matches
          .sort((a, b) => b.similarity_score - a.similarity_score)
          .slice(0, 5);
        
        const bestScore = bestMatches[0].similarity_score;
        
        return {
          success: true,
          output: {
            valid: bestScore > 0.3, // Threshold for valid fuzzy match
            entity_type,
            exists_in_schema: false,
            exists_in_data: true,
            confidence: bestScore,
            match_type: 'fuzzy',
            sample_data: bestMatches,
            suggested_entities: bestMatches.slice(0, 3).map(match => match.matched_field)
          }
        };
      }

      // No matches found - provide smart suggestions
      const smartSuggestions = this.getSmartEntitySuggestions(entity_type);
      
      return {
        success: true,
        output: {
          valid: false,
          entity_type,
          exists_in_schema: false,
          exists_in_data: false,
          confidence: 0.0,
          match_type: 'none',
          suggested_entities: smartSuggestions,
          suggestion_reason: 'Based on contextual similarity and common patterns'
        }
      };
    } catch (error) {
      console.error('Entity validation error:', error);
      return {
        success: false,
        error: `Failed to validate entity: ${entity_type}`,
        output: { valid: false, entity_type, confidence: 0.0 }
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
    
    const { 
      goal, 
      entities, 
      context, 
      exploration_mode,
      // New LLM-first parameters
      query_type,
      operation_type,
      cypher_strategy,
      proxy_context,
      analysis_type,
      comparison_goal
    } = params;
    
    if (!goal) {
      return { success: false, error: 'Missing goal parameter' };
    }

    // Handle exploration mode with special query generation
    if (exploration_mode) {
      return this.generateExplorationQuery(goal, entities, context);
    }

    // Handle different query types with specialized prompts
    if (query_type === 'company_proxy') {
      return this.generateCompanyProxyCypher(params);
    }

    if (operation_type && ['exclusion', 'inclusion'].includes(operation_type)) {
      return this.generateAnalyticalCypher(params);
    }

    if (query_type === 'comparison') {
      return this.generateComparisonCypher(params);
    }

    // Handle enhanced business intelligence mode with multi-level strategy
    if (params.business_intelligence_mode) {
      return this.generateBusinessIntelligenceCypher(params);
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
❌ {name: 'Commercial Banking'}                      // ERROR: Single quotes in property values cause parsing errors
❌ {name: 'Retail Banking'}                          // ERROR: Single quotes are invalid in Cypher string literals

✅ CORRECT PATTERNS - Use these instead:
✅ MATCH path = (industry:Industry)-[:HAS_SECTOR]->(sector:Sector) RETURN path
✅ MATCH (industry:Industry)-[r:HAS_SECTOR]->(sector:Sector) RETURN industry, r, sector
✅ MATCH path = (a)-[*1..3]->(b) RETURN nodes(path), relationships(path)
✅ MATCH (a:Sector)-[r1:EXPERIENCES]->(shared:PainPoint)<-[r2:EXPERIENCES]-(b:Department) RETURN a, r1, shared, r2, b
✅ {name: "Commercial Banking"}                      // CORRECT: Double quotes for string literals
✅ {name: "Retail Banking"}                          // CORRECT: Double quotes for string literals

📝 STRING LITERAL FORMATTING RULES:
- ALWAYS use double quotes ("") for string literals in property values
- NEVER use single quotes ('') - they cause parsing errors
- Example: MATCH (s:Sector {name: "Commercial Banking"}) - CORRECT
- Example: MATCH (s:Sector {name: 'Commercial Banking'}) - WRONG, will fail!

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

      // Clean LLM response for JSON parsing
      let cleanResponse = response.trim();
      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      }
      if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      const result = JSON.parse(cleanResponse);
      
      // LLM-based self-validation and correction
      const llmValidatedResult = await this.llmValidateCypherQuery(result);
      
      // Traditional validation and fixing
      const validatedResult = this.validateAndFixCypherQuery(llmValidatedResult);
      
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

  async generateCompanyProxyCypher(params) {
    console.log('[TaskLibrary] Generating company proxy Cypher query');
    
    const { goal, entities, proxy_context } = params;
    
    const prompt = `
Generate a Cypher query that uses proxy entities to represent a real company.

# Graph Schema
${this.graphSchema.relationships.join('\n')}

# Query Goal
${goal}

# Proxy Entities (representing the company)
${entities ? entities.join(', ') : 'None specified'}

# Proxy Context
${proxy_context || 'Using closest relevant sectors'}

# Your Task
Create a Cypher query that finds relevant data for these proxy entities while being transparent about the proxy approach.

⚠️ CRITICAL Cypher Syntax Rules:
- ALWAYS include relationship variables in RETURN statements
- For visualization: RETURN node1, relationship, node2 
- Never use relationships(node) - only relationships(path)

Respond with ONLY pure JSON:
{
  "query": "MATCH (sector:Sector)-[r:EXPERIENCES]->(pain:PainPoint) WHERE sector.name IN $proxyEntities RETURN sector, r, pain",
  "params": {"proxyEntities": ${JSON.stringify(entities || [])}},
  "explanation": "Finding pain points for proxy sectors representing the company",
  "connectionStrategy": "proxy_mapping"
}
`;

    try {
      const response = await this.llmManager.generateText(prompt, {
        temperature: 0.1,
        maxTokens: 300
      });

      // Clean LLM response for JSON parsing
      let cleanResponse = response.trim();
      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      }
      if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      const result = JSON.parse(cleanResponse);
      
      // LLM-based self-validation and correction
      const llmValidatedResult = await this.llmValidateCypherQuery(result);
      
      // Traditional validation and fixing
      const validatedResult = this.validateAndFixCypherQuery(llmValidatedResult);
      
      return { success: true, output: validatedResult };
    } catch (error) {
      console.error('Company proxy Cypher generation error:', error);
      return { success: false, error: `Failed to generate company proxy query: ${error.message}` };
    }
  }

  async generateAnalyticalCypher(params) {
    console.log('[TaskLibrary] Generating analytical Cypher query');
    
    const { goal, entities, operation_type, cypher_strategy } = params;
    
    const prompt = `
Generate a Cypher query for analytical operations like exclusions, inclusions, and relationship analysis.

# Graph Schema
${this.graphSchema.relationships.join('\n')}

# Query Goal
${goal}

# Primary Entities
${entities ? entities.join(', ') : 'None specified'}

# Operation Type
${operation_type}

# Cypher Strategy
${cypher_strategy || 'NOT_EXISTS'}

# Your Task
Create an analytical Cypher query based on the operation type.

# Analytical Pattern Examples:
## Exclusion (NOT EXISTS):
- "painpoints without projects": MATCH (p:PainPoint) WHERE NOT EXISTS((p)<-[:ADDRESSES]-(:ProjectOpportunity)) RETURN p
- "sectors without opportunities": MATCH (s:Sector) WHERE NOT EXISTS((s)-[:HAS_OPPORTUNITY]->(:ProjectOpportunity)) RETURN s

## Inclusion (EXISTS):
- "sectors with pain points": MATCH (s:Sector) WHERE EXISTS((s)-[:EXPERIENCES]->(:PainPoint)) RETURN s
- "departments having projects": MATCH (d:Department) WHERE EXISTS((d)-[:HAS_OPPORTUNITY]->(:ProjectOpportunity)) RETURN d

⚠️ CRITICAL: For graph visualization, include relationships when possible:
- MATCH (p:PainPoint) WHERE NOT EXISTS((p)<-[:ADDRESSES]-(:ProjectOpportunity)) OPTIONAL MATCH (p)<-[r:EXPERIENCES]-(entity) RETURN p, r, entity

Respond with ONLY pure JSON:
{
  "query": "MATCH... WHERE... RETURN...",
  "params": {},
  "explanation": "Brief explanation of the analytical query",
  "connectionStrategy": "exclusion|inclusion|relationship_analysis"
}
`;

    try {
      const response = await this.llmManager.generateText(prompt, {
        temperature: 0.1,
        maxTokens: 400
      });

      // Clean LLM response for JSON parsing
      let cleanResponse = response.trim();
      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      }
      if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      const result = JSON.parse(cleanResponse);
      
      // LLM-based self-validation and correction
      const llmValidatedResult = await this.llmValidateCypherQuery(result);
      
      // Traditional validation and fixing
      const validatedResult = this.validateAndFixCypherQuery(llmValidatedResult);
      
      return { success: true, output: validatedResult };
    } catch (error) {
      console.error('Analytical Cypher generation error:', error);
      return { success: false, error: `Failed to generate analytical query: ${error.message}` };
    }
  }

  async generateComparisonCypher(params) {
    console.log('[TaskLibrary] Generating comparison Cypher query');
    
    const { goal, entities, comparison_goal } = params;
    
    const prompt = `
Generate a Cypher query for comparing different entities or analyzing relationships between them.

# Graph Schema
${this.graphSchema.relationships.join('\n')}

# Query Goal
${goal}

# Entities to Compare
${entities ? entities.join(', ') : 'None specified'}

# Comparison Goal
${comparison_goal || 'Compare the specified entities'}

# Your Task
Create a query that returns data suitable for comparison analysis.

# Comparison Pattern Examples:
- Compare pain points between sectors: MATCH (s:Sector)-[r1:EXPERIENCES]->(p:PainPoint) RETURN s, r1, p
- Compare opportunities by department: MATCH (d:Department)-[r1:HAS_OPPORTUNITY]->(o:ProjectOpportunity) RETURN d, r1, o
- Shared connections: MATCH (a)-[r1]->(shared)<-[r2]-(b) WHERE labels(a) = ["Sector"] AND labels(b) = ["Department"] RETURN a, r1, shared, r2, b

⚠️ CRITICAL: Always include relationships for proper graph visualization.

Respond with ONLY pure JSON:
{
  "query": "MATCH... RETURN...",
  "params": {},
  "explanation": "Brief explanation of the comparison query",
  "connectionStrategy": "comparison"
}
`;

    try {
      const response = await this.llmManager.generateText(prompt, {
        temperature: 0.1,
        maxTokens: 350
      });

      // Clean LLM response for JSON parsing
      let cleanResponse = response.trim();
      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      }
      if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      const result = JSON.parse(cleanResponse);
      
      // LLM-based self-validation and correction
      const llmValidatedResult = await this.llmValidateCypherQuery(result);
      
      // Traditional validation and fixing
      const validatedResult = this.validateAndFixCypherQuery(llmValidatedResult);
      
      return { success: true, output: validatedResult };
    } catch (error) {
      console.error('Comparison Cypher generation error:', error);
      return { success: false, error: `Failed to generate comparison query: ${error.message}` };
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
      
      // Try LLM-powered error analysis and auto-correction
      const recoveryResult = await this.attemptQueryRecovery(query, error.message, queryParams);
      
      if (recoveryResult.success) {
        console.log(`[TaskLibrary] 🔧 Auto-recovered from Cypher error using LLM correction`);
        return recoveryResult;
      }
      
      // Fall back to traditional error handling
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
        errorType: isPathNodeError ? 'path_node_mismatch' : 'execution_error',
        originalQuery: query,
        recoveryAttempted: true
      };
    } finally {
      await session.close();
    }
  }

  async analyzeAndSummarize(params) {
    console.log('[TaskLibrary] Executing analyze_and_summarize:', params);
    
    const { 
      dataset1, 
      dataset2, 
      dataset, 
      comparison_type, 
      analysis_goal,
      // Enhanced business context parameters
      business_context,
      consultant_response,
      proxy_explanation,
      original_company,
      proxy_sectors,
      analysis_type,
      expected_result,
      // New gap analysis parameters
      missing_sectors,
      business_impact_of_gaps,
      data_completeness_score
    } = params;
    
    // Handle both single dataset and comparison scenarios
    let primaryDataset = dataset1 || dataset;
    let secondaryDataset = dataset2;
    
    if (!primaryDataset && !secondaryDataset) {
      return { success: false, error: 'Missing dataset(s) to analyze' };
    }

    // Determine analysis type (comparison, proxy, analytical, standard)
    const isComparison = secondaryDataset && primaryDataset;
    const isProxyAnalysis = (proxy_explanation || consultant_response || business_context) && original_company;
    const isAnalyticalAnalysis = analysis_type && ['exclusion', 'inclusion', 'relationship_analysis'].includes(analysis_type);
    
    let prompt;
    
    if (isProxyAnalysis) {
      const missingSectorsArray = typeof missing_sectors === 'string' 
      ? missing_sectors.split(', ').filter(s => s.trim())
      : (Array.isArray(missing_sectors) ? missing_sectors : []);
    const hasDataGaps = missingSectorsArray.length > 0;
      
      prompt = `
You are an AI consultant providing analysis for ${original_company}. Analyze graph database results using proxy sectors with business intelligence and full transparency about data gaps.

# Dataset from Database
${JSON.stringify(primaryDataset, null, 2)}

# Business Intelligence Context
Company: ${original_company}
Business Context: ${business_context || 'Major company in relevant industry'}
Proxy Sectors Used: ${proxy_sectors || 'Database sectors representing similar business challenges'}

# Data Completeness Assessment
${hasDataGaps ? `
⚠️ DATA GAP ANALYSIS:
Missing Business Sectors: ${missingSectorsArray.join(', ')}
Business Impact: ${business_impact_of_gaps}
Data Completeness Score: ${data_completeness_score}/1.0

These missing sectors represent ${original_company}'s actual business divisions that aren't captured in our database.
` : 'Database provides good coverage for this company\'s business model.'}

# Consultant Approach
${consultant_response || proxy_explanation || 'Using proxy sectors for analysis'}

# Analysis Goal
${analysis_goal || 'Provide strategic insights for the client using proxy data and business intelligence'}

# Your Enhanced Consultant Response
Provide a professional analysis combining database insights with business knowledge AND data gap awareness. Structure your response as:

1. **Business Context**: Brief overview of ${original_company} and its market position (using business intelligence)
2. **Proxy Analysis**: Key findings from the database sectors that represent similar operational challenges
3. **Strategic Insights**: How these findings apply to ${original_company}'s business challenges and opportunities
4. **Data Completeness Assessment**: ${hasDataGaps ? 'Highlight missing business sectors and their impact on analysis depth' : 'Confirm analysis coverage is comprehensive'}
5. **Recommendations**: Actionable recommendations based on both database patterns and business knowledge
6. **Methodology**: Clear explanation of the proxy approach, knowledge sources, and analysis limitations

${hasDataGaps ? `
CRITICAL: Proactively highlight that ${original_company} operates in additional business sectors (${missingSectorsArray.join(', ')}) that aren't represented in our database. Explain what additional insights would be available with complete sector data.
` : ''}

Be transparent about what comes from the database vs. business intelligence while providing valuable consultant-level insights and honest gap analysis.
`;
    } else if (isAnalyticalAnalysis) {
      prompt = `
Analyze the results of an analytical query and provide structured insights.

# Dataset
${JSON.stringify(primaryDataset, null, 2)}

# Analysis Type
${analysis_type}

# Expected Result Context
${expected_result || 'Analytical findings'}

# Analysis Goal
${analysis_goal || 'Provide insights from analytical query results'}

# Your Task
Analyze the analytical query results and provide clear insights.

For ${analysis_type} analysis, focus on:
- What entities were found/excluded
- Patterns in the ${analysis_type} results
- Implications of these findings
- Actionable recommendations

Structure your response clearly with specific insights and recommendations.
`;
    } else if (isComparison) {
      prompt = `
You are an AI consultant providing comparative analysis to support strategic decision-making. Analyze the following business intelligence data.

# Dataset 1
${JSON.stringify(primaryDataset, null, 2)}

# Dataset 2
${JSON.stringify(secondaryDataset, null, 2)}

# Analysis Framework
Comparison Type: ${comparison_type || 'Strategic Comparative Analysis'}
Business Objective: ${analysis_goal || 'Identify strategic patterns and opportunities across domains'}

# Your Consultant Analysis
Provide a professional comparative analysis structured as:

1. **Executive Summary**: Key strategic differences and similarities at a glance
2. **Detailed Comparison**: Specific patterns, trends, and variations between the datasets
3. **Strategic Insights**: Business implications and opportunities identified from the comparison
4. **Recommendations**: Actionable recommendations based on the comparative findings
5. **Risk Assessment**: Potential challenges or limitations revealed by the analysis

Focus on strategic value and actionable insights that support business decision-making.
`;
    } else {
      // Standard single dataset analysis
      prompt = `
You are an AI consultant providing strategic analysis to support business decision-making. Analyze the following project opportunity data.

# Dataset from Database
${JSON.stringify(primaryDataset, null, 2)}

# Analysis Framework
Analysis Type: ${comparison_type || analysis_type || 'Strategic Business Analysis'}
Business Objective: ${analysis_goal || 'Identify patterns, opportunities, and strategic insights'}

# Your Consultant Analysis
Provide a professional business analysis structured as:

1. **Executive Summary**: Key findings and strategic implications at a glance
2. **Pattern Analysis**: Important trends, relationships, and business patterns identified
3. **Opportunity Assessment**: Potential business opportunities and areas for development
4. **Strategic Insights**: Business implications and strategic considerations
5. **Recommendations**: Actionable recommendations for stakeholders

Focus on translating data patterns into strategic business insights and actionable recommendations.
`;
    }

    try {
      const response = await this.llmManager.generateText(prompt, {
        temperature: 0.3,
        maxTokens: 600
      });

      return {
        success: true,
        output: {
          analysis: response,
          analysis_context: {
            type: isProxyAnalysis ? 'proxy_analysis' : 
                  isAnalyticalAnalysis ? 'analytical_analysis' : 
                  isComparison ? 'comparative_analysis' : 'single_dataset_analysis',
            is_proxy: isProxyAnalysis,
            is_analytical: isAnalyticalAnalysis,
            is_comparison: isComparison,
            original_company: original_company || null,
            proxy_explanation: proxy_explanation || null,
            analysis_type: analysis_type || null,
            datasets_analyzed: isComparison ? 2 : 1
          }
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
    
    const { 
      message, 
      suggestions, 
      conversation_state,
      alternative_approach,
      helpful_guidance,
      entity_issues,
      corrected_entities,
      show_exploration_data,
      provide_final_answer,
      // BUSINESS CONTEXT PARAMETERS - These should be preserved, not overridden
      business_context_aware,
      detected_company,
      business_context_error,
      original_company,
      fallback_context
    } = params;
    
    // CRITICAL: Preserve business context workflow - don't fall back to legacy responses
    if (business_context_aware || detected_company || business_context_error || original_company) {
      console.log('[TaskLibrary] ✅ PRESERVING BUSINESS CONTEXT in clarify_with_user:', {
        business_context_aware,
        detected_company,
        business_context_error,
        original_company
      });
      
      // Return the business context response as-is, don't override with legacy logic
      return {
        success: true,
        output: {
          needsClarification: true,
          message: message || `I understand you're asking about ${detected_company || original_company}, let me help you explore relevant business opportunities.`,
          suggestions: suggestions || [
            'Show me all industries',
            'Find pain points in banking',
            'Browse available sectors',
            'What projects are similar to this business model?'
          ],
          business_context_aware: true,
          detected_company: detected_company,
          business_context_error: business_context_error,
          original_company: original_company,
          fallback_context: fallback_context,
          preserves_business_context: true
        }
      };
    }
    
    // Check if we should provide a final answer instead of more clarification
    if (provide_final_answer || conversation_state === 'persistent_non_existent') {
      return await this.provideFinalAnswer(params);
    }
    
    // Standard clarification flow for non-business-context queries
    let enhancedMessage = message || 'I need more information to help you better.';
    let enhancedSuggestions = suggestions || [
      'Show me all industries',
      'Find pain points in banking',
      'Compare sectors and departments',
      'Add a new project opportunity'
    ];

    // Add conversation state awareness to the response
    if (conversation_state === 'post_rejection') {
      enhancedMessage += " I want to make sure I understand what you're looking for.";
    } else if (conversation_state === 'meta_conversation') {
      enhancedMessage += " Let me help you navigate our conversation more effectively.";
    } else if (conversation_state === 'repeated_failure') {
      enhancedMessage += " I'll show you what's available so we can find what you need together.";
    }
    
    return {
      success: true,
      output: {
        needsClarification: true,
        message: enhancedMessage,
        suggestions: enhancedSuggestions,
        conversation_state: conversation_state,
        alternative_approach: alternative_approach,
        helpful_guidance: helpful_guidance,
        entity_issues: entity_issues,
        corrected_entities: corrected_entities,
        show_exploration_data: show_exploration_data,
        conversation_aware: true,
        business_context_preserved: false
      }
    };
  }

  // NEW METHOD: Provide definitive final answer when clarification loops occur
  async provideFinalAnswer(params) {
    console.log('[TaskLibrary] Providing final answer to break clarification loop');
    
    const { entity_issues, corrected_entities, message } = params;
    
    // Generate a comprehensive view of what IS available
    const session = this.driver.session();
    try {
      // Get all available entities from the database
      const availableEntitiesQuery = `
        MATCH (i:Industry)
        OPTIONAL MATCH (i)-[:HAS_SECTOR]->(s:Sector)
        WITH i, collect(DISTINCT s.name) as sectors
        RETURN {
          industry: i.name,
          sectors: sectors
        } as industryData
        ORDER BY i.name
        UNION
        MATCH (s:Sector)
        WHERE NOT exists((:Industry)-[:HAS_SECTOR]->(s))
        RETURN {
          industry: null,
          sectors: [s.name]
        } as industryData
      `;
      
      const result = await session.run(availableEntitiesQuery);
      const availableData = result.records.map(r => r.get('industryData'));
      
      // Format the final answer
      let finalMessage = '';
      
      if (entity_issues && entity_issues.length > 0) {
        const missingEntity = entity_issues[0].entity;
        finalMessage = `I don't have "${missingEntity}" in our database. `;
      }
      
      finalMessage += "Here's what IS available in our AI project catalog:\n\n";
      
      // List all industries and sectors clearly
      const industries = availableData.filter(data => data.industry);
      const standaloneSectors = availableData.filter(data => !data.industry);
      
      if (industries.length > 0) {
        finalMessage += "**Industries and their Sectors:**\n";
        industries.forEach(data => {
          finalMessage += `• ${data.industry}`;
          if (data.sectors && data.sectors.length > 0) {
            finalMessage += `: ${data.sectors.join(', ')}`;
          }
          finalMessage += '\n';
        });
      }
      
      if (standaloneSectors.length > 0) {
        finalMessage += "\n**Additional Sectors:**\n";
        standaloneSectors.forEach(data => {
          if (data.sectors && data.sectors.length > 0) {
            data.sectors.forEach(sector => {
              finalMessage += `• ${sector}\n`;
            });
          }
        });
      }
      
      finalMessage += "\n**What you can ask:**\n";
      finalMessage += "• 'What projects are available for [Sector Name]?'\n";
      finalMessage += "• 'Show me pain points in [Sector Name]'\n";
      finalMessage += "• 'What AI opportunities exist in [Industry Name]?'\n";
      finalMessage += "• 'Browse all projects'\n";
      
      // Create exploration suggestions based on actual data
      const exploratorySuggestions = [];
      if (industries.length > 0) {
        exploratorySuggestions.push(`Show me projects in ${industries[0].industry}`);
        if (industries[0].sectors && industries[0].sectors.length > 0) {
          exploratorySuggestions.push(`Find opportunities in ${industries[0].sectors[0]}`);
        }
      }
      exploratorySuggestions.push('Browse all available projects');
      exploratorySuggestions.push('Show me the complete project catalog');
      
      return {
        success: true,
        output: {
          needsClarification: false, // This is the key change - no more clarification needed
          isFinalAnswer: true,
          message: finalMessage,
          suggestions: exploratorySuggestions,
          availableData: availableData,
          terminates_clarification_loop: true
        }
      };
      
    } catch (error) {
      console.error('Error generating final answer:', error);
      
      // Fallback final answer if database query fails
      return {
        success: true,
        output: {
          needsClarification: false,
          isFinalAnswer: true,
          message: "I couldn't find that specific item in our database. Our AI project catalog contains opportunities in Banking and Insurance industries, covering sectors like Retail Banking, Commercial Banking, Investment Banking, and various insurance sectors. You can ask about projects, pain points, or opportunities in any of these areas.",
          suggestions: [
            'Show me all Banking projects',
            'Find Insurance opportunities', 
            'Browse available sectors',
            'What AI projects exist in Retail Banking?'
          ],
          terminates_clarification_loop: true
        }
      };
    } finally {
      await session.close();
    }
  }

  // LLM-based Cypher validation and self-correction
  async llmValidateCypherQuery(cypherResult) {
    if (!cypherResult || !cypherResult.query) {
      return cypherResult;
    }

    const validationPrompt = `
Review this Cypher query for syntax errors and correct any issues found.

# Original Query
${cypherResult.query}

# Common Issues to Check:
1. String literals - MUST use double quotes ("") not single quotes ('')
2. Property matching syntax - {name: "value"} not {name: 'value'}
3. Relationship patterns - ensure proper syntax
4. Variable naming - check for consistency

# Your Task
If you find syntax errors, provide a corrected version. If the query is correct, return it unchanged.

Respond with ONLY JSON in this format:
{
  "query": "corrected or original query",
  "wasChanged": true/false,
  "corrections": ["list of changes made"],
  "explanation": "brief explanation of what this query does",
  "connectionStrategy": "direct|indirect|both"
}
`;

    try {
      const response = await this.llmManager.generateText(validationPrompt, {
        temperature: 0.1,
        maxTokens: 300
      });

      // Clean LLM response for JSON parsing
      let cleanResponse = response.trim();
      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      }
      if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      const validationResult = JSON.parse(cleanResponse);
      
      if (validationResult.wasChanged) {
        console.log(`[TaskLibrary] 🔧 LLM auto-corrected Cypher query:`, validationResult.corrections);
        return {
          ...cypherResult,
          query: validationResult.query,
          explanation: validationResult.explanation || cypherResult.explanation,
          connectionStrategy: validationResult.connectionStrategy || cypherResult.connectionStrategy,
          _wasLLMCorrected: true,
          _llmCorrections: validationResult.corrections
        };
      }
      
      return cypherResult;
    } catch (error) {
      console.error('LLM Cypher validation error:', error);
      // Fall back to original result if LLM validation fails
      return cypherResult;
    }
  }

  // LLM-powered query error recovery
  async attemptQueryRecovery(originalQuery, errorMessage, queryParams = {}) {
    console.log(`[TaskLibrary] 🔍 Attempting LLM-powered query recovery for error: ${errorMessage}`);
    
    const recoveryPrompt = `
Analyze this Cypher query error and provide a corrected version.

# Failed Query
${originalQuery}

# Error Message
${errorMessage}

# Query Parameters
${JSON.stringify(queryParams, null, 2)}

# Graph Schema
${this.graphSchema.relationships.join('\n')}

# Your Task
1. Analyze the error message to understand what went wrong
2. Provide a corrected Cypher query that fixes the issue
3. Ensure the corrected query follows Neo4j syntax rules
4. Keep the query's original intent intact

# Common Error Fixes:
- Single quotes → Double quotes in string literals
- Missing relationship variables for graph visualization
- Invalid property matching syntax
- Node label formatting issues

Respond with ONLY JSON:
{
  "correctedQuery": "FIXED CYPHER QUERY HERE",
  "errorAnalysis": "Brief explanation of what was wrong",
  "changesMade": ["list of specific changes"],
  "confidence": 0.0-1.0
}
`;

    try {
      const response = await this.llmManager.generateText(recoveryPrompt, {
        temperature: 0.1,
        maxTokens: 400
      });

      // Clean LLM response for JSON parsing
      let cleanResponse = response.trim();
      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      }
      if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      const recoveryResult = JSON.parse(cleanResponse);
      
      if (recoveryResult.confidence >= 0.7 && recoveryResult.correctedQuery) {
        // Attempt to execute the corrected query
        const session = this.driver.session();
        try {
          console.log(`[TaskLibrary] 🔄 Retrying with corrected query: ${recoveryResult.correctedQuery}`);
          const result = await session.run(recoveryResult.correctedQuery, queryParams);
          
          const graphData = this.formatGraphData(result);
          
          return {
            success: true,
            output: {
              graphData,
              recordCount: result.records.length,
              nodeCount: graphData.nodes.length,
              edgeCount: graphData.edges.length
            },
            wasAutoRecovered: true,
            originalQuery: originalQuery,
            correctedQuery: recoveryResult.correctedQuery,
            errorAnalysis: recoveryResult.errorAnalysis,
            changesMade: recoveryResult.changesMade
          };
        } catch (retryError) {
          console.log(`[TaskLibrary] ❌ Retry with corrected query also failed: ${retryError.message}`);
          return { success: false, error: `Recovery attempt failed: ${retryError.message}` };
        } finally {
          await session.close();
        }
      } else {
        console.log(`[TaskLibrary] ⚠️  Low confidence recovery (${recoveryResult.confidence}), not attempting retry`);
        return { success: false, error: 'Low confidence in error recovery' };
      }
    } catch (error) {
      console.error('Query recovery analysis error:', error);
      return { success: false, error: `Recovery analysis failed: ${error.message}` };
    }
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

  // Helper methods for enhanced entity validation
  calculateEntitySimilarity(queryEntity, targetEntity) {
    const query = queryEntity.toLowerCase();
    const target = targetEntity.toLowerCase();
    
    // Multiple similarity scoring methods
    let score = 0;
    
    // 1. Exact containment (high weight)
    if (query === target) return 1.0;
    if (query.includes(target) || target.includes(query)) {
      score += 0.7;
    }
    
    // 2. Word-based matching
    const queryWords = query.split(/\s+/);
    const targetWords = target.split(/\s+/);
    
    const commonWords = queryWords.filter(word => 
      targetWords.some(tWord => tWord.includes(word) || word.includes(tWord))
    );
    
    if (commonWords.length > 0) {
      score += (commonWords.length / Math.max(queryWords.length, targetWords.length)) * 0.5;
    }
    
    // 3. Character-level similarity for short strings
    if (query.length <= 20 && target.length <= 20) {
      const editDistance = this.levenshteinDistance(query, target);
      const maxLen = Math.max(query.length, target.length);
      score += Math.max(0, (maxLen - editDistance) / maxLen * 0.3);
    }
    
    // 4. Special patterns for common entity types
    if (this.hasSpecialPatternMatch(query, target)) {
      score += 0.4;
    }
    
    return Math.min(score, 1.0);
  }

  hasSpecialPatternMatch(query, target) {
    // Special matching patterns for business domains
    const patterns = [
      { pattern: 'retail', matches: ['retail banking', 'consumer banking'] },
      { pattern: 'commercial', matches: ['commercial banking', 'business banking'] },
      { pattern: 'health', matches: ['health insurance', 'medical insurance'] },
      { pattern: 'property', matches: ['property insurance', 'home insurance'] },
      { pattern: 'life', matches: ['life insurance'] },
      { pattern: 'investment', matches: ['investment banking'] }
    ];
    
    for (const { pattern, matches } of patterns) {
      if (query.includes(pattern) && matches.some(match => target.includes(match))) {
        return true;
      }
    }
    
    return false;
  }

  levenshteinDistance(str1, str2) {
    const matrix = [];
    
    // Initialize matrix
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    // Fill matrix
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  getSmartEntitySuggestions(entity) {
    const entityLower = entity.toLowerCase();
    const suggestions = [];
    
    // Context-based suggestions
    if (entityLower.includes('retail') || entityLower.includes('consumer') || entityLower.includes('personal')) {
      suggestions.push('Retail Banking', 'Consumer Banking');
    }
    
    if (entityLower.includes('commercial') || entityLower.includes('business') || entityLower.includes('corporate')) {
      suggestions.push('Commercial Banking', 'Investment Banking');
    }
    
    if (entityLower.includes('health') || entityLower.includes('medical') || entityLower.includes('healthcare')) {
      suggestions.push('Health Insurance');
    }
    
    if (entityLower.includes('property') || entityLower.includes('home') || entityLower.includes('real estate')) {
      suggestions.push('Property Insurance');
    }
    
    if (entityLower.includes('life') || entityLower.includes('mortality')) {
      suggestions.push('Life Insurance');
    }
    
    if (entityLower.includes('casualty') || entityLower.includes('accident') || entityLower.includes('liability')) {
      suggestions.push('Casualty Insurance');
    }
    
    if (entityLower.includes('investment') || entityLower.includes('securities') || entityLower.includes('trading')) {
      suggestions.push('Investment Banking');
    }
    
    if (entityLower.includes('credit') || entityLower.includes('union')) {
      suggestions.push('Credit Unions');
    }
    
    if (entityLower.includes('online') || entityLower.includes('digital') || entityLower.includes('virtual')) {
      suggestions.push('Online Banking');
    }
    
    if (entityLower.includes('private') || entityLower.includes('wealth')) {
      suggestions.push('Private Banking');
    }
    
    // If no context-specific suggestions, provide general ones
    if (suggestions.length === 0) {
      suggestions.push('Banking', 'Insurance', 'Retail Banking', 'Commercial Banking');
    }
    
    // Remove duplicates and limit to top 4
    return [...new Set(suggestions)].slice(0, 4);
  }

  // Exploration mode query generation
  generateExplorationQuery(goal, entities, context) {
    console.log('[TaskLibrary] Generating exploration query for:', { goal, entities });
    
    // Create a comprehensive overview query
    let query = '';
    let explanation = '';
    
    if (entities && entities.includes('Industry')) {
      query = `
        MATCH (i:Industry)
        OPTIONAL MATCH (i)-[:HAS_SECTOR]->(s:Sector)
        RETURN i, s
        ORDER BY i.name
        LIMIT 20
      `;
      explanation = 'Show all industries and their associated sectors for exploration';
    } else if (entities && entities.includes('Sector')) {
      query = `
        MATCH (s:Sector)
        OPTIONAL MATCH (s)-[:HAS_OPPORTUNITY]->(po:ProjectOpportunity)
        RETURN s, po
        ORDER BY s.name
        LIMIT 20
      `;
      explanation = 'Show all sectors and available project opportunities';
    } else {
      // Default comprehensive query
      query = `
        MATCH (i:Industry)-[:HAS_SECTOR]->(s:Sector)
        RETURN i, s
        ORDER BY i.name, s.name
        LIMIT 15
      `;
      explanation = 'Show overview of industries and sectors available for exploration';
    }
    
    return {
      success: true,
      output: {
        query: query.trim(),
        params: {},
        explanation: explanation,
        connectionStrategy: 'exploration',
        exploration_mode: true
      }
    };
  }

  async generateBusinessIntelligenceCypher(params) {
    console.log('[TaskLibrary] Generating business intelligence Cypher with multi-level strategy');
    
    const { goal, entities, proxy_context, multi_level_strategy } = params;
    
    const prompt = `
Generate an intelligent Cypher query that uses multi-level business intelligence to find the most relevant data.

# Graph Schema
${this.graphSchema.relationships.join('\n')}

# Goal
${goal}

# Available Entities (validated from database)
${entities ? entities.join(', ') : 'Banking, Insurance'}

# Business Intelligence Context
${proxy_context || 'Using business intelligence to map company to database entities'}

# Multi-Level Strategy
${multi_level_strategy || 'Query both industry and sector levels for comprehensive results'}

# Your Task
Generate a Cypher query that intelligently queries both industry AND sector levels to find the most comprehensive results.

Strategy:
1. First try specific sectors if they exist (e.g., "Retail Banking", "Commercial Banking")
2. Fall back to industry level if sectors don't exist (e.g., "Banking")
3. Include both approaches in a UNION query for maximum coverage

⚠️ CRITICAL Cypher Syntax Rules:
- ALWAYS include relationship variables in RETURN statements for graph visualization
- For visualization: RETURN industry, r1, sector, r2, projectOpportunity (not just nodes)
- Use UNION ALL for combining industry and sector queries
- Handle cases where entities might be industries OR sectors intelligently

Example intelligent query structure:
MATCH (industry:Industry)-[r1:HAS_SECTOR]->(sector:Sector)-[r2:HAS_OPPORTUNITY]->(project:ProjectOpportunity)
WHERE industry.name IN ["Banking"] OR sector.name IN ["Retail Banking", "Commercial Banking"]
RETURN industry, r1, sector, r2, project

Respond with ONLY pure JSON:
{
  "query": "MATCH... RETURN...",
  "params": {},
  "explanation": "Multi-level business intelligence query strategy explanation",
  "connectionStrategy": "intelligent_multi_level"
}
`;

    try {
      const response = await this.llmManager.generateText(prompt, {
        temperature: 0.1,
        maxTokens: 400
      });

      // Clean LLM response for JSON parsing
      let cleanResponse = response.trim();
      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      }
      if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      const result = JSON.parse(cleanResponse);
      
      // LLM-based self-validation and correction
      const llmValidatedResult = await this.llmValidateCypherQuery(result);
      
      // Traditional validation and fixing
      const validatedResult = this.validateAndFixCypherQuery(llmValidatedResult);
      
      return { success: true, output: validatedResult };
    } catch (error) {
      console.error('Business intelligence Cypher generation error:', error);
      return { success: false, error: `Failed to generate business intelligence query: ${error.message}` };
    }
  }
}

module.exports = TaskLibrary;