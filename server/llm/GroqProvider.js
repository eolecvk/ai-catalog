const LLMProvider = require('./LLMProvider');

/**
 * Groq provider for LLM operations using Llama models
 * Uses Groq's OpenAI-compatible chat completions API
 */
class GroqProvider extends LLMProvider {
  constructor(config = {}) {
    super({
      name: 'groq',
      model: config.model || 'llama-3.3-70b-versatile',
      apiKey: config.apiKey,
      ...config
    });
    
    this.baseURL = 'https://api.groq.com/openai/v1';
    this.groq = null;
    
    // Initialize Groq client if configured
    if (this.isConfigured()) {
      this.initializeGroq();
    }
  }

  initializeGroq() {
    try {
      const Groq = require('groq-sdk');
      this.groq = new Groq({
        apiKey: this.apiKey
      });
    } catch (error) {
      console.error('[GroqProvider] Failed to initialize Groq client:', error);
      throw new Error('Failed to initialize Groq client. Please ensure groq-sdk is installed.');
    }
  }

  /**
   * Generate text response using Groq's chat completions API
   * @param {string} prompt - The input prompt
   * @param {Object} options - Generation options
   * @returns {Promise<string>} Generated text response
   */
  async generateText(prompt, options = {}) {
    if (!this.groq) {
      throw new Error('Groq provider not configured. Please set GROQ_API_KEY.');
    }

    try {
      const response = await this.groq.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 4000,
        top_p: options.topP || 1,
        stream: false
      });

      if (!response.choices || response.choices.length === 0) {
        throw new Error('No response generated from Groq');
      }

      return response.choices[0].message.content;
    } catch (error) {
      console.error(`[${this.name}] Generation error:`, error);
      
      // Enhance error with quota detection
      if (this.isQuotaExceeded(error)) {
        const enhancedError = new Error(`Groq quota exceeded: ${error.message}`);
        enhancedError.isQuotaExceeded = true;
        enhancedError.originalError = error;
        enhancedError.status = error.status;
        throw enhancedError;
      }
      
      throw error;
    }
  }

  /**
   * Check if an error indicates quota/rate limit exceeded for Groq
   * @param {Error} error - The error to check
   * @returns {boolean} True if quota exceeded
   */
  isQuotaExceeded(error) {
    if (!error) return false;
    
    const message = error.message?.toLowerCase() || '';
    const status = error.status || error.statusCode;
    
    // Groq-specific quota indicators
    return (
      status === 429 || // Too Many Requests
      status === 402 || // Payment Required
      message.includes('rate limit') ||
      message.includes('quota') ||
      message.includes('too many requests') ||
      message.includes('exceeded') ||
      message.includes('limit reached') ||
      // Groq might return different error messages
      message.includes('daily limit') ||
      message.includes('monthly limit')
    );
  }

  /**
   * Get provider-specific information
   * @returns {Object} Provider info including model details
   */
  getInfo() {
    return {
      ...super.getInfo(),
      baseURL: this.baseURL,
      supportsStreaming: true,
      maxTokens: 8192, // Llama 3.3 70B context length
      pricing: {
        input: '$0.59 per 1M tokens',
        output: '$0.79 per 1M tokens'
      }
    };
  }
}

module.exports = GroqProvider;