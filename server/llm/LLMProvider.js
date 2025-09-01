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
   * Parse JSON response with error handling
   * @param {string} text - Raw text response
   * @returns {Object} Parsed JSON object
   */
  parseJSONResponse(text) {
    try {
      let cleanText = text.trim();
      
      // Remove common markdown code blocks
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
      
      return JSON.parse(cleanText.trim());
    } catch (parseError) {
      console.error(`[${this.name}] Failed to parse JSON response:`, parseError);
      console.error(`[${this.name}] Raw response:`, text);
      throw new Error(`Failed to parse JSON response from ${this.name}: ${parseError.message}`);
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