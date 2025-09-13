const axios = require('axios');

class TokenManager {
  constructor(clientId, clientSecret) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.token = null;
    this.tokenExpiry = null;
    this.tokenUrl = 'https://api.neo4j.io/oauth/token';
  }

  async getToken() {
    // Return cached token if still valid (with 10 second buffer)
    if (this.token && this.tokenExpiry && Date.now() < (this.tokenExpiry - 10000)) {
      return this.token;
    }

    try {
      // Request new token using client credentials
      const response = await axios({
        method: 'POST',
        url: this.tokenUrl,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        auth: {
          username: this.clientId,
          password: this.clientSecret
        },
        data: 'grant_type=client_credentials'
      });

      this.token = response.data.access_token;
      // Token expires in 3600 seconds (1 hour)
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);
      
      console.log('Neo4j OAuth token obtained successfully');
      return this.token;
    } catch (error) {
      console.error('Failed to obtain Neo4j OAuth token:', error.response?.data || error.message);
      throw new Error('Failed to authenticate with Neo4j Aura: ' + (error.response?.data?.error_description || error.message));
    }
  }

  async generateAuthToken() {
    const bearerToken = await this.getToken();
    return {
      token: bearerToken,
      expiration: Math.floor((this.tokenExpiry - Date.now()) / 1000) - 10 // Buffer of 10 seconds
    };
  }

  // Method to clear token (useful for testing or manual refresh)
  clearToken() {
    this.token = null;
    this.tokenExpiry = null;
  }
}

module.exports = TokenManager;