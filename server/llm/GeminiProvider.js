const LLMProvider = require('./LLMProvider');

/**
 * Gemini provider for LLM operations using Google's Generative AI
 * Extracted from existing codebase implementation
 */
class GeminiProvider extends LLMProvider {
  constructor(config = {}) {
    super({
      name: 'gemini',
      model: config.model || 'gemini-2.0-flash-exp',
      apiKey: config.apiKey,
      ...config
    });
    
    this.genAI = null;
    
    // Initialize Gemini client if configured
    if (this.isConfigured()) {
      this.initializeGemini();
    }
  }

  initializeGemini() {
    try {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      this.genAI = new GoogleGenerativeAI(this.apiKey);
    } catch (error) {
      console.error('[GeminiProvider] Failed to initialize Gemini client:', error);
      throw new Error('Failed to initialize Gemini client. Please ensure @google/generative-ai is installed.');
    }
  }

  /**
   * Generate text response using Gemini's generateContent API
   * @param {string} prompt - The input prompt
   * @param {Object} options - Generation options
   * @returns {Promise<string>} Generated text response
   */
  async generateText(prompt, options = {}) {
    if (!this.genAI) {
      throw new Error('Gemini provider not configured. Please set GEMINI_API_KEY.');
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: this.model });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error(`[${this.name}] Generation error:`, error);
      
      // Enhance error with quota detection
      if (this.isQuotaExceeded(error)) {
        const enhancedError = new Error(`Gemini quota exceeded: ${error.message}`);
        enhancedError.isQuotaExceeded = true;
        enhancedError.originalError = error;
        enhancedError.status = error.status;
        throw enhancedError;
      }
      
      throw error;
    }
  }

  /**
   * Check if an error indicates quota/rate limit exceeded for Gemini
   * @param {Error} error - The error to check
   * @returns {boolean} True if quota exceeded
   */
  isQuotaExceeded(error) {
    if (!error) return false;
    
    const message = error.message?.toLowerCase() || '';
    const status = error.status || error.statusCode;
    
    // Gemini-specific quota indicators
    return (
      status === 429 || // Too Many Requests
      status === 402 || // Payment Required
      message.includes('quota') ||
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('exceeded') ||
      message.includes('current quota') ||
      message.includes('billing details') ||
      // Gemini-specific error messages
      message.includes('generativelanguage.googleapis.com') ||
      message.includes('quotafailure')
    );
  }

  /**
   * Get provider-specific information
   * @returns {Object} Provider info including model details
   */
  getInfo() {
    return {
      ...super.getInfo(),
      baseURL: 'https://generativelanguage.googleapis.com',
      supportsStreaming: false,
      maxTokens: 32768, // Gemini 2.0 Flash context length
      pricing: {
        input: 'Free tier: 50 requests/day',
        paid: '$0.075 per 1M tokens'
      }
    };
  }
}

module.exports = GeminiProvider;