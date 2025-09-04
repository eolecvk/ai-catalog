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
    
    // Known entities from the database for fuzzy matching
    this.knownEntities = {
      industries: ['Banking', 'Insurance'],
      sectors: ['Retail Banking', 'Commercial Banking', 'Investment Banking', 'Private Banking', 
               'Credit Unions', 'Online Banking', 'Life Insurance', 'Health Insurance', 
               'Property Insurance', 'Casualty Insurance'],
      roles: ['Data Scientist', 'AI Engineer', 'DevOps Engineer', 'MLOps Engineer'],
      // Common pain point patterns for suggestions
      painPointPatterns: ['fraud', 'risk', 'claims', 'customer', 'churn', 'processing']
    };
  }

  async generateExecutionPlan(query, conversationHistory = []) {
    console.log(`[ExecutionPlanner] Generating execution plan for query: "${query}"`);
    
    // Analyze conversation context and detect patterns
    const conversationContext = this.analyzeConversationContext(query, conversationHistory);
    console.log(`[ExecutionPlanner] Conversation context:`, conversationContext);
    
    // Handle special conversation states first
    if (conversationContext.requiresSpecialHandling) {
      return this.generateContextualPlan(query, conversationContext, conversationHistory);
    }
    
    // Pre-analyze query for entity recognition issues
    const entityAnalysis = this.analyzeQueryEntities(query);
    console.log(`[ExecutionPlanner] Entity analysis:`, entityAnalysis);
    
    // If we have entity recognition issues, create a smart plan with conversation awareness
    if (entityAnalysis.hasIssues) {
      return this.generateSmartCorrectionPlan(query, entityAnalysis, conversationContext);
    }
    
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

# Plan Optimization Guidelines
- Skip validation for well-known schema entities: ${this.graphSchema.nodeLabels.join(', ')}
- Combine related operations when possible to reduce execution steps
- Prioritize direct queries over complex analysis chains for simple requests
- Use efficient query patterns for common scenarios

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

Example for query "Compare pain points between Sectors and Departments" (OPTIMIZED):
{
  "plan": [
    {
      "task_type": "generate_cypher",
      "params": {
        "goal": "Find all pain points connected to Sectors and Departments for comparison",
        "entities": ["Sector", "Department", "PainPoint"]
      },
      "on_failure": "continue",
      "reasoning": "Generate efficient query to get both datasets in one operation"
    },
    {
      "task_type": "execute_cypher",
      "params": { "query": "$step1.output" },
      "on_failure": "continue",
      "reasoning": "Execute combined query for both Sectors and Departments"
    },
    {
      "task_type": "analyze_and_summarize",
      "params": {
        "dataset": "$step2.output",
        "comparison_type": "pain_points_comparison",
        "analysis_goal": "Compare pain points between Sectors and Departments"
      },
      "on_failure": "continue",
      "reasoning": "Analyze the combined dataset for comparison insights"
    }
  ]
}

Example for simple query "What projects are available for retail?" (SMART CORRECTION):
{
  "plan": [
    {
      "task_type": "generate_cypher",
      "params": {
        "goal": "Find projects for retail banking sector (auto-corrected from 'retail')",
        "entities": ["Retail Banking", "ProjectOpportunity"]
      },
      "on_failure": "continue",
      "reasoning": "Query projects for Retail Banking sector with intelligent entity correction"
    },
    {
      "task_type": "execute_cypher",
      "params": { "query": "$step1.output" },
      "on_failure": "continue",
      "reasoning": "Execute the project query"
    }
  ]
}

Guidelines for efficient plans:
- Skip validation for schema entities (Industry, Sector, Department, etc.)
- Combine queries when possible instead of separate dataset retrieval
- For single dataset analysis, use: {"dataset": "$stepN.output"}
- For comparison, prefer combined queries over separate ones

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

  // Fuzzy matching and entity analysis methods
  analyzeQueryEntities(query) {
    const queryLower = query.toLowerCase();
    const issues = [];
    const suggestions = [];
    const detectedEntities = [];

    // Extract potential entities from query using improved patterns
    const entityPatterns = [
      /(?:projects|opportunities).*?(?:in|for)\s+([a-zA-Z\s]+?)(?:\s*\?|$)/gi,
      /(?:in|for|from|about)\s+([a-zA-Z\s]+?)(?:\s+projects|\s+opportunities|\s+sector|\s+industry|$|[.?!])/gi,
      /([a-zA-Z\s]+?)\s+(?:industry|sector|projects|pain|department)/gi
    ];

    for (const pattern of entityPatterns) {
      let match;
      while ((match = pattern.exec(query)) !== null) {
        const entity = match[1].trim();
        if (entity.length > 2 && entity.length < 30) {
          detectedEntities.push(entity);
        }
      }
    }

    // Clean and analyze each detected entity
    const cleanedEntities = [...new Set(detectedEntities)]
      .map(entity => entity.trim())
      .filter(entity => this.isLikelyEntityName(entity))
      .sort((a, b) => b.length - a.length); // Prioritize longer entities (more specific)

    for (const entity of cleanedEntities) {
      // Skip if this entity is already part of a longer entity we've processed
      const isPartOfLonger = cleanedEntities.some(longerEntity => 
        longerEntity !== entity && 
        longerEntity.toLowerCase().includes(entity.toLowerCase()) &&
        longerEntity.length > entity.length
      );
      
      if (isPartOfLonger) {
        continue;
      }
      
      const fuzzyResult = this.findSimilarEntities(entity);
      
      if (fuzzyResult.exactMatch) {
        // Entity exists, no issues
        continue;
      }
      
      if (fuzzyResult.similarEntities.length > 0) {
        issues.push({
          entity,
          issue: 'fuzzy_match',
          suggestions: fuzzyResult.similarEntities
        });
        suggestions.push(...fuzzyResult.similarEntities.slice(0, 2));
      } else {
        issues.push({
          entity,
          issue: 'not_found',
          suggestions: this.getContextualSuggestions(entity)
        });
        suggestions.push(...this.getContextualSuggestions(entity));
      }
    }

    return {
      hasIssues: issues.length > 0,
      issues,
      suggestions: [...new Set(suggestions)],
      detectedEntities
    };
  }

  findSimilarEntities(queryEntity) {
    const entityLower = queryEntity.toLowerCase();
    const allEntities = [
      ...this.knownEntities.industries,
      ...this.knownEntities.sectors,
      ...this.knownEntities.roles
    ];
    
    // Check for exact match first
    const exactMatch = allEntities.find(entity => 
      entity.toLowerCase() === entityLower
    );
    
    if (exactMatch) {
      return { exactMatch: true, similarEntities: [] };
    }
    
    // Fuzzy matching using similarity scoring
    const similarities = allEntities.map(entity => ({
      entity,
      score: this.calculateSimilarity(entityLower, entity.toLowerCase())
    }));
    
    // Filter and sort by similarity
    const similarEntities = similarities
      .filter(item => item.score > 0.4) // Threshold for similarity
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(item => item.entity);
    
    return { exactMatch: false, similarEntities };
  }

  calculateSimilarity(str1, str2) {
    // Simple similarity scoring using multiple methods
    
    // 1. Substring containment
    let score = 0;
    if (str1.includes(str2) || str2.includes(str1)) {
      score += 0.6;
    }
    
    // 2. Word overlap
    const words1 = str1.split(' ');
    const words2 = str2.split(' ');
    const commonWords = words1.filter(word => words2.includes(word));
    if (commonWords.length > 0) {
      score += (commonWords.length / Math.max(words1.length, words2.length)) * 0.4;
    }
    
    // 3. Levenshtein distance for short strings
    if (str1.length <= 15 && str2.length <= 15) {
      const distance = this.levenshteinDistance(str1, str2);
      const maxLen = Math.max(str1.length, str2.length);
      score += Math.max(0, (maxLen - distance) / maxLen * 0.3);
    }
    
    return Math.min(score, 1.0);
  }

  levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  isLikelyEntityName(entity) {
    // Heuristics to determine if a string looks like an entity name
    const entityLower = entity.toLowerCase();
    
    // Skip common stop words and question words
    const stopWords = [
      'the', 'and', 'or', 'in', 'on', 'at', 'for', 'with', 'by', 'to', 'from', 'of',
      'what', 'where', 'when', 'why', 'how', 'who', 'which', 'that', 'this', 'these',
      'those', 'are', 'is', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
      'do', 'does', 'did', 'will', 'would', 'could', 'should', 'can', 'may', 'might',
      'projects', 'available', 'opportunities'
    ];
    if (stopWords.includes(entityLower)) {
      return false;
    }
    
    // Should be reasonable length and not contain special patterns
    return entity.length >= 3 && 
           entity.length <= 30 && 
           !/^\d+$/.test(entity) && // Not just numbers
           !/[!@#$%^&*(),.?":{}|<>]/.test(entity); // No special chars
  }

  getContextualSuggestions(entity) {
    const entityLower = entity.toLowerCase();
    
    // Provide contextual suggestions based on query patterns
    if (entityLower.includes('retail') || entityLower.includes('consumer')) {
      return ['Retail Banking', 'Consumer Banking'];
    }
    
    if (entityLower.includes('commercial') || entityLower.includes('business')) {
      return ['Commercial Banking'];
    }
    
    if (entityLower.includes('health') || entityLower.includes('medical')) {
      return ['Health Insurance'];
    }
    
    if (entityLower.includes('property') || entityLower.includes('home')) {
      return ['Property Insurance'];
    }
    
    // Default suggestions
    return ['Banking', 'Insurance', 'Retail Banking', 'Commercial Banking'];
  }

  async generateSmartCorrectionPlan(query, entityAnalysis) {
    console.log(`[ExecutionPlanner] Generating smart correction plan for entity issues`);
    
    const primaryIssue = entityAnalysis.issues[0];
    const suggestions = entityAnalysis.suggestions.slice(0, 3);
    
    // Create a plan that offers corrections and alternatives
    const clarificationMessage = this.buildClarificationMessage(query, primaryIssue, suggestions);
    
    return {
      plan: [
        {
          task_type: 'clarify_with_user',
          params: {
            message: clarificationMessage,
            suggestions: this.buildQuerySuggestions(query, suggestions),
            entity_issues: entityAnalysis.issues,
            corrected_entities: suggestions
          },
          on_failure: 'halt',
          reasoning: `Detected entity recognition issue: "${primaryIssue.entity}" not found. Offering corrections and alternatives.`
        }
      ]
    };
  }

  buildClarificationMessage(query, issue, suggestions) {
    const entity = issue.entity;
    
    if (issue.issue === 'fuzzy_match') {
      return `I couldn't find "${entity}" but found similar options: ${suggestions.join(', ')}. Did you mean one of these?`;
    } else {
      return `I couldn't find "${entity}" in the database. Available options include: ${suggestions.join(', ')}. Which would you like to explore?`;
    }
  }

  buildQuerySuggestions(originalQuery, suggestions) {
    return suggestions.map(suggestion => {
      // Try to replace the problematic entity with the suggestion
      const modifiedQuery = originalQuery.replace(/\b\w+\b/gi, (match) => {
        if (this.findSimilarEntities(match).similarEntities.includes(suggestion)) {
          return suggestion;
        }
        return match;
      });
      
      return `${modifiedQuery.charAt(0).toUpperCase() + modifiedQuery.slice(1)}`;
    });
  }

  // Conversation context analysis methods
  analyzeConversationContext(query, conversationHistory) {
    const queryLower = query.toLowerCase().trim();
    const context = {
      isRejection: false,
      isMetaConversation: false,
      recentSuggestions: [],
      conversationState: 'normal',
      failureCount: 0,
      requiresSpecialHandling: false,
      persistentRequests: new Map(), // Track repeated requests for same entities
      nonExistentEntityCount: 0 // Count requests for entities that don't exist
    };

    // Detect rejection patterns
    const rejectionPatterns = [
      /^no\b/i,
      /^nope\b/i, 
      /^not what i/i,
      /^that'?s not/i,
      /^try again/i,
      /^something else/i,
      /^different/i
    ];
    
    context.isRejection = rejectionPatterns.some(pattern => pattern.test(queryLower));

    // Detect meta-conversation patterns
    const metaPatterns = [
      /provide more (details?|info)/i,
      /more context/i,
      /clarify/i,
      /explain/i,
      /what do you mean/i,
      /your (query|question|response)/i,
      /help me/i,
      /i don'?t understand/i
    ];
    
    context.isMetaConversation = metaPatterns.some(pattern => pattern.test(queryLower));

    // Extract recent suggestions from conversation history
    const recentMessages = conversationHistory.slice(-6); // Last 3 exchanges
    context.recentSuggestions = this.extractRecentSuggestions(recentMessages);
    
    // Count recent failures and clarification requests
    context.failureCount = this.countRecentFailures(recentMessages);
    
    // Track persistent requests for the same non-existent entities
    this.analyzePersistentRequests(query, recentMessages, context);
    
    // Determine conversation state and need for special handling
    if (context.nonExistentEntityCount >= 2) {
      context.conversationState = 'persistent_non_existent';
      context.requiresSpecialHandling = true;
    } else if (context.isRejection) {
      context.conversationState = 'post_rejection';
      context.requiresSpecialHandling = true;
    } else if (context.isMetaConversation) {
      context.conversationState = 'meta_conversation';
      context.requiresSpecialHandling = true;
    } else if (context.failureCount >= 2) {
      context.conversationState = 'repeated_failure';
      context.requiresSpecialHandling = true;
    }

    return context;
  }

  extractRecentSuggestions(recentMessages) {
    const suggestions = [];
    
    recentMessages.forEach(message => {
      if (message.type === 'assistant' && message.content) {
        // Extract entities that were suggested in clarifications
        const suggestionPatches = [
          /similar options?:\s*([^.?!]+)/i,
          /did you mean[^:]*:\s*([^.?!]+)/i,
          /available options include:\s*([^.?!]+)/i
        ];
        
        suggestionPatches.forEach(pattern => {
          const match = message.content.match(pattern);
          if (match && match[1]) {
            const entities = match[1]
              .split(/[,&]/)
              .map(s => s.trim())
              .filter(s => s && s !== 'and');
            suggestions.push(...entities);
          }
        });
      }
    });
    
    return [...new Set(suggestions)]; // Remove duplicates
  }

  countRecentFailures(recentMessages) {
    let failureCount = 0;
    
    recentMessages.forEach(message => {
      if (message.type === 'assistant' && message.content) {
        const failureIndicators = [
          /couldn'?t find/i,
          /not found/i,
          /no data/i,
          /clarification/i,
          /need more/i
        ];
        
        if (failureIndicators.some(pattern => pattern.test(message.content))) {
          failureCount++;
        }
      }
    });
    
    return failureCount;
  }

  async generateContextualPlan(query, conversationContext, conversationHistory) {
    console.log(`[ExecutionPlanner] Generating contextual plan for state: ${conversationContext.conversationState}`);
    
    switch (conversationContext.conversationState) {
      case 'post_rejection':
        return this.generatePostRejectionPlan(query, conversationContext);
        
      case 'meta_conversation':
        return this.generateMetaConversationPlan(query, conversationContext);
        
      case 'repeated_failure':
        return this.generateEscalationPlan(query, conversationContext);
        
      default:
        // Fallback to normal processing
        return null;
    }
  }

  async generatePostRejectionPlan(query, conversationContext) {
    const rejectedSuggestions = conversationContext.recentSuggestions;
    
    // Avoid re-suggesting the same entities
    let message = "I understand that wasn't what you were looking for. ";
    let suggestions = [];
    
    if (rejectedSuggestions.length > 0) {
      // Offer broader categories or alternatives
      message += "Let me show you other available options:";
      suggestions = this.getAlternativeSuggestions(rejectedSuggestions);
    } else {
      message += "Let me help you explore what's available in our database:";
      suggestions = [
        "Show me all industries",
        "What sectors are available?",
        "List all pain points",
        "Browse all project opportunities"
      ];
    }
    
    return {
      plan: [
        {
          task_type: 'clarify_with_user',
          params: {
            message: message,
            suggestions: suggestions,
            conversation_state: 'post_rejection',
            alternative_approach: true
          },
          on_failure: 'halt',
          reasoning: 'User rejected previous suggestions, offering alternative exploration paths'
        }
      ]
    };
  }

  async generateMetaConversationPlan(query, conversationContext) {
    let message = "I can see you're asking for clarification about our conversation. ";
    let suggestions = [];
    
    if (query.toLowerCase().includes('query') || query.toLowerCase().includes('question')) {
      message += "Instead of searching the database, let me clarify: I can help you find projects, pain points, or explore different industries and sectors. What specifically interests you?";
      suggestions = [
        "Show me all available industries",
        "Find projects in a specific sector", 
        "Browse pain points by department",
        "Start over with a new search"
      ];
    } else {
      message += "I'm here to help you explore the graph database. I can search for projects, analyze pain points, or show relationships between different business areas.";
      suggestions = [
        "What types of data can I explore?",
        "Show me example queries",
        "Start with browsing industries",
        "Help me find relevant projects"
      ];
    }
    
    return {
      plan: [
        {
          task_type: 'clarify_with_user',
          params: {
            message: message,
            suggestions: suggestions,
            conversation_state: 'meta_conversation',
            helpful_guidance: true
          },
          on_failure: 'halt',
          reasoning: 'User is asking about the conversation itself, providing meta-level guidance'
        }
      ]
    };
  }

  async generateEscalationPlan(query, conversationContext) {
    const message = "I notice we're having trouble finding what you're looking for. Let me take a different approach and show you what's actually available in the database so you can find what you need.";
    
    const suggestions = [
      "Show me everything available",
      "Browse by industry categories", 
      "Explore all sectors and departments",
      "Start fresh with a different approach"
    ];
    
    return {
      plan: [
        {
          task_type: 'generate_cypher',
          params: {
            goal: "Show overview of all available entities to help user explore",
            entities: ["Industry", "Sector", "Department"],
            exploration_mode: true
          },
          on_failure: 'continue',
          reasoning: 'Providing exploratory overview after repeated failures'
        },
        {
          task_type: 'execute_cypher',
          params: { query: "$step1.output" },
          on_failure: 'continue',
          reasoning: 'Execute exploratory query to show available options'
        },
        {
          task_type: 'clarify_with_user', 
          params: {
            message: message,
            suggestions: suggestions,
            conversation_state: 'escalation',
            show_exploration_data: true
          },
          on_failure: 'halt',
          reasoning: 'Escalate to guided exploration after repeated failures'
        }
      ]
    };
  }

  getAlternativeSuggestions(rejectedSuggestions) {
    const allOptions = [
      ...this.knownEntities.industries,
      ...this.knownEntities.sectors
    ];
    
    // Filter out recently suggested items
    const alternatives = allOptions.filter(option => 
      !rejectedSuggestions.some(rejected => 
        option.toLowerCase().includes(rejected.toLowerCase()) ||
        rejected.toLowerCase().includes(option.toLowerCase())
      )
    );
    
    // Return a diverse set of alternatives
    return alternatives.slice(0, 4).map(alt => `Explore ${alt}`);
  }

  async generateSmartCorrectionPlan(query, entityAnalysis, conversationContext = null) {
    console.log(`[ExecutionPlanner] Generating smart correction plan for entity issues`);
    
    const primaryIssue = entityAnalysis.issues[0];
    let suggestions = entityAnalysis.suggestions.slice(0, 3);
    
    // If we have conversation context, adjust suggestions to avoid repetition
    if (conversationContext && conversationContext.recentSuggestions.length > 0) {
      suggestions = suggestions.filter(suggestion => 
        !conversationContext.recentSuggestions.includes(suggestion)
      );
      
      // If no new suggestions, provide alternatives
      if (suggestions.length === 0) {
        suggestions = this.getAlternativeSuggestions(conversationContext.recentSuggestions);
      }
    }
    
    const clarificationMessage = this.buildClarificationMessage(query, primaryIssue, suggestions);
    
    return {
      plan: [
        {
          task_type: 'clarify_with_user',
          params: {
            message: clarificationMessage,
            suggestions: this.buildQuerySuggestions(query, suggestions),
            entity_issues: entityAnalysis.issues,
            corrected_entities: suggestions,
            conversation_aware: conversationContext ? true : false
          },
          on_failure: 'halt',
          reasoning: `Detected entity recognition issue: "${primaryIssue.entity}" not found. Offering conversation-aware corrections and alternatives.`
        }
      ]
    };
  }
}

module.exports = ExecutionPlanner;