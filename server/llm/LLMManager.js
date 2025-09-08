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
    
    // Exponential backoff and quota tracking
    this.providerCooldowns = new Map(); // Track when providers can be used again
    this.backoffMultiplier = 1.5; // Exponential backoff multiplier
    this.baseBackoffMs = 1000; // Base backoff time (1 second)
    this.maxBackoffMs = 60000; // Maximum backoff time (1 minute)
    this.maxRetryAttempts = 5; // Maximum retry attempts per provider
    
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
   * Check if a provider is in cooldown period
   * @param {string} providerName - Name of the provider
   * @returns {boolean} True if provider is in cooldown
   */
  isProviderInCooldown(providerName) {
    const cooldownUntil = this.providerCooldowns.get(providerName);
    return cooldownUntil && Date.now() < cooldownUntil;
  }

  /**
   * Get remaining cooldown time for a provider
   * @param {string} providerName - Name of the provider
   * @returns {number} Remaining cooldown time in milliseconds
   */
  getRemainingCooldown(providerName) {
    const cooldownUntil = this.providerCooldowns.get(providerName);
    if (!cooldownUntil) return 0;
    return Math.max(0, cooldownUntil - Date.now());
  }

  /**
   * Set provider cooldown with exponential backoff
   * @param {string} providerName - Name of the provider
   * @param {number} attemptNumber - Current attempt number (0-based)
   */
  setProviderCooldown(providerName, attemptNumber = 0) {
    const backoffMs = Math.min(
      this.baseBackoffMs * Math.pow(this.backoffMultiplier, attemptNumber),
      this.maxBackoffMs
    );
    
    const cooldownUntil = Date.now() + backoffMs;
    this.providerCooldowns.set(providerName, cooldownUntil);
    
    console.log(`[LLMManager] 🕒 Provider ${providerName} in cooldown for ${Math.round(backoffMs/1000)}s (attempt ${attemptNumber + 1})`);
    return backoffMs;
  }

  /**
   * Clear cooldown for a provider (on success)
   * @param {string} providerName - Name of the provider
   */
  clearProviderCooldown(providerName) {
    if (this.providerCooldowns.has(providerName)) {
      console.log(`[LLMManager] ✅ Clearing cooldown for ${providerName}`);
      this.providerCooldowns.delete(providerName);
    }
  }

  /**
   * Get next available provider that's not in cooldown
   * @returns {LLMProvider|null} Next available provider or null
   */
  getNextAvailableProvider() {
    // First, try to find a provider that's not in cooldown
    for (const provider of this.fallbackProviders) {
      if (!this.isProviderInCooldown(provider.name)) {
        return provider;
      }
    }
    
    // If all are in cooldown, return the one with shortest cooldown
    let shortestCooldown = Infinity;
    let bestProvider = null;
    
    for (const provider of this.fallbackProviders) {
      const remainingCooldown = this.getRemainingCooldown(provider.name);
      if (remainingCooldown < shortestCooldown) {
        shortestCooldown = remainingCooldown;
        bestProvider = provider;
      }
    }
    
    return bestProvider;
  }

  /**
   * Generate text with exponential backoff and automatic fallback
   * @param {string} prompt - The input prompt
   * @param {Object} options - Generation options
   * @param {number} maxRetries - Maximum number of provider fallbacks
   * @param {Object} businessContext - Business context to preserve during failover
   * @returns {Promise<string>} Generated text response
   */
  async generateText(prompt, options = {}, maxRetries = null, businessContext = null) {
    const startTime = Date.now();
    const maxAttempts = maxRetries !== null ? maxRetries : this.maxRetryAttempts;
    let globalAttempts = 0;
    let lastError = null;
    const failedProviders = [];
    const retryState = { isRetrying: false, currentBackoff: 0, totalWaitTime: 0 };

    // Enhanced logging for business context workflows
    if (businessContext) {
      console.log(`[LLMManager] 🏢 Business context workflow detected for: ${businessContext.company || 'unknown company'}`);
    }

    // Check if current provider is in cooldown and switch if needed
    if (this.isProviderInCooldown(this.currentProvider?.name)) {
      const remainingCooldown = this.getRemainingCooldown(this.currentProvider.name);
      console.log(`[LLMManager] 🕒 Current provider ${this.currentProvider.name} in cooldown for ${Math.round(remainingCooldown/1000)}s, switching`);
      
      const nextProvider = this.getNextAvailableProvider();
      if (nextProvider) {
        this.currentProvider = nextProvider;
      }
    }

    while (globalAttempts < maxAttempts) {
      if (!this.currentProvider) {
        throw new Error('No LLM providers configured. Please set API keys for at least one provider.');
      }

      // Check if we need to wait for cooldown
      if (this.isProviderInCooldown(this.currentProvider.name)) {
        const remainingCooldown = this.getRemainingCooldown(this.currentProvider.name);
        
        if (remainingCooldown > 0) {
          retryState.isRetrying = true;
          retryState.currentBackoff = remainingCooldown;
          retryState.totalWaitTime += remainingCooldown;
          
          console.log(`[LLMManager] ⏰ Waiting ${Math.round(remainingCooldown/1000)}s for ${this.currentProvider.name} cooldown`);
          
          // Send backoff notification to frontend
          this.notifyBackoffStatus({
            isRetrying: true,
            provider: this.currentProvider.name,
            waitTimeMs: remainingCooldown,
            totalWaitTime: retryState.totalWaitTime,
            attempt: globalAttempts + 1,
            maxAttempts,
            businessContext
          });
          
          await this.sleep(remainingCooldown);
        }
      }

      let providerAttempts = 0;
      const maxProviderAttempts = 3; // Max attempts per provider before switching

      while (providerAttempts < maxProviderAttempts && globalAttempts < maxAttempts) {
        try {
          console.log(`[LLMManager] 🚀 Using provider: ${this.currentProvider.name} (global: ${globalAttempts + 1}/${maxAttempts}, provider: ${providerAttempts + 1}/${maxProviderAttempts})`);
          
          // Add timeout handling for business context workflows
          const timeoutMs = businessContext ? 30000 : 15000;
          const result = await Promise.race([
            this.currentProvider.generateText(prompt, options),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
            )
          ]);
          
          // Success - clear cooldowns and log
          this.clearProviderCooldown(this.currentProvider.name);
          
          if (businessContext) {
            console.log(`[LLMManager] ✅ Business context workflow completed with ${this.currentProvider.name}`);
          }
          
          const totalTime = Date.now() - startTime;
          console.log(`[LLMManager] ✅ Request completed in ${totalTime}ms (${globalAttempts + 1} attempts, ${Math.round(retryState.totalWaitTime/1000)}s wait time)`);
          
          // Reset to primary provider after successful fallback
          if (this.currentProvider !== this.primaryProvider && globalAttempts > 0) {
            setTimeout(() => this.resetToPrimaryProvider(), 5000);
          }
          
          return result;
          
        } catch (error) {
          lastError = error;
          const providerName = this.currentProvider.name;
          
          failedProviders.push({
            name: providerName,
            error: error.message,
            timestamp: Date.now(),
            attempt: globalAttempts + 1
          });

          console.error(`[LLMManager] ❌ Provider ${providerName} failed (attempt ${globalAttempts + 1}):`, error.message);

          // Check if this is a quota/rate limit error
          const isQuotaError = this.currentProvider.isQuotaExceeded(error) || this.isRateLimitError(error);
          const isRecoverableError = (
            isQuotaError ||
            this.isAccessDeniedError(error) ||
            this.isTimeoutError(error) ||
            this.isTemporaryError(error)
          );

          if (isQuotaError) {
            // Set exponential backoff for quota errors
            const backoffMs = this.setProviderCooldown(providerName, providerAttempts);
            
            console.log(`[LLMManager] 📊 Quota exceeded for ${providerName}, set cooldown of ${Math.round(backoffMs/1000)}s`);
            
            // Notify frontend about quota exceeded
            this.notifyBackoffStatus({
              isRetrying: true,
              provider: providerName,
              waitTimeMs: backoffMs,
              totalWaitTime: retryState.totalWaitTime + backoffMs,
              attempt: globalAttempts + 1,
              maxAttempts,
              quotaExceeded: true,
              businessContext
            });
            
            break; // Switch to next provider
          }

          if (isRecoverableError) {
            const errorType = this.categorizeError(error);
            console.log(`[LLMManager] 🔄 ${errorType} for ${providerName}, retrying`);
            
            // Set shorter backoff for other recoverable errors
            const backoffMs = this.setProviderCooldown(providerName, Math.floor(providerAttempts / 2));
            
            if (businessContext) {
              console.log(`[LLMManager] ⚠️  Business context workflow error: ${errorType}`);
            }
          }
          
          globalAttempts++;
          providerAttempts++;
          
          // If this was the last attempt for this provider or non-recoverable error, break
          if (!isRecoverableError || providerAttempts >= maxProviderAttempts) {
            break;
          }
        }
      }
      
      // Try to switch to next available provider
      const nextProvider = this.getNextAvailableProvider();
      if (nextProvider && nextProvider !== this.currentProvider) {
        console.log(`[LLMManager] 🔄 Switching to provider: ${nextProvider.name}`);
        this.currentProvider = nextProvider;
        providerAttempts = 0; // Reset provider attempts
      } else {
        // No more providers available or all in cooldown
        if (globalAttempts < maxAttempts) {
          const shortestCooldown = Math.min(...Array.from(this.providerCooldowns.values())) - Date.now();
          if (shortestCooldown > 0) {
            console.log(`[LLMManager] ⏰ All providers in cooldown, waiting ${Math.round(shortestCooldown/1000)}s`);
            
            retryState.isRetrying = true;
            retryState.currentBackoff = shortestCooldown;
            retryState.totalWaitTime += shortestCooldown;
            
            this.notifyBackoffStatus({
              isRetrying: true,
              provider: 'all providers',
              waitTimeMs: shortestCooldown,
              totalWaitTime: retryState.totalWaitTime,
              attempt: globalAttempts + 1,
              maxAttempts,
              allProvidersInCooldown: true,
              businessContext
            });
            
            await this.sleep(shortestCooldown);
            globalAttempts++;
            continue;
          }
        }
        break;
      }
      
      globalAttempts++;
    }

    // All attempts exhausted
    const errorSummary = failedProviders.map(p => `${p.name}: ${p.error} (attempt ${p.attempt})`).join('; ');
    const contextMessage = businessContext ? ` (Business context for ${businessContext.company})` : '';
    const totalTime = Date.now() - startTime;
    
    console.error(`[LLMManager] 💥 All providers failed after ${totalTime}ms and ${globalAttempts} attempts`);
    
    throw new Error(`All providers exhausted after ${globalAttempts} attempts${contextMessage}. Total time: ${Math.round(totalTime/1000)}s. Errors: ${errorSummary}`);
  }

  /**
   * Sleep utility for backoff
   * @param {number} ms - Milliseconds to sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Notify frontend about backoff status (to be implemented via WebSocket or polling)
   * @param {Object} status - Backoff status information
   */
  notifyBackoffStatus(status) {
    // This will be used by the frontend to show wait indicators
    // For now, just log the status - can be extended to use WebSocket/SSE later
    console.log(`[LLMManager] 📡 Backoff status:`, {
      provider: status.provider,
      waitTime: `${Math.round(status.waitTimeMs/1000)}s`,
      totalWait: `${Math.round(status.totalWaitTime/1000)}s`,
      attempt: `${status.attempt}/${status.maxAttempts}`,
      quotaExceeded: status.quotaExceeded || false,
      allInCooldown: status.allProvidersInCooldown || false
    });
    
    // Store status for potential frontend polling
    this.lastBackoffStatus = {
      ...status,
      timestamp: Date.now()
    };
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

  /**
   * Get current backoff status for frontend
   * @returns {Object|null} Current backoff status or null if not backing off
   */
  getBackoffStatus() {
    if (!this.lastBackoffStatus) return null;
    
    // Check if status is still relevant (not older than 2 minutes)
    const statusAge = Date.now() - this.lastBackoffStatus.timestamp;
    if (statusAge > 120000) {
      this.lastBackoffStatus = null;
      return null;
    }
    
    return {
      isRetrying: this.lastBackoffStatus.isRetrying,
      provider: this.lastBackoffStatus.provider,
      remainingWaitMs: Math.max(0, this.lastBackoffStatus.waitTimeMs - statusAge),
      totalWaitTime: this.lastBackoffStatus.totalWaitTime,
      attempt: this.lastBackoffStatus.attempt,
      maxAttempts: this.lastBackoffStatus.maxAttempts,
      quotaExceeded: this.lastBackoffStatus.quotaExceeded || false,
      allProvidersInCooldown: this.lastBackoffStatus.allProvidersInCooldown || false,
      businessContext: this.lastBackoffStatus.businessContext
    };
  }

  /**
   * Clear backoff status (when request completes)
   */
  clearBackoffStatus() {
    this.lastBackoffStatus = null;
  }

  /**
   * Check if an error indicates access denied (403) or authentication issues
   * @param {Error} error - The error to check
   * @returns {boolean} True if access denied
   */
  isAccessDeniedError(error) {
    if (!error) return false;
    
    const message = error.message?.toLowerCase() || '';
    const status = error.status || error.statusCode;
    
    // Access denied indicators
    return (
      status === 403 || // Forbidden
      status === 401 || // Unauthorized
      message.includes('access denied') ||
      message.includes('forbidden') ||
      message.includes('unauthorized') ||
      message.includes('invalid api key') ||
      message.includes('authentication failed')
    );
  }

  /**
   * Check if an error indicates a timeout
   * @param {Error} error - The error to check
   * @returns {boolean} True if timeout error
   */
  isTimeoutError(error) {
    if (!error) return false;
    
    const message = error.message?.toLowerCase() || '';
    return (
      message.includes('timeout') ||
      message.includes('request timeout') ||
      message.includes('connection timeout') ||
      error.code === 'TIMEOUT' ||
      error.code === 'ETIMEDOUT'
    );
  }

  /**
   * Check if an error indicates rate limiting
   * @param {Error} error - The error to check
   * @returns {boolean} True if rate limit error
   */
  isRateLimitError(error) {
    if (!error) return false;
    
    const message = error.message?.toLowerCase() || '';
    const status = error.status || error.statusCode;
    
    return (
      status === 429 || // Too Many Requests
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('quota exceeded') ||
      message.includes('rate exceeded')
    );
  }

  /**
   * Check if an error is temporary and might be recoverable
   * @param {Error} error - The error to check
   * @returns {boolean} True if temporary error
   */
  isTemporaryError(error) {
    if (!error) return false;
    
    const message = error.message?.toLowerCase() || '';
    const status = error.status || error.statusCode;
    
    return (
      status >= 500 && status < 600 || // Server errors
      status === 502 || // Bad Gateway
      status === 503 || // Service Unavailable
      status === 504 || // Gateway Timeout
      message.includes('internal server error') ||
      message.includes('service unavailable') ||
      message.includes('temporary') ||
      message.includes('try again') ||
      message.includes('network error') ||
      message.includes('connection error')
    );
  }

  /**
   * Categorize error type for better logging
   * @param {Error} error - The error to categorize
   * @returns {string} Error category
   */
  categorizeError(error) {
    if (this.currentProvider.isQuotaExceeded(error)) return 'Quota exceeded';
    if (this.isAccessDeniedError(error)) return 'Access denied';
    if (this.isRateLimitError(error)) return 'Rate limit exceeded';
    if (this.isTimeoutError(error)) return 'Request timeout';
    if (this.isTemporaryError(error)) return 'Temporary server error';
    return 'Unknown error';
  }
}

// Create and export singleton instance
const llmManager = new LLMManager();
module.exports = llmManager;