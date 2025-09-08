/**
 * Centralized API client with environment-aware configuration
 * Supports multiple instances (dev/test) and automatic fallback
 */

// Configuration
const getApiConfig = () => {
  // Option 1: Use explicit API URL if provided
  if (process.env.REACT_APP_API_URL) {
    console.log(`[API] Using explicit API URL: ${process.env.REACT_APP_API_URL}`);
    return {
      baseUrl: process.env.REACT_APP_API_URL,
      mode: 'direct' as const
    };
  }
  
  // Option 2: Use backend port for direct calls
  if (process.env.REACT_APP_BACKEND_PORT) {
    const directUrl = `http://localhost:${process.env.REACT_APP_BACKEND_PORT}`;
    console.log(`[API] Using backend port: ${directUrl}`);
    return {
      baseUrl: directUrl,
      mode: 'direct' as const
    };
  }
  
  // Option 3: Try proxy mode first (no base URL, rely on proxy)
  console.log('[API] Using proxy mode (no base URL)');
  return {
    baseUrl: '',
    mode: 'proxy' as const
  };
};

const config = getApiConfig();

/**
 * Enhanced fetch with automatic retry and fallback
 */
async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const url = config.baseUrl + endpoint;
  
  console.log(`[API] ${options.method || 'GET'} ${url} (${config.mode} mode)`);
  
  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });
    
    console.log(`[API] Response: ${response.status} ${response.statusText}`);
    
    // If proxy mode fails with 404, try direct mode as fallback
    if (!response.ok && config.mode === 'proxy' && response.status === 404) {
      console.log('[API] Proxy failed, trying direct mode fallback...');
      
      const backendPort = process.env.REACT_APP_BACKEND_PORT || '5002';
      const fallbackUrl = `http://localhost:${backendPort}${endpoint}`;
      
      console.log(`[API] Fallback ${options.method || 'GET'} ${fallbackUrl}`);
      
      const fallbackResponse = await fetch(fallbackUrl, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });
      
      console.log(`[API] Fallback response: ${fallbackResponse.status} ${fallbackResponse.statusText}`);
      return fallbackResponse;
    }
    
    return response;
  } catch (error) {
    console.error(`[API] Network error for ${url}:`, error);
    
    // If proxy mode fails with network error, try direct mode
    if (config.mode === 'proxy') {
      console.log('[API] Network error in proxy mode, trying direct fallback...');
      
      const backendPort = process.env.REACT_APP_BACKEND_PORT || '5002';
      const fallbackUrl = `http://localhost:${backendPort}${endpoint}`;
      
      try {
        console.log(`[API] Fallback ${options.method || 'GET'} ${fallbackUrl}`);
        const fallbackResponse = await fetch(fallbackUrl, {
          headers: {
            'Content-Type': 'application/json',
            ...options.headers,
          },
          ...options,
        });
        
        console.log(`[API] Fallback response: ${fallbackResponse.status} ${fallbackResponse.statusText}`);
        return fallbackResponse;
      } catch (fallbackError) {
        console.error(`[API] Fallback also failed:`, fallbackError);
        throw fallbackError;
      }
    }
    
    throw error;
  }
}

/**
 * Convenience methods for common API operations
 */
export const api = {
  get: async (endpoint: string) => {
    return apiFetch(endpoint, { method: 'GET' });
  },
  
  post: async (endpoint: string, data?: any) => {
    return apiFetch(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  },
  
  put: async (endpoint: string, data?: any) => {
    return apiFetch(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  },
  
  delete: async (endpoint: string) => {
    return apiFetch(endpoint, { method: 'DELETE' });
  },
};

/**
 * Typed API methods for common endpoints
 */
export const nodeApi = {
  getConnections: async (nodeId: string) => {
    const response = await api.get(`/api/admin/node/${nodeId}/connections`);
    if (!response.ok) {
      throw new Error(`Failed to fetch node connections: ${response.statusText}`);
    }
    return response.json();
  },
  
  getGraph: async (nodeId: string, version: string = 'draft') => {
    const response = await api.get(`/api/admin/node/${nodeId}/graph?version=${version}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch node graph: ${response.statusText}`);
    }
    return response.json();
  },
};

export const chatApi = {
  query: async (query: string, context?: any, conversationHistory?: any[]) => {
    const response = await api.post('/api/chat/query', {
      query,
      context,
      conversationHistory,
    });
    if (!response.ok) {
      throw new Error(`Chat query failed: ${response.statusText}`);
    }
    return response.json();
  },
  
  executeMutation: async (mutationPlan: any) => {
    const response = await api.post('/api/chat/execute-mutation', { mutationPlan });
    if (!response.ok) {
      throw new Error(`Mutation execution failed: ${response.statusText}`);
    }
    return response.json();
  },

  getBackoffStatus: async () => {
    const response = await api.get('/api/llm/backoff-status');
    if (!response.ok) {
      throw new Error(`Backoff status failed: ${response.statusText}`);
    }
    return response.json();
  },
};

export const importApi = {
  importCypher: async (cypherScript: string, versionName: string) => {
    const url = config.baseUrl + `/api/admin/import?versionName=${encodeURIComponent(versionName)}`;
    
    console.log(`[API] POST ${url} (importing Cypher script)`);
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: cypherScript, // Send raw text, not JSON
      });
      
      console.log(`[API] Import response: ${response.status} ${response.statusText}`);
      
      // If proxy mode fails, try direct mode as fallback
      if (!response.ok && config.mode === 'proxy' && response.status === 404) {
        console.log('[API] Proxy failed for import, trying direct mode fallback...');
        
        const backendPort = process.env.REACT_APP_BACKEND_PORT || '5002';
        const fallbackUrl = `http://localhost:${backendPort}/api/admin/import?versionName=${encodeURIComponent(versionName)}`;
        
        console.log(`[API] Fallback POST ${fallbackUrl}`);
        
        const fallbackResponse = await fetch(fallbackUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain',
          },
          body: cypherScript,
        });
        
        console.log(`[API] Fallback import response: ${fallbackResponse.status} ${fallbackResponse.statusText}`);
        return fallbackResponse;
      }
      
      return response;
    } catch (error) {
      console.error(`[API] Network error for import:`, error);
      
      // Try direct mode fallback on network error
      if (config.mode === 'proxy') {
        console.log('[API] Network error in proxy mode, trying direct fallback for import...');
        
        const backendPort = process.env.REACT_APP_BACKEND_PORT || '5002';
        const fallbackUrl = `http://localhost:${backendPort}/api/admin/import?versionName=${encodeURIComponent(versionName)}`;
        
        try {
          console.log(`[API] Fallback POST ${fallbackUrl}`);
          const fallbackResponse = await fetch(fallbackUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'text/plain',
            },
            body: cypherScript,
          });
          
          console.log(`[API] Fallback import response: ${fallbackResponse.status} ${fallbackResponse.statusText}`);
          return fallbackResponse;
        } catch (fallbackError) {
          console.error(`[API] Fallback import also failed:`, fallbackError);
          throw fallbackError;
        }
      }
      
      throw error;
    }
  },
};

// Log configuration on module load
console.log(`[API] Initialized with config:`, {
  mode: config.mode,
  baseUrl: config.baseUrl || '(proxy)',
  backendPort: process.env.REACT_APP_BACKEND_PORT || '5002',
  apiUrl: process.env.REACT_APP_API_URL || 'not set',
});

export default api;