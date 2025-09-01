const GroqProvider = require('./GroqProvider');
const GeminiProvider = require('./GeminiProvider');

/**
 * LLM Manager handles provider selection, fallback, and load balancing
 * Provides a unified interface for all LLM operations
 */
class LLMManager {
  constructor(config = {}) {
    this.config = config;
    this.providers = new Map();
    this.primaryProvider = null;
    this.fallbackProviders = [];
    this.currentProvider = null;
    
    this.initializeProviders();
  }

  /**
   * Initialize all available providers based on configuration
   */
  initializeProviders() {
    // Initialize Groq provider
    if (process.env.GROQ_API_KEY) {
      const groqProvider = new GroqProvider({
        apiKey: process.env.GROQ_API_KEY,
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
      });
      this.providers.set('groq', groqProvider);
    }

    // Initialize Gemini provider
    if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
      const geminiProvider = new GeminiProvider({
        apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
        model: process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp'
      });
      this.providers.set('gemini', geminiProvider);
    }

    this.setupProviderHierarchy();
  }

  /**
   * Setup primary and fallback providers based on configuration
   */
  setupProviderHierarchy() {
    const primaryProviderName = process.env.LLM_PRIMARY_PROVIDER || 'groq';
    const fallbackProviderNames = process.env.LLM_FALLBACK_PROVIDERS 
      ? process.env.LLM_FALLBACK_PROVIDERS.split(',').map(name => name.trim())
      : ['gemini'];

    // Set primary provider
    this.primaryProvider = this.providers.get(primaryProviderName);
    this.currentProvider = this.primaryProvider;

    // Set fallback providers
    this.fallbackProviders = fallbackProviderNames
      .map(name => this.providers.get(name))
      .filter(provider => provider && provider.isConfigured());

    console.log(`[LLMManager] Primary provider: ${primaryProviderName}`);
    console.log(`[LLMManager] Fallback providers: ${fallbackProviderNames.join(', ')}`);
    console.log(`[LLMManager] Available providers: ${Array.from(this.providers.keys()).join(', ')}`);
  }

  /**
   * Get the next available provider for fallback
   * @returns {LLMProvider|null} Next available provider or null
   */
  getNextProvider() {
    const currentIndex = this.fallbackProviders.indexOf(this.currentProvider);
    const nextIndex = currentIndex + 1;
    
    if (nextIndex < this.fallbackProviders.length) {
      return this.fallbackProviders[nextIndex];
    }
    
    return null;
  }

  /**
   * Switch to the next available provider
   * @returns {boolean} True if successfully switched, false if no more providers
   */
  switchToNextProvider() {
    const nextProvider = this.getNextProvider();
    
    if (nextProvider) {
      console.log(`[LLMManager] Switching from ${this.currentProvider?.name} to ${nextProvider.name}`);
      this.currentProvider = nextProvider;
      return true;
    }
    
    console.log(`[LLMManager] No more providers available for fallback`);
    return false;
  }

  /**
   * Reset to primary provider (useful after cooldown periods)
   */
  resetToPrimaryProvider() {
    if (this.primaryProvider && this.primaryProvider.isConfigured()) {
      console.log(`[LLMManager] Resetting to primary provider: ${this.primaryProvider.name}`);
      this.currentProvider = this.primaryProvider;
    }
  }

  /**
   * Generate text with automatic fallback on quota exceeded
   * @param {string} prompt - The input prompt
   * @param {Object} options - Generation options
   * @param {number} maxRetries - Maximum number of provider fallbacks
   * @returns {Promise<string>} Generated text response
   */
  async generateText(prompt, options = {}, maxRetries = null) {
    const maxAttempts = maxRetries !== null ? maxRetries : this.fallbackProviders.length;
    let attempts = 0;
    let lastError = null;

    while (attempts <= maxAttempts) {
      if (!this.currentProvider) {
        throw new Error('No LLM providers configured. Please set API keys for at least one provider.');
      }

      try {
        console.log(`[LLMManager] Using provider: ${this.currentProvider.name} (attempt ${attempts + 1})`);
        const result = await this.currentProvider.generateText(prompt, options);
        
        // Success - reset to primary provider for next request if we're not already using it
        if (this.currentProvider !== this.primaryProvider && attempts > 0) {
          setTimeout(() => this.resetToPrimaryProvider(), 5000); // Reset after 5 seconds
        }
        
        return result;
      } catch (error) {
        lastError = error;
        console.error(`[LLMManager] Provider ${this.currentProvider.name} failed:`, error.message);

        // Check if it's a quota exceeded error
        if (this.currentProvider.isQuotaExceeded(error)) {
          console.log(`[LLMManager] Quota exceeded for ${this.currentProvider.name}, attempting fallback`);
          
          if (!this.switchToNextProvider()) {
            throw new Error(`All providers exhausted. Last error from ${this.currentProvider?.name}: ${error.message}`);
          }
          
          attempts++;
          continue;
        }
        
        // If it's not a quota error, don't try other providers
        throw error;
      }
    }

    throw new Error(`All providers failed. Last error: ${lastError?.message}`);
  }

  /**
   * Generate JSON with automatic fallback
   * @param {string} prompt - The input prompt
   * @param {Object} schema - Expected JSON schema (optional)
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Parsed JSON response
   */
  async generateJSON(prompt, schema = null, options = {}) {
    const response = await this.generateText(prompt, options);
    
    // Use the current provider's JSON parsing logic
    return this.currentProvider.parseJSONResponse(response);
  }

  /**
   * Get information about all providers
   * @returns {Array<Object>} Array of provider information
   */
  getProvidersInfo() {
    return Array.from(this.providers.values()).map(provider => provider.getInfo());
  }

  /**
   * Get current provider information
   * @returns {Object|null} Current provider info
   */
  getCurrentProviderInfo() {
    return this.currentProvider ? this.currentProvider.getInfo() : null;
  }

  /**
   * Check if the manager has any configured providers
   * @returns {boolean} True if at least one provider is configured
   */
  hasConfiguredProviders() {
    return Array.from(this.providers.values()).some(provider => provider.isConfigured());
  }
}

// Create and export singleton instance
const llmManager = new LLMManager();
module.exports = llmManager;