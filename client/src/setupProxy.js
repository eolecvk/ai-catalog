const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  const target = 'http://localhost:5002';
  
  console.log(`🔗 Setting up proxy to backend: ${target}`);
  
  app.use(
    '/api',
    createProxyMiddleware({
      target: target,
      changeOrigin: true,
      logLevel: 'debug',
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