const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

const features = [
  {
    title: 'Code Generation',
    description: 'Turn natural language prompts into clean code structures, components, and modules.'
  },
  {
    title: 'Bug Analysis',
    description: 'Investigate stack traces and runtime issues to find root causes faster.'
  },
  {
    title: 'Refactoring',
    description: 'Improve readability, maintainability, and performance across large codebases.'
  },
  {
    title: 'Project Insights',
    description: 'Summarize architecture, dependencies, and code quality trends across repositories.'
  }
];

function serveFile(filePath, res) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }

      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Server error');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': type });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      status: 'ok',
      app: 'codegen-ai',
      timestamp: new Date().toISOString()
    }, null, 2));
    return;
  }

  if (url.pathname === '/api/features') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ features }, null, 2));
    return;
  }

  if (url.pathname === '/api/summary') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      name: 'codegen-ai',
      tagline: 'AI code generation, analysis, and debugging platform',
      capabilities: ['Generation', 'Analysis', 'Debugging', 'Refactoring'],
      status: 'ready'
    }, null, 2));
    return;
  }

  let filePath = url.pathname === '/' ? path.join(PUBLIC_DIR, 'index.html') : path.join(PUBLIC_DIR, url.pathname);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }

    serveFile(filePath, res);
  });
});

server.listen(PORT, () => {
  console.log(`codegen-ai server is running at http://localhost:${PORT}`);
});
