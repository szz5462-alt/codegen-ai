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

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) {
        req.socket.destroy();
        reject(new Error('Payload too large'));
      }
    });

    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Invalid JSON payload'));
      }
    });

    req.on('error', reject);
  });
}

function generateCodeSnippet(prompt, mode) {
  const text = prompt.toLowerCase();

  if (mode === 'debug' || text.includes('debug') || text.includes('error') || text.includes('exception')) {
    return `// debug-analysis.js
function inspectFailure(error, context) {
  console.log('Error:', error.message);
  console.log('Context:', context);

  return {
    issue: error.message,
    suspectedArea: context.module || 'shared runtime layer',
    nextSteps: [
      'Reproduce the failure locally',
      'Check recent changes in the failing path',
      'Add a focused regression test',
      'Validate the fix with the smallest possible run'
    ]
  };
}`;
  }

  if (mode === 'component' || text.includes('react') || text.includes('component')) {
    return `export function FeatureCard({ title, description }) {
  return (
    <article className="feature-card">
      <h3>{title}</h3>
      <p>{description}</p>
    </article>
  );
}`;
  }

  if (mode === 'api' || text.includes('api') || text.includes('server') || text.includes('route')) {
    return `app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

app.post('/api/generate', (req, res) => {
  const { prompt } = req.body;
  res.json({
    accepted: true,
    summary: 'Request accepted and queued',
    prompt
  });
});`;
  }

  return `function buildPlan(task) {
  return {
    objective: task,
    steps: [
      'Define the expected behavior',
      'Identify the affected files',
      'Implement the smallest viable change',
      'Verify the result with tests or checks'
    ]
  };
}`;
}

function buildResponse(prompt, mode) {
  const text = prompt.trim();
  const lower = text.toLowerCase();

  if (!text) {
    return {
      summary: 'No prompt was provided.',
      suggestions: ['Describe the feature, bug, or refactor you want to generate.'],
      checklist: ['Clarify the goal', 'List affected files', 'Set acceptance criteria'],
      snippet: 'No snippet generated.'
    };
  }

  if (lower.includes('debug') || lower.includes('error') || lower.includes('exception')) {
    return {
      summary: 'Debugging plan generated for a runtime issue.',
      suggestions: [
        'Capture the exact stack trace and reproduction steps.',
        'Check the most recent changes around the failing module.',
        'Add a smallest-possible failing test before applying the fix.'
      ],
      checklist: ['Reproduce', 'Inspect logs', 'Patch', 'Validate'],
      snippet: generateCodeSnippet(prompt, 'debug')
    };
  }

  if (mode === 'component' || lower.includes('react') || lower.includes('ui') || lower.includes('component')) {
    return {
      summary: 'Component-oriented implementation plan generated.',
      suggestions: [
        'Keep the component focused on one responsibility.',
        'Use props for configurable behavior and data.',
        'Style consistently with the rest of the design system.'
      ],
      checklist: ['Props', 'State', 'Accessibility', 'Testing'],
      snippet: generateCodeSnippet(prompt, 'component')
    };
  }

  if (mode === 'api' || lower.includes('api') || lower.includes('server') || lower.includes('route')) {
    return {
      summary: 'API route plan generated for backend work.',
      suggestions: [
        'Define the request and response contract explicitly.',
        'Validate inputs before processing.',
        'Return helpful error messages and status codes.'
      ],
      checklist: ['Validation', 'Auth', 'Error handling', 'Testing'],
      snippet: generateCodeSnippet(prompt, 'api')
    };
  }

  return {
    summary: 'Feature generation plan produced for a general software task.',
    suggestions: [
      'Start by defining the user-facing goal.',
      'List the inputs, outputs, and edge cases.',
      'Split work into small implementation steps with validation checks.'
    ],
    checklist: ['Goal', 'Scope', 'Acceptance', 'Verification'],
    snippet: generateCodeSnippet(prompt, mode)
  };
}

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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      status: 'ok',
      app: 'codegen-ai',
      timestamp: new Date().toISOString(),
      mode: 'starter-platform'
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

  if (url.pathname === '/api/generate' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const prompt = body.prompt || '';
      const mode = body.mode || 'general';
      const output = buildResponse(prompt, mode);

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        prompt,
        mode,
        result: output
      }, null, 2));
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: error.message }, null, 2));
    }
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

module.exports = server;
