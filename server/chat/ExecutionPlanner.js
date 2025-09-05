const llmManager = require('../llm/LLMManager');

class ExecutionPlanner {
  constructor(driver = null) {
    this.llmManager = llmManager;
    this.driver = driver;
    
    // Available tasks that can be used in execution plans
    this.availableTasks = [
      'validate_entity',
      'find_connection_paths', 
      'generate_cypher',
      'execute_cypher',
      'analyze_and_summarize',
      'generate_creative_text',
      'clarify_with_user'
    ];
    
    // Graph schema for context
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

  async generateExecutionPlan(query, conversationHistory = []) {
    console.log(`[ExecutionPlanner] Generating LLM-first execution plan for query: "${query}"`);
    
    try {
      // LLM Call #1: Intent Classification & Entity Recognition
      const intentAnalysis = await this.classifyQueryWithEntityAnalysis(query, conversationHistory);
      console.log(`[ExecutionPlanner] Intent analysis:`, intentAnalysis);
      
      // Handle different query types with appropriate LLM processing
      switch (intentAnalysis.query_type) {
        case 'company_proxy':
          return this.handleCompanyProxyQuery(query, intentAnalysis, conversationHistory);
          
        case 'analytical':
          return this.handleAnalyticalQuery(query, intentAnalysis, conversationHistory);
          
        case 'comparison':
          return this.handleComparisonQuery(query, intentAnalysis, conversationHistory);
          
        case 'lookup':
        default:
          return this.handleLookupQuery(query, intentAnalysis, conversationHistory);
      }
      
    } catch (error) {
      console.error('[ExecutionPlanner] LLM-first processing failed:', error);
      
      // Fallback to basic clarification
      return {
        plan: [
          {
            task_type: 'clarify_with_user',
            params: {
              message: 'I need more details to understand your request. Could you be more specific?',
              suggestions: ['Show me all industries', 'Find pain points in banking', 'Compare sectors and departments']
            },
            on_failure: 'halt',
            reasoning: 'LLM processing failed, requesting clarification'
          }
        ]
      };
    }
  }

  async classifyQueryWithEntityAnalysis(query, conversationHistory) {
    console.log('[ExecutionPlanner] LLM Call #1: Intent Classification & Entity Recognition');
    
    const historyContext = conversationHistory
      .slice(-4) // Last 2 exchanges
      .map(msg => `${msg.type}: ${msg.content}`)
      .join('\n');

    const prompt = `
Analyze this user query to understand the intent and identify entities mentioned.

# Graph Database Schema
Node Types: ${this.graphSchema.nodeLabels.join(', ')}
Relationships: ${this.graphSchema.relationships.join(', ')}

# Recent Conversation Context
${historyContext || 'No previous context'}

# User Query
"${query}"

# Your Task
Classify the query intent and identify entities. Focus on understanding natural language patterns rather than exact matches.

Respond with ONLY a JSON object with this structure:
{
  "query_type": "lookup|analytical|comparison|company_proxy",
  "entities_mentioned": ["entity1", "entity2"],
  "unknown_entities": ["company_name"],
  "requires_company_mapping": true/false,
  "analytical_operation": "exclusion|inclusion|comparison|relationship_analysis",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of the classification"
}

# Query Type Guidelines
- "lookup": Simple requests like "show me banking sectors", "find pain points"
- "analytical": Complex operations like "painpoints without projects", "sectors not connected to departments"
- "comparison": "compare X vs Y", "differences between A and B"
- "company_proxy": Questions about real companies not in the graph (Tesla, Amazon, Netflix, etc.)

# Analytical Operations
- "exclusion": queries with "without", "not", "except", "lacking"
- "inclusion": queries with "with", "having", "containing"  
- "relationship_analysis": queries about connections, paths, relationships

Focus on intent understanding, not exact entity matching.
`;

    const response = await this.llmManager.generateText(prompt, {
      temperature: 0.1,
      maxTokens: 300
    });

    console.log(`[ExecutionPlanner] Raw LLM response: "${response}"`);
    
    // Clean and parse JSON response
    let cleanResponse = response.trim();
    
    // Remove common markdown artifacts
    if (cleanResponse.startsWith('```json')) {
      cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    }
    if (cleanResponse.startsWith('```')) {
      cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    try {
      return JSON.parse(cleanResponse);
    } catch (parseError) {
      console.error('[ExecutionPlanner] JSON parse error:', parseError);
      console.error('[ExecutionPlanner] Clean response was:', cleanResponse);
      throw new Error(`Failed to parse LLM response as JSON: ${parseError.message}`);
    }
  }

  async handleCompanyProxyQuery(query, intentAnalysis, conversationHistory) {
    console.log('[ExecutionPlanner] Handling company proxy query');
    
    // LLM Call #2: Company-to-Graph Mapping
    const companyMapping = await this.mapCompanyToGraphEntities(
      intentAnalysis.unknown_entities[0], 
      intentAnalysis
    );
    
    // LLM Call #3: Query Transformation
    const transformedQuery = await this.transformQueryWithProxies(
      query, 
      companyMapping, 
      intentAnalysis
    );
    
    // LLM Call #4: Generate Final Execution Plan
    return this.generateFinalExecutionPlan(transformedQuery, companyMapping);
  }

  async mapCompanyToGraphEntities(companyName, intentAnalysis) {
    console.log(`[ExecutionPlanner] LLM Call #2: Company-to-Graph Mapping for "${companyName}"`);
    
    const prompt = `
You are an AI consultant helping analyze project opportunities. A user has asked about "${companyName}" which is not in our project database, but you can provide business intelligence and map it to relevant database entities.

# Available Database Industries and Sectors:
- Banking: Retail Banking, Commercial Banking, Investment Banking, Private Banking, Credit Unions, Online Banking
- Insurance: Life Insurance, Health Insurance, Property Insurance, Casualty Insurance

# Company to Analyze
"${companyName}"

# Original Query Context
"${intentAnalysis.reasoning}"

# Your Consultant Role
1. Provide business intelligence about this company (market position, size, key business areas)
2. Map it to the most relevant database sectors for project opportunity analysis
3. Be transparent about what's business knowledge vs. what's in our database

Respond with ONLY a JSON object:
{
  "company": "${companyName}",
  "business_context": "Brief description of company's market position, size, and key business areas",
  "primary_industries": ["Banking", "Insurance"],
  "relevant_sectors": ["Sector1", "Sector2", "Sector3"],
  "reasoning": "Why these specific sectors represent similar business challenges and opportunities",
  "confidence": 0.0-1.0,
  "mapping_strategy": "use_closest_sectors|use_industry_broad|use_specific_match",
  "knowledge_source": "business_intelligence",
  "transparency_note": "Clear statement about using business knowledge for proxy mapping"
}

# Example Business Intelligence Responses:
- ANZ Bank → business_context: "One of Australia's 'Big Four' banks, major retail and commercial banking operations" + ["Banking"] + ["Retail Banking", "Commercial Banking"]
- Tesla → business_context: "Leading electric vehicle manufacturer with energy storage business" + map to closest available sectors
- Amazon → business_context: "Global e-commerce and cloud services leader" + map to closest available sectors

Focus on providing valuable business context while mapping to sectors with similar operational challenges and project opportunities.
`;

    const response = await this.llmManager.generateText(prompt, {
      temperature: 0.2,
      maxTokens: 200
    });

    console.log(`[ExecutionPlanner] Raw company mapping response: "${response}"`);
    
    // Clean and parse JSON response
    let cleanResponse = response.trim();
    
    if (cleanResponse.startsWith('```json')) {
      cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    }
    if (cleanResponse.startsWith('```')) {
      cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    try {
      return JSON.parse(cleanResponse);
    } catch (parseError) {
      console.error('[ExecutionPlanner] Company mapping JSON parse error:', parseError);
      throw new Error(`Failed to parse company mapping as JSON: ${parseError.message}`);
    }
  }

  async transformQueryWithProxies(originalQuery, companyMapping, intentAnalysis) {
    console.log('[ExecutionPlanner] LLM Call #3: Query Transformation with Proxies');
    
    const prompt = `
As an AI consultant, transform the query to use database entities as proxies for the company, providing transparent business context.

# Original Query
"${originalQuery}"

# Company Business Intelligence
Company: ${companyMapping.company}
Business Context: ${companyMapping.business_context || 'Business context available'}
Proxy Sectors: ${companyMapping.relevant_sectors.join(', ')}
Reasoning: ${companyMapping.reasoning}

# Consultant Approach
1. Acknowledge the company and provide business context
2. Explain the proxy approach transparently
3. Transform the query to use database entities
4. Maintain consultant-level insight and analysis

Respond with ONLY a JSON object:
{
  "transformed_query": "Rewritten query using proxy entities",
  "consultant_response": "Professional response with business context and transparent proxy explanation",
  "business_context": "Business intelligence about the company",
  "proxy_explanation": "Clear explanation of why these sectors are relevant proxies",
  "execution_strategy": "lookup|analytical|comparison", 
  "target_entities": ["Entity1", "Entity2"],
  "transparency_message": "Note that [Company] isn't in our project database, but based on business knowledge..."
}

# Consultant Response Examples:
- ANZ Bank → "ANZ is one of Australia's 'Big Four' banks with major retail and commercial operations. While not in our project database, I'll analyze similar banking sectors..."
- Tesla → "Tesla is a leading EV manufacturer. I'll use closest available sectors to analyze similar operational challenges..."

Provide business intelligence while being transparent about database limitations and proxy approach.
`;

    const response = await this.llmManager.generateText(prompt, {
      temperature: 0.1,
      maxTokens: 300
    });

    console.log(`[ExecutionPlanner] Raw query transformation response: "${response}"`);
    
    let cleanResponse = response.trim();
    if (cleanResponse.startsWith('```json')) {
      cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    }
    if (cleanResponse.startsWith('```')) {
      cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    try {
      return JSON.parse(cleanResponse);
    } catch (parseError) {
      console.error('[ExecutionPlanner] Query transformation JSON parse error:', parseError);
      throw new Error(`Failed to parse query transformation as JSON: ${parseError.message}`);
    }
  }

  async handleAnalyticalQuery(query, intentAnalysis, conversationHistory) {
    console.log('[ExecutionPlanner] Handling analytical query');
    
    // LLM Call #2: Query Decomposition for Analytical Operations
    const decomposition = await this.decomposeAnalyticalQuery(query, intentAnalysis);
    
    // LLM Call #3: Generate Execution Strategy
    return this.generateAnalyticalExecutionPlan(decomposition);
  }

  async decomposeAnalyticalQuery(query, intentAnalysis) {
    console.log('[ExecutionPlanner] LLM Call #2: Analytical Query Decomposition');
    
    const prompt = `
Break down this analytical query into logical components for graph database execution.

# Query
"${query}"

# Detected Operation
${intentAnalysis.analytical_operation}

# Graph Schema
${this.graphSchema.relationships.join('\n')}

# Your Task
Analyze the query structure and identify the components needed for execution.

Respond with ONLY a JSON object:
{
  "operation_type": "exclusion|inclusion|comparison|relationship_analysis",
  "primary_entity": "PainPoint|Sector|Department|ProjectOpportunity",
  "secondary_entity": "ProjectOpportunity|PainPoint|Sector",
  "relationship_pattern": "NOT_EXISTS|EXISTS|CONNECTED|COMPARED",
  "cypher_strategy": "LEFT JOIN|NOT EXISTS|MATCH WHERE",
  "analysis_goal": "Clear description of what we're trying to find",
  "expected_result": "Description of expected output"
}

# Examples
- "painpoints without projects" → primary: PainPoint, secondary: ProjectOpportunity, pattern: NOT_EXISTS
- "sectors with pain points" → primary: Sector, secondary: PainPoint, pattern: EXISTS
- "departments not connected to projects" → primary: Department, secondary: ProjectOpportunity, pattern: NOT_EXISTS

Focus on the logical structure of the analytical operation.
`;

    const response = await this.llmManager.generateText(prompt, {
      temperature: 0.1,
      maxTokens: 250
    });

    console.log(`[ExecutionPlanner] Raw analytical decomposition response: "${response}"`);
    
    // Clean and parse JSON response
    let cleanResponse = response.trim();
    
    // Remove common markdown artifacts
    if (cleanResponse.startsWith('```json')) {
      cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    }
    if (cleanResponse.startsWith('```')) {
      cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    try {
      return JSON.parse(cleanResponse);
    } catch (parseError) {
      console.error('[ExecutionPlanner] Analytical decomposition JSON parse error:', parseError);
      console.error('[ExecutionPlanner] Clean response was:', cleanResponse);
      throw new Error(`Failed to parse analytical decomposition as JSON: ${parseError.message}`);
    }
  }

  async handleComparisonQuery(query, intentAnalysis, conversationHistory) {
    console.log('[ExecutionPlanner] Handling comparison query');
    
    // Direct execution plan for comparison - these are usually straightforward
    return {
      plan: [
        {
          task_type: 'generate_cypher',
          params: {
            goal: `Compare entities as requested: ${query}`,
            entities: intentAnalysis.entities_mentioned,
            query_type: 'comparison'
          },
          on_failure: 'continue',
          reasoning: 'Generate comparison query for the requested entities'
        },
        {
          task_type: 'execute_cypher',
          params: { query: '$step1.output' },
          on_failure: 'continue',
          reasoning: 'Execute comparison query'
        },
        {
          task_type: 'analyze_and_summarize',
          params: { 
            dataset: '$step2.output',
            analysis_type: 'comparison',
            comparison_goal: query
          },
          on_failure: 'continue',
          reasoning: 'Analyze results for comparison insights'
        }
      ]
    };
  }

  async handleLookupQuery(query, intentAnalysis, conversationHistory) {
    console.log('[ExecutionPlanner] Handling lookup query');
    
    // Direct execution plan for simple lookups
    return {
      plan: [
        {
          task_type: 'generate_cypher',
          params: {
            goal: `Find requested information: ${query}`,
            entities: intentAnalysis.entities_mentioned,
            query_type: 'lookup'
          },
          on_failure: 'continue',
          reasoning: 'Generate lookup query for requested entities'
        },
        {
          task_type: 'execute_cypher',
          params: { query: '$step1.output' },
          on_failure: 'continue',
          reasoning: 'Execute lookup query'
        }
      ]
    };
  }

  async generateFinalExecutionPlan(transformedQuery, companyMapping) {
    console.log('[ExecutionPlanner] LLM Call #4: Generate Final Execution Plan');
    
    const prompt = `
Create a consultant-level execution plan for this company proxy analysis, integrating business intelligence with database queries.

# Transformed Query
${transformedQuery.transformed_query}

# Business Intelligence Context
Company: ${companyMapping.company}
Business Context: ${companyMapping.business_context || 'Business context available'}
Proxy Entities: ${companyMapping.relevant_sectors.join(', ')}

# Consultant Response Template
${transformedQuery.consultant_response || transformedQuery.proxy_explanation}

# Execution Strategy  
${transformedQuery.execution_strategy}

# Available Tasks
${this.availableTasks.join(', ')}

# Your Task
Generate an execution plan that provides consultant-level insights with transparent business context and database analysis.

Respond with ONLY a JSON object:
{
  "plan": [
    {
      "task_type": "generate_cypher",
      "params": {
        "goal": "Specific goal for this step",
        "entities": ["Entity1", "Entity2"],
        "proxy_context": "${transformedQuery.transparency_message}"
      },
      "on_failure": "continue",
      "reasoning": "Why this step is needed"
    },
    {
      "task_type": "execute_cypher", 
      "params": { "query": "$step1.output" },
      "on_failure": "continue",
      "reasoning": "Execute the proxy query"
    },
    {
      "task_type": "analyze_and_summarize",
      "params": {
        "dataset": "$step2.output",
        "business_context": "${companyMapping.business_context}",
        "consultant_response": "${transformedQuery.consultant_response}",
        "original_company": "${companyMapping.company}",
        "proxy_sectors": "${companyMapping.relevant_sectors.join(', ')}"
      },
      "on_failure": "continue", 
      "reasoning": "Provide consultant-level analysis with business intelligence and transparency"
    }
  ]
}

Keep the plan focused and efficient while maintaining transparency about proxy usage.
`;

    const response = await this.llmManager.generateText(prompt, {
      temperature: 0.1,
      maxTokens: 500
    });

    console.log(`[ExecutionPlanner] Raw final execution plan response: "${response}"`);
    
    let cleanResponse = response.trim();
    if (cleanResponse.startsWith('```json')) {
      cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    }
    if (cleanResponse.startsWith('```')) {
      cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    try {
      return JSON.parse(cleanResponse);
    } catch (parseError) {
      console.error('[ExecutionPlanner] Final execution plan JSON parse error:', parseError);
      throw new Error(`Failed to parse final execution plan as JSON: ${parseError.message}`);
    }
  }

  async generateAnalyticalExecutionPlan(decomposition) {
    console.log('[ExecutionPlanner] Generating analytical execution plan');
    
    return {
      plan: [
        {
          task_type: 'generate_cypher',
          params: {
            goal: decomposition.analysis_goal,
            entities: [decomposition.primary_entity, decomposition.secondary_entity],
            operation_type: decomposition.operation_type,
            cypher_strategy: decomposition.cypher_strategy
          },
          on_failure: 'continue',
          reasoning: `Generate ${decomposition.operation_type} query for ${decomposition.primary_entity} analysis`
        },
        {
          task_type: 'execute_cypher',
          params: { query: '$step1.output' },
          on_failure: 'continue',
          reasoning: 'Execute analytical query'
        },
        {
          task_type: 'analyze_and_summarize',
          params: { 
            dataset: '$step2.output',
            analysis_type: decomposition.operation_type,
            expected_result: decomposition.expected_result
          },
          on_failure: 'continue',
          reasoning: 'Analyze and summarize the analytical results'
        }
      ]
    };
  }

  validatePlan(planResult) {
    if (!planResult || !planResult.plan || !Array.isArray(planResult.plan)) {
      throw new Error('Invalid plan structure: missing plan array');
    }

    for (let i = 0; i < planResult.plan.length; i++) {
      const step = planResult.plan[i];
      
      if (!step.task_type || !this.availableTasks.includes(step.task_type)) {
        throw new Error(`Invalid task type at step ${i + 1}: ${step.task_type}`);
      }
      
      if (!step.params || typeof step.params !== 'object') {
        throw new Error(`Missing or invalid params at step ${i + 1}`);
      }
      
      if (!step.reasoning) {
        throw new Error(`Missing reasoning at step ${i + 1}`);
      }
    }
    
    console.log(`[ExecutionPlanner] Plan validation passed for ${planResult.plan.length} steps`);
  }
}

module.exports = ExecutionPlanner;