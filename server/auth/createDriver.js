const neo4j = require('neo4j-driver');
const TokenManager = require('./TokenManager');

/**
 * Creates a Neo4j driver instance with appropriate authentication
 * Uses OAuth bearer tokens if client credentials are available, 
 * otherwise falls back to basic authentication
 */
function createDriver() {
  if (process.env.NEO4J_CLIENT_ID && process.env.NEO4J_CLIENT_SECRET) {
    // Use OAuth authentication with client credentials
    const tokenManager = new TokenManager(process.env.NEO4J_CLIENT_ID, process.env.NEO4J_CLIENT_SECRET);
    
    return neo4j.driver(
      process.env.NEO4J_URI || 'bolt://localhost:7687',
      neo4j.authTokenManagers.bearer({
        tokenProvider: async () => await tokenManager.generateAuthToken()
      })
    );
  } else {
    // Fallback to basic authentication
    return neo4j.driver(
      process.env.NEO4J_URI || 'bolt://localhost:7687',
      neo4j.auth.basic(
        process.env.NEO4J_USERNAME || 'neo4j',
        process.env.NEO4J_PASSWORD || 'password123'
      )
    );
  }
}

module.exports = createDriver;