// proxy.js — Run this with: node proxy.js
// This proxies Anthropic API calls to avoid CORS issues

const http = require('http');
const https = require('https');

const ANTHROPIC_API_KEY = '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'; // ← paste your key here
const PORT = 3001;

const server = http.createServer((req, res) => {
  // Allow CORS from your local server
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/ai') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key':"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",
          "anthropic-version": '2023-06-01'
        }
      };

      const proxyReq = https.request(options, (proxyRes) => {
        let data = '';
        proxyRes.on('data', chunk => data += chunk);
        proxyRes.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(data);
        });
      });

      proxyReq.on('error', (e) => {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      });

      proxyReq.write(body);
      proxyReq.end();
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`✅ Proxy running at http://localhost:${PORT}`);
  console.log(`   AI calls will go through this proxy`);
});