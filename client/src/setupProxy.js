const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // Read backend port from environment variables with fallback
  const backendPort = process.env.REACT_APP_BACKEND_PORT || '5002';
  const target = `http://localhost:${backendPort}`;
  
  console.log(`🔗 [PROXY] Setting up proxy to backend: ${target}`);
  console.log(`🔗 [PROXY] Environment: REACT_APP_BACKEND_PORT=${process.env.REACT_APP_BACKEND_PORT}`);
  
  const proxyMiddleware = createProxyMiddleware({
    target: target,
    changeOrigin: true,
    secure: false,
    logLevel: 'info',
    onError: (err, req, res) => {
      console.error(`❌ [PROXY] Error for ${req.url}:`, err.message);
      console.log(`💡 [PROXY] Make sure backend is running on ${target}`);
      
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
      console.log(`→ [PROXY] ${req.method} ${req.url} → ${target}${req.url}`);
    },
    onProxyRes: (proxyRes, req, res) => {
      console.log(`← [PROXY] ${proxyRes.statusCode} ${req.method} ${req.url}`);
    }
  });
  
  app.use('/api', proxyMiddleware);
  
  console.log(`✅ [PROXY] Configured /api/* → ${target}/api/*`);
};