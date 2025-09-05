const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // Read backend port from environment variables with fallback
  const backendPort = process.env.REACT_APP_BACKEND_PORT || '5002';
  const target = `http://localhost:${backendPort}`;
  
  // Only show essential proxy setup info in clean mode
  const isCleanMode = process.env.REACT_APP_CLEAN_OUTPUT !== 'false';
  
  if (!isCleanMode) {
    console.log(`🔗 [PROXY] Setting up proxy to backend: ${target}`);
    console.log(`🔗 [PROXY] Environment: REACT_APP_BACKEND_PORT=${process.env.REACT_APP_BACKEND_PORT}`);
  }
  
  const proxyMiddleware = createProxyMiddleware({
    target: target,
    changeOrigin: true,
    secure: false,
    logLevel: 'silent', // Reduce proxy middleware verbosity
    onError: (err, req, res) => {
      console.error(`❌ [PROXY] Backend connection failed:`, err.message);
      
      // Send a proper error response instead of leaving hanging
      if (!res.headersSent) {
        res.status(503).json({
          error: 'Backend service unavailable',
          target: target,
          message: err.message
        });
      }
    }
    // Remove verbose onProxyReq and onProxyRes logging for cleaner output
  });
  
  app.use('/api', proxyMiddleware);
  
  if (!isCleanMode) {
    console.log(`✅ [PROXY] Configured /api/* → ${target}/api/*`);
  }
};