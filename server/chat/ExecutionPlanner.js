const llmManager = require('../llm/LLMManager');

class ExecutionPlanner {
  constructor() {
    this.llmManager = llmManager;
    
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
    console.log(`[ExecutionPlanner] Generating execution plan for query: "${query}"`);
    
    const historyContext = conversationHistory
      .slice(-6) // Last 3 exchanges
      .map(msg => `${msg.type}: ${msg.content}`)
      .join('\n');

    const prompt = `
You are an execution planner that converts natural language queries into structured, step-by-step execution plans for a graph database system.

# Graph Schema
Node Labels: ${this.graphSchema.nodeLabels.join(', ')}
Relationships: 
${this.graphSchema.relationships.map(rel => `- ${rel}`).join('\n')}

# Available Tasks
${this.availableTasks.map(task => `- ${task}`).join('\n')}

# Recent Chat History
${historyContext || 'No previous context'}

# Current Query
"${query}"

Your task is to create a JSON execution plan that breaks down the query into discrete, executable tasks.

## Task Descriptions:
- validate_entity: Check if an entity type exists in the schema (params: {entity_type: "EntityName"})
- find_connection_paths: Analyze schema for connection paths between entities (params: {entities: ["Entity1", "Entity2"]})
- generate_cypher: Generate a specific Cypher query for a well-defined goal (params: {goal: "description", entities: ["Entity1", "Entity2"]})
- execute_cypher: Run a query against Neo4j and return results (params: {query: "CYPHER_QUERY"})
- analyze_and_summarize: Use LLM to analyze data from graph queries (params: {dataset: graphData} OR {dataset1: data1, dataset2: data2})
- generate_creative_text: Generate creative suggestions based on graph context (params: {creative_goal: "description", context: data})
- clarify_with_user: Request clarification when query is ambiguous (params: {message: "question", suggestions: ["option1", "option2"]})

## Task Parameters:
- Static values: Direct strings or numbers
- Dynamic references: Use $stepN.output to reference previous task outputs
- Conditional logic: Use on_failure to define error handling

CRITICAL: You must respond with ONLY a JSON object. No markdown, no backticks, no explanations - just pure JSON.

Expected JSON format:
{
  "plan": [
    {
      "task_type": "task_name",
      "params": { "param1": "value", "param2": "$step1.output" },
      "on_failure": "clarify_and_halt|continue|retry",
      "reasoning": "Brief explanation of why this task is needed"
    }
  ]
}

Example for query "Compare pain points between Sectors and Departments":
{
  "plan": [
    {
      "task_type": "validate_entity",
      "params": { "entity_type": "Sector" },
      "on_failure": "clarify_and_halt",
      "reasoning": "Confirm 'Sector' node type exists in schema"
    },
    {
      "task_type": "validate_entity", 
      "params": { "entity_type": "Department" },
      "on_failure": "clarify_and_halt",
      "reasoning": "Confirm 'Department' node type exists in schema"
    },
    {
      "task_type": "generate_cypher",
      "params": {
        "goal": "Find all pain points connected to Sectors",
        "entities": ["Sector", "PainPoint"]
      },
      "on_failure": "continue",
      "reasoning": "Generate query for Sector pain points"
    },
    {
      "task_type": "execute_cypher",
      "params": { "query": "$step3.output" },
      "on_failure": "continue", 
      "reasoning": "Execute query for Sector data"
    },
    {
      "task_type": "generate_cypher",
      "params": {
        "goal": "Find all pain points connected to Departments",
        "entities": ["Department", "PainPoint"]
      },
      "on_failure": "continue",
      "reasoning": "Generate query for Department pain points"
    },
    {
      "task_type": "execute_cypher",
      "params": { "query": "$step5.output" },
      "on_failure": "continue",
      "reasoning": "Execute query for Department data"
    },
    {
      "task_type": "analyze_and_summarize",
      "params": {
        "dataset1": "$step4.output",
        "dataset2": "$step6.output",
        "comparison_type": "pain_points_comparison"
      },
      "on_failure": "continue",
      "reasoning": "Compare the two datasets and generate summary"
    }

For single dataset analysis, use: {"dataset": "$stepN.output"} instead of dataset1/dataset2.
  ]
}

Generate an appropriate execution plan for the given query.
`;

    try {
      const response = await this.llmManager.generateText(prompt, {
        temperature: 0.1,
        maxTokens: 800
      });

      console.log(`[ExecutionPlanner] Raw response: "${response}"`);
      
      const result = JSON.parse(response.trim());
      console.log(`[ExecutionPlanner] Generated plan with ${result.plan?.length || 0} steps`);
      
      // Validate the plan structure
      this.validatePlan(result);
      
      return result;
    } catch (error) {
      console.error('Execution plan generation error:', error);
      
      // If JSON parsing fails, try fallback parsing
      if (error instanceof SyntaxError && error.message.includes('JSON')) {
        try {
          const response = await this.llmManager.generateText(prompt, {
            temperature: 0.1,
            maxTokens: 800
          });
          
          const currentProvider = this.llmManager.currentProvider;
          if (currentProvider && currentProvider.parseJSONResponse) {
            const result = currentProvider.parseJSONResponse(response);
            this.validatePlan(result);
            return result;
          }
        } catch (fallbackError) {
          console.error('[ExecutionPlanner] Fallback parsing failed:', fallbackError);
        }
      }
      
      // Return a basic clarification plan as fallback
      return {
        plan: [
          {
            task_type: 'clarify_with_user',
            params: {
              message: 'I need more details to understand your request. Could you be more specific?',
              suggestions: ['Show me all industries', 'Find pain points in banking', 'Compare sectors and departments']
            },
            on_failure: 'halt',
            reasoning: 'Query was too complex to parse automatically'
          }
        ]
      };
    }
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