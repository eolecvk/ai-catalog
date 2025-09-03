const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // Get backend port from environment variable or default
  const backendPort = process.env.REACT_APP_BACKEND_PORT || '5002';
  const target = `http://localhost:${backendPort}`;
  
  console.log(`🔗 Setting up proxy to backend: ${target}`);
  
  app.use(
    '/api',
    createProxyMiddleware({
      target: target,
      changeOrigin: true,
      onError: (err, req, res) => {
        console.error(`❌ Proxy error for ${req.url}:`, err.message);
        console.log(`💡 Make sure backend is running on ${target}`);
      },
      onProxyReq: (proxyReq, req, res) => {
        console.log(`→ Proxying ${req.method} ${req.url} to ${target}${req.url}`);
      }
    })
  );
};