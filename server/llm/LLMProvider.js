/**
 * Abstract base class for LLM providers
 * Defines the standard interface that all providers must implement
 */
class LLMProvider {
  constructor(config = {}) {
    this.config = config;
    this.name = config.name || 'unknown';
    this.model = config.model;
    this.apiKey = config.apiKey;
  }

  /**
   * Generate text response from a prompt
   * @param {string} prompt - The input prompt
   * @param {Object} options - Generation options (temperature, maxTokens, etc.)
   * @returns {Promise<string>} Generated text response
   */
  async generateText(prompt, options = {}) {
    throw new Error('generateText must be implemented by subclass');
  }

  /**
   * Generate structured JSON response from a prompt
   * @param {string} prompt - The input prompt
   * @param {Object} schema - Expected JSON schema (optional, for validation)
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Parsed JSON response
   */
  async generateJSON(prompt, schema = null, options = {}) {
    const response = await this.generateText(prompt, options);
    return this.parseJSONResponse(response);
  }

  /**
   * Parse JSON response with robust error handling for different providers
   * @param {string} text - Raw text response
   * @returns {Object} Parsed JSON object
   */
  parseJSONResponse(text) {
    if (!text || typeof text !== 'string') {
      throw new Error(`Invalid response text: ${typeof text}`);
    }

    let cleanText = text.trim();
    // console.log(`[${this.name}] Raw response:`, cleanText.substring(0, 200) + (cleanText.length > 200 ? '...' : ''));

    // Strategy 1: Try parsing as-is first
    try {
      return JSON.parse(cleanText);
    } catch (e) {
      // Strategy 1.1: Try cleaning multiline strings first
      try {
        const normalizedText = this.cleanMultilineStrings(cleanText);
        return JSON.parse(normalizedText);
      } catch (e2) {
        // Continue to cleaning strategies
      }
    }

    // Strategy 2: Remove common markdown code blocks
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.slice(7);
    } else if (cleanText.startsWith('```')) {
      const firstNewline = cleanText.indexOf('\n');
      if (firstNewline !== -1) {
        cleanText = cleanText.slice(firstNewline + 1);
      }
    }
    
    if (cleanText.endsWith('```')) {
      cleanText = cleanText.slice(0, -3);
    }

    // Strategy 3: Try after markdown cleanup
    try {
      return JSON.parse(cleanText.trim());
    } catch (e) {
      // Strategy 3.1: Try cleaning multiline strings
      try {
        const normalizedText = this.cleanMultilineStrings(cleanText);
        return JSON.parse(normalizedText.trim());
      } catch (e2) {
        // Continue to more aggressive strategies
      }
    }

    // Strategy 4: Extract JSON from mixed text (handle "Here's the JSON:" type responses)
    const jsonPatterns = [
      /\{[\s\S]*\}/,  // Find first complete JSON object
      /\[[\s\S]*\]/,  // Find first complete JSON array
    ];

    for (const pattern of jsonPatterns) {
      const match = cleanText.match(pattern);
      if (match) {
        try {
          let jsonText = match[0].trim();
          
          // Strategy 4.1: Try as-is first
          try {
            // console.log(`[${this.name}] Extracted JSON:`, jsonText.substring(0, 100) + '...');
            return JSON.parse(jsonText);
          } catch (e) {
            // If normal parsing fails, try cleaning multiline strings
            jsonText = this.cleanMultilineStrings(jsonText);
            return JSON.parse(jsonText);
          }
        } catch (e) {
          // Continue to next pattern
        }
      }
    }

    // Strategy 5: Try to find JSON after common prefixes
    const commonPrefixes = [
      'The JSON response is:',
      'Here is the JSON:',
      'JSON:',
      'Response:',
      'Here\'s the response:',
      'The response is:',
    ];

    for (const prefix of commonPrefixes) {
      const prefixIndex = cleanText.toLowerCase().indexOf(prefix.toLowerCase());
      if (prefixIndex !== -1) {
        const afterPrefix = cleanText.slice(prefixIndex + prefix.length).trim();
        try {
          return JSON.parse(afterPrefix);
        } catch (e) {
          // Try extracting JSON from after prefix
          const match = afterPrefix.match(/\{[\s\S]*\}/);
          if (match) {
            try {
              return JSON.parse(match[0]);
            } catch (e2) {
              // Continue to next prefix
            }
          }
        }
      }
    }

    // Strategy 6: Split by lines and find JSON-like lines
    const lines = cleanText.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('{')) {
        // Try to parse from this line to end
        const remainingText = lines.slice(i).join('\n').trim();
        try {
          return JSON.parse(remainingText);
        } catch (e) {
          // Try just this line
          try {
            return JSON.parse(line);
          } catch (e2) {
            // Continue to next line
          }
        }
      }
    }

    // Final attempt: Log detailed error and throw
    console.error(`[${this.name}] All JSON parsing strategies failed`);
    console.error(`[${this.name}] Original text length:`, text.length);
    console.error(`[${this.name}] Cleaned text:`, cleanText);
    console.error(`[${this.name}] First 500 chars:`, text.substring(0, 500));
    
    throw new Error(`Failed to parse JSON response from ${this.name}. Unable to extract valid JSON from response.`);
  }

  /**
   * Clean multiline strings in JSON that may contain invalid newlines
   * @param {string} jsonText - Raw JSON text with potential multiline string issues
   * @returns {string} Cleaned JSON text
   */
  cleanMultilineStrings(jsonText) {
    try {
      // Strategy: Find string values that span multiple lines and normalize them
      // This handles cases where Groq returns JSON like:
      // "cypherQuery": "
      //   MATCH (n)
      //   RETURN n
      // "
      
      // Replace multiline string values with normalized single-line strings
      // Find pattern: "key": "value with
      //                      newlines"
      const multilineStringPattern = /("[\w]+"\s*:\s*")([^"]*?)(")/gs;
      
      return jsonText.replace(multilineStringPattern, (match, openQuote, content, closeQuote) => {
        // Clean the content: remove extra whitespace and normalize newlines
        const cleanContent = content
          .replace(/\n\s*/g, ' ')  // Replace newlines + whitespace with single space
          .replace(/\s+/g, ' ')    // Replace multiple spaces with single space
          .trim();
        
        return openQuote + cleanContent + closeQuote;
      });
    } catch (error) {
      console.error(`[${this.name}] Error cleaning multiline strings:`, error);
      return jsonText; // Return original if cleaning fails
    }
  }

  /**
   * Check if an error indicates quota/rate limit exceeded
   * @param {Error} error - The error to check
   * @returns {boolean} True if quota exceeded
   */
  isQuotaExceeded(error) {
    if (!error) return false;
    
    const message = error.message?.toLowerCase() || '';
    const status = error.status || error.statusCode;
    
    // Common quota exceeded indicators
    return (
      status === 429 || // Too Many Requests
      status === 402 || // Payment Required
      message.includes('quota') ||
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('exceeded')
    );
  }

  /**
   * Check if the provider is properly configured
   * @returns {boolean} True if configured
   */
  isConfigured() {
    return !!(this.apiKey && this.model);
  }

  /**
   * Get provider information
   * @returns {Object} Provider info
   */
  getInfo() {
    return {
      name: this.name,
      model: this.model,
      configured: this.isConfigured()
    };
  }
}

module.exports = LLMProvider;