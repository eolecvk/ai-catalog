const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // Read backend port from environment variables with fallback
  const backendPort = process.env.REACT_APP_BACKEND_PORT || '5002';
  const target = `http://localhost:${backendPort}`;
  
  // Always show proxy setup info for debugging
  console.log(`🔗 [PROXY] Setting up proxy to backend: ${target}`);
  console.log(`🔗 [PROXY] Environment: REACT_APP_BACKEND_PORT=${process.env.REACT_APP_BACKEND_PORT}`);
  console.log(`🔗 [PROXY] Current working directory: ${process.cwd()}`);
  console.log(`🔗 [PROXY] NODE_ENV: ${process.env.NODE_ENV}`);
  
  const proxyMiddleware = createProxyMiddleware({
    target: target,
    changeOrigin: true,
    secure: false,
    logLevel: 'debug', // Enable debug logging
    onError: (err, req, res) => {
      console.error(`❌ [PROXY] Backend connection failed:`, err.message);
      console.error(`❌ [PROXY] Request URL: ${req.url}`);
      console.error(`❌ [PROXY] Target: ${target}`);
      
      // Send a proper error response instead of leaving hanging
      if (!res.headersSent) {
        res.status(503).json({
          error: 'Backend service unavailable',
          target: target,
          message: err.message
        });
      }
    },
    onProxyReq: (proxyReq, req, res) => {
      console.log(`🔗 [PROXY] Forwarding ${req.method} ${req.url} → ${target}${req.url}`);
    }
  });
  
  app.use('/api', proxyMiddleware);
  
  console.log(`✅ [PROXY] Configured /api/* → ${target}/api/*`);
  console.log(`🔗 [PROXY] setupProxy.js loaded successfully`);
};