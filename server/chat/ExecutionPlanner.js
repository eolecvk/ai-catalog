const llmManager = require('../llm/LLMManager');

// JSON Schema validation for LLM responses
class ResponseValidator {
  static validateIntentAnalysis(response) {
    const required = ['query_type', 'entities_mentioned', 'confidence', 'reasoning'];
    const validQueryTypes = ['lookup', 'analytical', 'comparison', 'company_proxy'];
    
    for (const field of required) {
      if (!(field in response)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    
    if (!validQueryTypes.includes(response.query_type)) {
      throw new Error(`Invalid query_type: ${response.query_type}. Must be one of: ${validQueryTypes.join(', ')}`);
    }
    
    if (!Array.isArray(response.entities_mentioned)) {
      throw new Error('entities_mentioned must be an array');
    }
    
    if (typeof response.confidence !== 'number' || response.confidence < 0 || response.confidence > 1) {
      throw new Error('confidence must be a number between 0 and 1');
    }
    
    if (response.query_type === 'company_proxy') {
      if (!response.unknown_entities || !Array.isArray(response.unknown_entities) || response.unknown_entities.length === 0) {
        throw new Error('company_proxy queries must have non-empty unknown_entities array');
      }
      if (!response.requires_company_mapping) {
        throw new Error('company_proxy queries must have requires_company_mapping set to true');
      }
    }
    
    return true;
  }
  
  static validateCompanyMapping(response) {
    const required = ['company', 'business_context', 'actual_business_sectors', 'primary_industries', 'relevant_sectors', 'missing_sectors', 'business_impact_of_gaps', 'data_completeness_score', 'reasoning', 'confidence'];
    
    for (const field of required) {
      if (!(field in response)) {
        throw new Error(`Missing required field in company mapping: ${field}`);
      }
    }
    
    if (!Array.isArray(response.actual_business_sectors) || response.actual_business_sectors.length === 0) {
      throw new Error('actual_business_sectors must be a non-empty array');
    }
    
    if (!Array.isArray(response.primary_industries) || response.primary_industries.length === 0) {
      throw new Error('primary_industries must be a non-empty array');
    }
    
    if (!Array.isArray(response.relevant_sectors) || response.relevant_sectors.length === 0) {
      throw new Error('relevant_sectors must be a non-empty array');
    }
    
    if (!Array.isArray(response.missing_sectors)) {
      throw new Error('missing_sectors must be an array (can be empty)');
    }
    
    if (typeof response.confidence !== 'number' || response.confidence < 0 || response.confidence > 1) {
      throw new Error('confidence must be a number between 0 and 1');
    }
    
    if (typeof response.data_completeness_score !== 'number' || response.data_completeness_score < 0 || response.data_completeness_score > 1) {
      throw new Error('data_completeness_score must be a number between 0 and 1');
    }
    
    return true;
  }
  
  static validateQueryTransformation(response) {
    const required = ['transformed_query', 'consultant_response', 'execution_strategy', 'target_entities'];
    
    for (const field of required) {
      if (!(field in response)) {
        throw new Error(`Missing required field in query transformation: ${field}`);
      }
    }
    
    if (!Array.isArray(response.target_entities) || response.target_entities.length === 0) {
      throw new Error('target_entities must be a non-empty array');
    }
    
    const validStrategies = ['lookup', 'analytical', 'comparison'];
    if (!validStrategies.includes(response.execution_strategy)) {
      throw new Error(`Invalid execution_strategy: ${response.execution_strategy}. Must be one of: ${validStrategies.join(', ')}`);
    }
    
    return true;
  }
  
  static validateExecutionPlan(response) {
    if (!response.plan || !Array.isArray(response.plan)) {
      throw new Error('Response must have a plan array');
    }
    
    if (response.plan.length === 0) {
      throw new Error('Execution plan cannot be empty');
    }
    
    for (let i = 0; i < response.plan.length; i++) {
      const step = response.plan[i];
      const required = ['task_type', 'params', 'reasoning'];
      
      for (const field of required) {
        if (!(field in step)) {
          throw new Error(`Missing required field in step ${i + 1}: ${field}`);
        }
      }
      
      if (typeof step.params !== 'object' || step.params === null) {
        throw new Error(`Invalid params in step ${i + 1}: must be an object`);
      }
    }
    
    return true;
  }
}

// Response sanitization utilities
class ResponseSanitizer {
  static sanitizeJSON(responseText) {
    if (!responseText || typeof responseText !== 'string') {
      throw new Error('Response text must be a non-empty string');
    }
    
    let cleaned = responseText.trim();
    
    // Remove markdown code blocks
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    // Remove common LLM artifacts
    cleaned = cleaned.replace(/^Here's the JSON response:\s*/i, '');
    cleaned = cleaned.replace(/^The JSON object is:\s*/i, '');
    cleaned = cleaned.replace(/^Response:\s*/i, '');
    
    // Remove any text before the first {
    const firstBrace = cleaned.indexOf('{');
    if (firstBrace > 0) {
      cleaned = cleaned.substring(firstBrace);
    }
    
    // Remove any text after the last }
    const lastBrace = cleaned.lastIndexOf('}');
    if (lastBrace >= 0 && lastBrace < cleaned.length - 1) {
      cleaned = cleaned.substring(0, lastBrace + 1);
    }
    
    // Conservative JSON cleanup - only fix obvious issues
    // Most LLM responses are already valid JSON, so be minimal
    
    // Only add quotes to unquoted keys if absolutely necessary
    cleaned = cleaned.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
    
    // Don't try to fix string values automatically as this can break numbers
    // Only fix quoted booleans and null values that are clearly wrong
    cleaned = cleaned.replace(/:\s*"true"/g, ': true');
    cleaned = cleaned.replace(/:\s*"false"/g, ': false');
    cleaned = cleaned.replace(/:\s*"null"/g, ': null');
    
    return cleaned.trim();
  }
  
  static parseAndValidateJSON(responseText, validator, options = {}) {
    const { allowRetry = true } = options;
    
    try {
      const sanitized = this.sanitizeJSON(responseText);
      console.log(`[ResponseSanitizer] Sanitized JSON: ${sanitized.substring(0, 200)}`);
      
      const parsed = JSON.parse(sanitized);
      
      if (validator) {
        validator(parsed);
      }
      
      return parsed;
    } catch (error) {
      console.error(`[ResponseSanitizer] Validation failed:`, error.message);
      console.error(`[ResponseSanitizer] Original text: ${responseText?.substring(0, 300)}`);
      
      // Check if this looks like a truncated JSON response
      if (allowRetry && this.isTruncatedJSON(responseText)) {
        console.warn(`[ResponseSanitizer] Detected truncated JSON response, will request retry`);
        const truncError = new Error(`JSON validation failed: ${error.message}`);
        truncError.isTruncated = true;
        truncError.partialResponse = responseText;
        throw truncError;
      }
      
      throw new Error(`JSON validation failed: ${error.message}`);
    }
  }
  
  /**
   * Check if a response appears to be truncated JSON
   * @param {string} responseText - The response text to check
   * @returns {boolean} True if the response appears truncated
   */
  static isTruncatedJSON(responseText) {
    if (!responseText || typeof responseText !== 'string') {
      return false;
    }
    
    const text = responseText.trim();
    
    // Check for common truncation patterns
    const truncationIndicators = [
      // Ends with incomplete string
      /[^"}]\s*$/,
      // Ends with incomplete object/array
      /[,{[]$/,
      // Ends with colon (incomplete key-value pair)
      /:\s*$/,
      // Missing closing braces/brackets
      text.startsWith('{') && !text.includes('}'),
      text.startsWith('[') && !text.includes(']'),
      // Ends mid-word or mid-field
      /[a-zA-Z_]$/,
      // Contains markdown code block start but no end
      text.includes('```json') && !text.includes('```\n') && !text.endsWith('```')
    ];
    
    return truncationIndicators.some(indicator => {
      if (typeof indicator === 'boolean') return indicator;
      return indicator.test(text);
    });
  }
}

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
      
      // Validate company_proxy classification
      if (intentAnalysis.query_type === 'company_proxy') {
        if (!intentAnalysis.unknown_entities || intentAnalysis.unknown_entities.length === 0) {
          console.error('[ExecutionPlanner] company_proxy detected but no unknown_entities found, falling back to lookup');
          console.error('[ExecutionPlanner] Intent analysis was:', intentAnalysis);
          // Convert to lookup with warning
          intentAnalysis.query_type = 'lookup';
        }
      }
      
      // Handle different query types with appropriate LLM processing
      switch (intentAnalysis.query_type) {
        case 'company_proxy':
          console.log('[ExecutionPlanner] Routing to BUSINESS CONTEXT workflow');
          return this.handleCompanyProxyQuery(query, intentAnalysis, conversationHistory);
          
        case 'analytical':
          console.log('[ExecutionPlanner] Routing to analytical workflow');
          return this.handleAnalyticalQuery(query, intentAnalysis, conversationHistory);
          
        case 'comparison':
          console.log('[ExecutionPlanner] Routing to comparison workflow');
          return this.handleComparisonQuery(query, intentAnalysis, conversationHistory);
          
        case 'lookup':
        default:
          console.log('[ExecutionPlanner] Routing to lookup workflow');
          return this.handleLookupQuery(query, intentAnalysis, conversationHistory);
      }
      
    } catch (error) {
      console.error('[ExecutionPlanner] LLM-first processing failed:', error);
      
      // Enhanced fallback with business context detection
      const queryLower = query.toLowerCase();
      const commonCompanyTerms = ['anz', 'tesla', 'amazon', 'netflix', 'microsoft', 'apple', 'google', 'facebook', 'uber'];
      const mentionsCompany = commonCompanyTerms.some(term => queryLower.includes(term));
      
      if (mentionsCompany) {
        console.log('[ExecutionPlanner] Fallback detected company mention, providing business context fallback');
        const detectedCompany = commonCompanyTerms.find(term => queryLower.includes(term));
        
        return {
          plan: [
            {
              task_type: 'clarify_with_user',
              params: {
                message: `I understand you're asking about ${detectedCompany.toUpperCase()}, but I encountered a processing issue. While ${detectedCompany.toUpperCase()} isn't in our project database, I can help you explore similar business challenges using our available data.`,
                suggestions: [
                  'Show me all industries',
                  'Find pain points in banking', 
                  'Browse available sectors',
                  `What projects are similar to ${detectedCompany.toUpperCase()}'s business model?`
                ],
                business_context_aware: true,
                detected_company: detectedCompany.toUpperCase()
              },
              on_failure: 'halt',
              reasoning: 'LLM processing failed but company detected, providing business context aware fallback'
            }
          ]
        };
      }
      
      // Standard fallback for non-company queries
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
    console.log(`[ExecutionPlanner] Analyzing query: "${query}"`);
    
    const historyContext = conversationHistory
      .slice(-4) // Last 2 exchanges
      .map(msg => `${msg.type}: ${msg.content}`)
      .join('\n');

    const prompt = `
Classify query intent. Return ONLY JSON. No explanations.

Entities: ${this.graphSchema.nodeLabels.join(', ')}
Path: Sector -[:EXPERIENCES]-> PainPoint <-[:ADDRESSES]- ProjectOpportunity

Context: ${historyContext || 'None'}
Query: "${query}"

JSON format:
{
  "query_type": "lookup|analytical|comparison|company_proxy",
  "entities_mentioned": ["entity1"],
  "unknown_entities": ["company_name"], 
  "requires_company_mapping": true/false,
  "analytical_operation": "exclusion|inclusion|comparison|relationship_analysis",
  "confidence": 0.0-1.0,
  "reasoning": "1-2 words"
}

Types:
- lookup: Simple finds (e.g., "show banking")
- analytical: Complex ops (e.g., "sectors without projects")
- comparison: "compare X vs Y" 
- company_proxy: Real companies NOT in entities (ANZ, Tesla, Amazon)

If company name mentioned → company_proxy + add to unknown_entities.
`;

    const response = await this.llmManager.generateText(prompt, {
      temperature: 0.1,
      maxTokens: 400
    }, null, { company: query, stage: 'intent_classification' });

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
    
    console.log(`[ExecutionPlanner] Cleaned response for parsing: "${cleanResponse}"`);
    
    try {
      const parsedResponse = ResponseSanitizer.parseAndValidateJSON(response, ResponseValidator.validateIntentAnalysis);
      
      console.log(`[ExecutionPlanner] Successfully parsed and validated response:`, parsedResponse);
      console.log(`[ExecutionPlanner] Query type detected: "${parsedResponse.query_type}"`);
      console.log(`[ExecutionPlanner] Unknown entities: ${JSON.stringify(parsedResponse.unknown_entities)}`);
      console.log(`[ExecutionPlanner] Requires company mapping: ${parsedResponse.requires_company_mapping}`);
      
      return parsedResponse;
    } catch (parseError) {
      console.error('[ExecutionPlanner] JSON parsing/validation failed:', parseError);
      console.error('[ExecutionPlanner] Original response was:', response?.substring(0, 500));
      
      // Enhanced error recovery with business context detection
      const businessContextFallback = this.detectBusinessContextFallback(query, response);
      if (businessContextFallback) {
        console.log('[ExecutionPlanner] Using business context fallback due to parsing failure');
        return businessContextFallback;
      }
      
      throw new Error(`Intent classification failed: ${parseError.message}`);
    }
  }

  async handleCompanyProxyQuery(query, intentAnalysis, conversationHistory) {
    console.log('[ExecutionPlanner] ========== BUSINESS CONTEXT WORKFLOW ACTIVATED ==========');
    console.log(`[ExecutionPlanner] Company proxy query detected for: "${intentAnalysis.unknown_entities[0]}"`);
    console.log(`[ExecutionPlanner] Original query: "${query}"`);
    console.log(`[ExecutionPlanner] Intent analysis:`, intentAnalysis);
    
    try {
      // LLM Call #2: Company-to-Graph Mapping
      console.log('[ExecutionPlanner] Stage 2/4: Mapping company to graph entities...');
      const companyMapping = await this.mapCompanyToGraphEntities(
        intentAnalysis.unknown_entities[0], 
        intentAnalysis
      );
      console.log('[ExecutionPlanner] Company mapping completed:', companyMapping);
      
      // LLM Call #3: Query Transformation
      console.log('[ExecutionPlanner] Stage 3/4: Transforming query with business context...');
      const transformedQuery = await this.transformQueryWithProxies(
        query, 
        companyMapping, 
        intentAnalysis
      );
      console.log('[ExecutionPlanner] Query transformation completed:', transformedQuery);
      
      // LLM Call #4: Generate Final Execution Plan
      console.log('[ExecutionPlanner] Stage 4/4: Generating final execution plan...');
      const executionPlan = await this.generateFinalExecutionPlan(transformedQuery, companyMapping);
      console.log('[ExecutionPlanner] Final execution plan generated with', executionPlan.plan?.length || 0, 'steps');
      console.log('[ExecutionPlanner] ========== BUSINESS CONTEXT WORKFLOW COMPLETE ==========');
      
      return executionPlan;
    } catch (error) {
      console.error('[ExecutionPlanner] ========== BUSINESS CONTEXT WORKFLOW FAILED ==========');
      console.error('[ExecutionPlanner] Error in company proxy workflow:', error);
      
      // Fallback to basic clarification with business context awareness
      return {
        plan: [
          {
            task_type: 'clarify_with_user',
            params: {
              message: `I understand you're asking about ${intentAnalysis.unknown_entities[0]}, but I encountered an issue processing the business context. Let me help you with what's available in our database.`,
              suggestions: ['Show me all industries', 'Find pain points in banking', 'Browse available sectors'],
              business_context_error: true,
              original_company: intentAnalysis.unknown_entities[0]
            },
            on_failure: 'halt',
            reasoning: 'Business context workflow failed, providing fallback with company awareness'
          }
        ]
      };
    }
  }

  async mapCompanyToGraphEntities(companyName, intentAnalysis) {
    console.log(`[ExecutionPlanner] LLM Call #2: Company-to-Graph Mapping for "${companyName}"`);
    
    // First, get actual available sectors from database for more accurate mapping
    const availableSectors = await this.getAvailableDatabaseSectors();
    
    const prompt = `
Map company to database sectors. Return ONLY JSON.

Available sectors: ${this.formatAvailableSectors(availableSectors)}
Company: "${companyName}"

JSON format:
{
  "company": "${companyName}",
  "business_context": "Brief description (max 50 words)",
  "actual_business_sectors": ["max 5 sectors"],
  "primary_industries": ["Banking", "Insurance"],
  "relevant_sectors": ["max 3 closest database matches"],
  "missing_sectors": ["max 3 missing sectors"],
  "business_impact_of_gaps": "Brief impact (max 30 words)",
  "data_completeness_score": 0.0-1.0,
  "reasoning": "1-2 words",
  "confidence": 0.0-1.0,
  "mapping_strategy": "use_closest_sectors|use_industry_broad|use_specific_match",
  "knowledge_source": "business_intelligence_with_gap_analysis",
  "transparency_note": "Brief note (max 20 words)"
}

Keep all fields concise. Focus on essential mapping only.
`;

    const response = await this.llmManager.generateText(prompt, {
      temperature: 0.2,
      maxTokens: 600
    }, null, { company: companyName, stage: 'company_mapping' });

    console.log(`[ExecutionPlanner] Raw company mapping response: "${response}"`);
    
    // Handle empty or undefined response
    if (!response || response.trim().length === 0) {
      console.error('[ExecutionPlanner] Empty response from LLM for company mapping');
      return {
        company: companyName,
        business_context: `${companyName} is a major company but detailed business intelligence is currently unavailable`,
        primary_industries: ["Banking", "Insurance"],
        relevant_sectors: ["Retail Banking", "Commercial Banking"],
        reasoning: "Using default mapping due to LLM response issue",
        confidence: 0.3,
        mapping_strategy: "use_industry_broad",
        knowledge_source: "fallback_mapping",
        transparency_note: "Limited business context available, using broad industry mapping"
      };
    }
    
    // Clean and parse JSON response
    let cleanResponse = response.trim();
    
    if (cleanResponse.startsWith('```json')) {
      cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    }
    if (cleanResponse.startsWith('```')) {
      cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    console.log(`[ExecutionPlanner] Cleaned company mapping response: "${cleanResponse}"`);
    
    try {
      const parsedMapping = ResponseSanitizer.parseAndValidateJSON(response, ResponseValidator.validateCompanyMapping);
      console.log(`[ExecutionPlanner] Successfully parsed and validated company mapping:`, parsedMapping);
      return parsedMapping;
    } catch (parseError) {
      // Check if this is a truncated response that we can retry
      if (parseError.isTruncated) {
        console.warn(`[ExecutionPlanner] Truncated JSON detected for company mapping, attempting retry with higher max tokens`);
        try {
          const retryResponse = await this.llmManager.generateText(prompt, {
            temperature: 0.2,
            maxTokens: 1600 // Quadruple the original limit (400 → 1600)
          }, null, { company: companyName, stage: 'company_mapping_retry' });
          
          const retryParsed = ResponseSanitizer.parseAndValidateJSON(retryResponse, ResponseValidator.validateCompanyMapping, { allowRetry: false });
          console.log(`[ExecutionPlanner] Retry successful for company mapping`);
          return retryParsed;
        } catch (retryError) {
          console.error(`[ExecutionPlanner] Company mapping retry failed:`, retryError);
          // Continue to fallback
        }
      }
      console.error('[ExecutionPlanner] Company mapping parsing/validation failed:', parseError);
      console.error('[ExecutionPlanner] Original response was:', response?.substring(0, 500));
      
      // Enhanced fallback with company-specific intelligence and gap analysis
      const inferredSectors = this.inferActualBusinessSectorsFromCompany(companyName);
      const availableSectors = this.inferSectorsFromCompany(companyName);
      const missingFromDatabase = inferredSectors.filter(sector => !availableSectors.includes(sector));
      
      return {
        company: companyName,
        business_context: `${companyName} is a major company. Encountered processing issue, using heuristic business intelligence mapping.`,
        actual_business_sectors: inferredSectors,
        primary_industries: this.inferIndustriesFromCompany(companyName),
        relevant_sectors: availableSectors,
        missing_sectors: missingFromDatabase,
        business_impact_of_gaps: missingFromDatabase.length > 0 ? 
          `Missing ${missingFromDatabase.join(', ')} sectors limits granular analysis of ${companyName}'s business divisions` : 
          'Database contains sufficient sector coverage for basic analysis',
        data_completeness_score: missingFromDatabase.length === 0 ? 0.8 : 0.4,
        reasoning: `Heuristic mapping for ${companyName} due to LLM response validation failure`,
        confidence: 0.4,
        mapping_strategy: "use_closest_sectors",
        knowledge_source: "fallback_with_heuristics_and_gap_analysis",
        transparency_note: `Encountered processing issue, using intelligent fallback mapping with gap analysis for ${companyName}`
      };
    }
  }

  async transformQueryWithProxies(originalQuery, companyMapping, intentAnalysis) {
    console.log('[ExecutionPlanner] LLM Call #3: Query Transformation with Proxies');
    
    const prompt = `
Transform query using database proxies. Return ONLY JSON.

Query: "${originalQuery}"
Company: ${companyMapping.company}
Proxies: ${companyMapping.relevant_sectors.join(', ')}

JSON format:
{
  "transformed_query": "Rewritten using ${companyMapping.relevant_sectors.join(', ')}",
  "consultant_response": "Brief response (max 50 words)",
  "business_context": "${companyMapping.business_context || 'Business context'}",
  "proxy_explanation": "Brief explanation (max 30 words)",
  "execution_strategy": "lookup|analytical|comparison", 
  "target_entities": ${JSON.stringify(companyMapping.relevant_sectors)},
  "transparency_message": "${companyMapping.company} not in database, using proxy mapping"
}
`;

    const response = await this.llmManager.generateText(prompt, {
      temperature: 0.1,
      maxTokens: 500
    }, null, { company: companyMapping.company, stage: 'query_transformation' });

    console.log(`[ExecutionPlanner] Raw query transformation response: "${response}"`);
    
    // Handle empty response
    if (!response || response.trim().length === 0) {
      console.error('[ExecutionPlanner] Empty response from LLM for query transformation');
      return {
        transformed_query: `Find all projects and pain points related to ${companyMapping.relevant_sectors.join(' and ')}`,
        consultant_response: `Based on business intelligence, ${companyMapping.company} operates in sectors similar to ${companyMapping.relevant_sectors.join(', ')}. I'll analyze our database for relevant project opportunities.`,
        business_context: companyMapping.business_context || `${companyMapping.company} is a major company`,
        proxy_explanation: `Using ${companyMapping.relevant_sectors.join(', ')} as proxies for ${companyMapping.company}'s business challenges`,
        execution_strategy: "lookup",
        target_entities: companyMapping.relevant_sectors,
        transparency_message: `${companyMapping.company} isn't in our project database, but based on business knowledge, I'm analyzing similar sectors`
      };
    }
    
    let cleanResponse = response.trim();
    if (cleanResponse.startsWith('```json')) {
      cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    }
    if (cleanResponse.startsWith('```')) {
      cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    console.log(`[ExecutionPlanner] Cleaned query transformation response: "${cleanResponse}"`);
    
    try {
      const parsedTransformation = ResponseSanitizer.parseAndValidateJSON(response, ResponseValidator.validateQueryTransformation);
      console.log(`[ExecutionPlanner] Successfully parsed and validated query transformation:`, parsedTransformation);
      return parsedTransformation;
    } catch (parseError) {
      console.error('[ExecutionPlanner] Query transformation parsing/validation failed:', parseError);
      console.error('[ExecutionPlanner] Original response was:', response?.substring(0, 500));
      
      // Enhanced fallback with business context preservation
      return {
        transformed_query: `Find all projects and pain points related to ${companyMapping.relevant_sectors.join(' and ')}`,
        consultant_response: `Based on business intelligence, ${companyMapping.company} operates in sectors similar to ${companyMapping.relevant_sectors.join(', ')}. I encountered a processing issue but will analyze our database using validated proxy mapping.`,
        business_context: companyMapping.business_context || `${companyMapping.company} is a major company`,
        proxy_explanation: `Using ${companyMapping.relevant_sectors.join(', ')} as validated proxies for ${companyMapping.company}'s business challenges`,
        execution_strategy: "lookup",
        target_entities: companyMapping.relevant_sectors,
        transparency_message: `${companyMapping.company} isn't in our project database, but I'm analyzing similar sectors using intelligent business mapping`
      };
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

CRITICAL: To find projects for sectors, use this path:
Sector -[:EXPERIENCES]-> PainPoint <-[:ADDRESSES]- ProjectOpportunity

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
      // Note: No specific validator for analytical decomposition yet, but use sanitization
      const parsedDecomposition = ResponseSanitizer.parseAndValidateJSON(response, null);
      console.log(`[ExecutionPlanner] Successfully parsed analytical decomposition:`, parsedDecomposition);
      return parsedDecomposition;
    } catch (parseError) {
      console.error('[ExecutionPlanner] Analytical decomposition parsing failed:', parseError);
      console.error('[ExecutionPlanner] Original response was:', response?.substring(0, 500));
      throw new Error(`Failed to parse analytical decomposition: ${parseError.message}`);
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
Generate EXACTLY 3 steps. Return ONLY JSON.

Company: ${companyMapping.company}
Sectors: ${companyMapping.relevant_sectors.join(', ')}

REQUIRED: Use this EXACT template with EXACTLY 3 steps:

{
  "plan": [
    {
      "task_type": "generate_cypher",
      "params": {
        "goal": "Find projects for ${companyMapping.company}",
        "entities": ${JSON.stringify(companyMapping.relevant_sectors)},
        "proxy_context": "Using proxy mapping",
        "business_intelligence_mode": true
      },
      "on_failure": "continue",
      "reasoning": "Query gen"
    },
    {
      "task_type": "execute_cypher", 
      "params": { "query": "$step1.output" },
      "on_failure": "continue",
      "reasoning": "Run query"
    },
    {
      "task_type": "analyze_and_summarize",
      "params": {
        "dataset": "$step2.output",
        "business_context": "${companyMapping.business_context}",
        "original_company": "${companyMapping.company}"
      },
      "on_failure": "continue", 
      "reasoning": "Analysis"
    }
  ]
}
`;

    const response = await this.llmManager.generateText(prompt, {
      temperature: 0.1,
      maxTokens: 800
    });

    console.log(`[ExecutionPlanner] Raw final execution plan response: "${response}"`);
    
    // Handle empty response
    if (!response || response.trim().length === 0) {
      console.error('[ExecutionPlanner] Empty response from LLM for final execution plan');
      return {
        plan: [
          {
            task_type: 'generate_cypher',
            params: {
              goal: `Find projects and opportunities related to ${companyMapping.relevant_sectors.join(' and ')}`,
              entities: companyMapping.relevant_sectors,
              proxy_context: transformedQuery.transparency_message || `Analyzing ${companyMapping.company} through similar sectors`
            },
            on_failure: 'continue',
            reasoning: `Generate query for ${companyMapping.company} using proxy sectors`
          },
          {
            task_type: 'execute_cypher',
            params: { query: '$step1.output' },
            on_failure: 'continue',
            reasoning: 'Execute the proxy query'
          },
          {
            task_type: 'analyze_and_summarize',
            params: {
              dataset: '$step2.output',
              business_context: companyMapping.business_context,
              consultant_response: transformedQuery.consultant_response,
              original_company: companyMapping.company,
              proxy_sectors: companyMapping.relevant_sectors.join(', ')
            },
            on_failure: 'continue',
            reasoning: 'Provide business context analysis with consultant-level insights'
          }
        ]
      };
    }
    
    let cleanResponse = response.trim();
    if (cleanResponse.startsWith('```json')) {
      cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    }
    if (cleanResponse.startsWith('```')) {
      cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    console.log(`[ExecutionPlanner] Cleaned final execution plan response: "${cleanResponse}"`);
    
    try {
      const parsedPlan = ResponseSanitizer.parseAndValidateJSON(response, ResponseValidator.validateExecutionPlan);
      console.log(`[ExecutionPlanner] Successfully parsed and validated final execution plan:`, parsedPlan);
      return parsedPlan;
    } catch (parseError) {
      // Check if this is a truncated response that we can retry
      if (parseError.isTruncated) {
        console.warn(`[ExecutionPlanner] Truncated JSON detected for execution plan, attempting retry with higher max tokens`);
        try {
          const retryResponse = await this.llmManager.generateText(prompt, {
            temperature: 0.1,
            maxTokens: 2400 // Quadruple the original limit (600 → 2400)
          });
          
          const retryParsed = ResponseSanitizer.parseAndValidateJSON(retryResponse, ResponseValidator.validateExecutionPlan, { allowRetry: false });
          console.log(`[ExecutionPlanner] Retry successful for execution plan`);
          return retryParsed;
        } catch (retryError) {
          console.error(`[ExecutionPlanner] Execution plan retry failed:`, retryError);
          // Continue to fallback
        }
      }
      
      console.error('[ExecutionPlanner] Final execution plan parsing/validation failed:', parseError);
      console.error('[ExecutionPlanner] Original response was:', response?.substring(0, 500));
      
      // Generate robust fallback execution plan
      return this.createFallbackBusinessPlan(companyMapping, transformedQuery, 'plan_generation_failed');
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
  
  detectBusinessContextFallback(query, response) {
    const queryLower = query.toLowerCase();
    const responseLower = (response || '').toLowerCase();
    
    const commonCompanyTerms = ['anz', 'tesla', 'amazon', 'netflix', 'microsoft', 'apple', 'google', 'facebook', 'uber', 'spotify', 'airbnb'];
    const mentionsCompany = commonCompanyTerms.some(term => queryLower.includes(term));
    const responseHasCompanyContext = commonCompanyTerms.some(term => responseLower.includes(term)) || 
                                     responseLower.includes('company_proxy') || 
                                     responseLower.includes('business');
    
    if (mentionsCompany || responseHasCompanyContext) {
      const detectedCompany = commonCompanyTerms.find(term => queryLower.includes(term) || responseLower.includes(term));
      const extractedCompany = detectedCompany ? detectedCompany.toUpperCase() : 
                              query.replace(/projects for |opportunities for |pain points for /i, '').trim();
      
      console.log(`[ExecutionPlanner] Business context fallback triggered for: ${extractedCompany}`);
      
      return {
        query_type: 'company_proxy',
        entities_mentioned: [],
        unknown_entities: [extractedCompany],
        requires_company_mapping: true,
        analytical_operation: null,
        confidence: 0.6,
        reasoning: 'Fallback classification with business context detection due to LLM parsing failure'
      };
    }
    
    return null;
  }
  
  inferIndustriesFromCompany(companyName) {
    const name = companyName.toLowerCase();
    
    if (name.includes('bank') || name.includes('anz') || name.includes('westpac') || name.includes('commonwealth') || name.includes('nab')) {
      return ['Banking'];
    }
    if (name.includes('insurance') || name.includes('axa') || name.includes('allianz')) {
      return ['Insurance'];
    }
    if (name.includes('tesla') || name.includes('amazon') || name.includes('google') || name.includes('microsoft')) {
      return ['Banking', 'Insurance']; // Default to both for tech companies
    }
    
    return ['Banking', 'Insurance']; // Default fallback
  }
  
  inferActualBusinessSectorsFromCompany(companyName) {
    // Infer what business sectors/divisions this company ACTUALLY operates in based on business knowledge
    const name = companyName.toLowerCase();
    
    if (name.includes('anz') || name.includes('westpac') || name.includes('commonwealth') || name.includes('nab')) {
      // Australian Big 4 banks have specific divisions
      return ['Personal Banking', 'Business Banking', 'Institutional Banking', 'Wealth Management', 'Insurance Services'];
    }
    if (name.includes('tesla')) {
      return ['Electric Vehicles', 'Energy Storage', 'Autonomous Driving', 'Solar Energy', 'Charging Networks'];
    }
    if (name.includes('amazon')) {
      return ['E-commerce', 'Cloud Computing (AWS)', 'Digital Advertising', 'Logistics & Fulfillment', 'Digital Streaming'];
    }
    if (name.includes('apple')) {
      return ['Consumer Electronics', 'Software & Services', 'Digital Content', 'Retail Stores', 'Financial Services'];
    }
    if (name.includes('google') || name.includes('alphabet')) {
      return ['Search & Advertising', 'Cloud Computing', 'Hardware', 'Autonomous Vehicles', 'Healthcare Technology'];
    }
    
    // Generic business sectors for unknown companies
    return ['Core Business', 'Customer Services', 'Digital Services', 'Operations'];
  }
  
  inferSectorsFromCompany(companyName) {
    // Map to available database sectors (simplified for proof of concept)
    const name = companyName.toLowerCase();
    
    if (name.includes('bank') || name.includes('anz') || name.includes('westpac') || name.includes('commonwealth') || name.includes('nab')) {
      return ['Banking']; // Simplified to what's likely in database
    }
    if (name.includes('insurance') || name.includes('axa') || name.includes('allianz')) {
      return ['Insurance'];
    }
    if (name.includes('tesla') || name.includes('amazon') || name.includes('google') || name.includes('microsoft') || name.includes('apple')) {
      return ['Banking', 'Insurance']; // Fallback to available industries
    }
    
    // Default mapping for major companies
    return ['Banking', 'Insurance'];
  }
  
  async getAvailableDatabaseSectors() {
    // Get real-time database sectors for more accurate mapping
    if (!this.driver) {
      console.warn('[ExecutionPlanner] No database driver available, using schema defaults');
      return {
        Banking: ['Retail Banking', 'Commercial Banking', 'Investment Banking', 'Private Banking', 'Credit Unions', 'Online Banking'],
        Insurance: ['Life Insurance', 'Health Insurance', 'Property Insurance', 'Casualty Insurance']
      };
    }

    const session = this.driver.session();
    try {
      const result = await session.run(`
        MATCH (i:Industry)-[:HAS_SECTOR]->(s:Sector)
        RETURN i.name as industry, collect(s.name) as sectors
        ORDER BY i.name
      `);
      
      const availableSectors = {};
      result.records.forEach(record => {
        const industry = record.get('industry');
        const sectors = record.get('sectors');
        availableSectors[industry] = sectors;
      });
      
      console.log('[ExecutionPlanner] Retrieved available sectors from database:', availableSectors);
      return availableSectors;
    } catch (error) {
      console.error('[ExecutionPlanner] Error retrieving database sectors:', error);
      // Fallback to schema defaults
      return {
        Banking: ['Banking'], // Simplified fallback
        Insurance: ['Insurance']
      };
    } finally {
      await session.close();
    }
  }

  formatAvailableSectors(availableSectors) {
    const formatted = Object.entries(availableSectors)
      .map(([industry, sectors]) => `- ${industry}: ${sectors.join(', ')}`)
      .join('\n');
    
    return formatted || '- Banking: General Banking\n- Insurance: General Insurance';
  }

  createFallbackBusinessPlan(companyMapping, transformedQuery, errorReason) {
    console.log(`[ExecutionPlanner] Creating fallback business plan due to: ${errorReason}`);
    
    return {
      plan: [
        {
          task_type: 'generate_cypher',
          params: {
            goal: `Find projects and opportunities related to ${companyMapping.relevant_sectors.join(' and ')}`,
            entities: companyMapping.relevant_sectors,
            proxy_context: transformedQuery.transparency_message || `Analyzing ${companyMapping.company} through validated proxy sectors`,
            fallback_reason: errorReason
          },
          on_failure: 'continue',
          reasoning: `Generate validated query for ${companyMapping.company} using proxy sectors (${errorReason})`
        },
        {
          task_type: 'execute_cypher',
          params: { query: '$step1.output' },
          on_failure: 'continue',
          reasoning: 'Execute the business proxy query'
        },
        {
          task_type: 'analyze_and_summarize',
          params: {
            dataset: '$step2.output',
            business_context: companyMapping.business_context,
            consultant_response: transformedQuery.consultant_response,
            original_company: companyMapping.company,
            proxy_sectors: companyMapping.relevant_sectors.join(', '),
            missing_sectors: companyMapping.missing_sectors ? companyMapping.missing_sectors.join(', ') : null,
            business_impact_of_gaps: companyMapping.business_impact_of_gaps,
            data_completeness_score: companyMapping.data_completeness_score,
            fallback_context: `Processing issue handled through validated fallback (${errorReason})`
          },
          on_failure: 'continue',
          reasoning: 'Provide robust business context analysis with consultant-level insights and gap analysis'
        }
      ]
    };
  }
}

module.exports = ExecutionPlanner;