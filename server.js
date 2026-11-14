const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
require('dotenv').config();
const Database = require('better-sqlite3');
const { OpenAI } = require('openai');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const COOKIE_NAME = 'codegen_session';
const secureCookie = process.env.SESSION_COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production';
const scrypt = promisify(crypto.scrypt);
const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;
const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'codegen-ai.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS projects_user_id_idx ON projects(user_id);
`);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8'
};
const features = [
  { title: 'Code Generation', description: 'Turn natural-language prompts into code structures, components, and modules.' },
  { title: 'Bug Analysis', description: 'Investigate stack traces and runtime issues to find root causes faster.' },
  { title: 'Refactoring', description: 'Improve readability, maintainability, and performance across your codebase.' },
  { title: 'Project Workspace', description: 'Keep project descriptions and AI work organized in your private dashboard.' }
];

function sendJson(res, status, data, extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders });
  res.end(JSON.stringify(data));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (Buffer.byteLength(body) > 1024 * 1024) {
        reject(Object.assign(new Error('Request body is too large.'), { status: 413 }));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        const parsed = JSON.parse(body);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
        resolve(parsed);
      } catch {
        reject(Object.assign(new Error('Request body must be valid JSON.'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}
function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(part => part.trim()).filter(Boolean).map(part => {
    const index = part.indexOf('=');
    return index < 0 ? [part, ''] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
  }));
}
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
function sessionCookie(token, maxAge = SESSION_TTL_SECONDS) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secureCookie ? '; Secure' : ''}`;
}
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, 64);
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}
async function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
function currentUser(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (!token) return null;
  const session = db.prepare(`SELECT users.id, users.email FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?`).get(hashToken(token), Date.now());
  return session || null;
}
function requireUser(req, res) {
  const user = currentUser(req);
  if (!user) sendJson(res, 401, { error: 'Please sign in to continue.' });
  return user;
}
function validateMode(mode) {
  return ['general', 'debug', 'component', 'api'].includes(mode) ? mode : 'general';
}
function modeInstruction(mode) {
  return ({
    debug: 'Act as an expert debugging assistant. Explain likely causes and safe, verifiable diagnostic steps.',
    component: 'Act as a senior frontend engineer. Give an accessible, maintainable component implementation and explain its props.',
    api: 'Act as a backend engineer. Cover API contracts, validation, errors, and a practical implementation.',
    general: 'Act as a senior software engineer. Provide a practical solution, code where useful, and verification steps.'
  })[mode];
}
async function getAIResponse(prompt, mode) {
  if (!openaiClient) {
    return `Demo mode (configure OPENAI_API_KEY for live responses)\n\nTask: ${prompt}\n\nSuggested approach:\n1. Define expected behavior and edge cases.\n2. Identify affected files and dependencies.\n3. Implement a focused change.\n4. Add tests and verify the result.`;
  }
  const completion = await openaiClient.chat.completions.create({
    model,
    messages: [{ role: 'system', content: modeInstruction(mode) }, { role: 'user', content: prompt }],
    temperature: 0.7
  });
  return completion.choices[0]?.message?.content?.trim() || 'The model returned an empty response.';
}
function safeProject(row) {
  return { id: row.id, name: row.name, description: row.description, createdAt: row.created_at, updatedAt: row.updated_at };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;

    if (pathname === '/api/health' && req.method === 'GET') {
      return sendJson(res, 200, { status: 'ok', app: 'codegen-ai', aiProvider: openaiClient ? 'OpenAI' : 'Demo mode' });
    }
    if (pathname === '/api/features' && req.method === 'GET') return sendJson(res, 200, { features });
    if (pathname === '/api/summary' && req.method === 'GET') {
      return sendJson(res, 200, { name: 'codegen-ai', tagline: 'AI code generation, analysis, and debugging platform', status: 'ready', aiProvider: openaiClient ? 'OpenAI' : 'Demo mode' });
    }

    if (pathname === '/api/auth/register' && req.method === 'POST') {
      const body = await readBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return sendJson(res, 400, { error: 'Enter a valid email address.' });
      if (password.length < 10 || Buffer.byteLength(password) > 1024) return sendJson(res, 400, { error: 'Password must be at least 10 characters.' });
      const user = { id: crypto.randomUUID(), email, passwordHash: await hashPassword(password), createdAt: Date.now() };
      try {
        db.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)').run(user.id, user.email, user.passwordHash, user.createdAt);
      } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return sendJson(res, 409, { error: 'An account with this email already exists.' });
        throw error;
      }
      const token = crypto.randomBytes(32).toString('base64url');
      db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(hashToken(token), user.id, Date.now() + SESSION_TTL_SECONDS * 1000);
      return sendJson(res, 201, { user: { id: user.id, email: user.email } }, { 'Set-Cookie': sessionCookie(token) });
    }

    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const body = await readBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const user = db.prepare('SELECT id, email, password_hash FROM users WHERE email = ?').get(email);
      if (!user || !(await verifyPassword(password, user.password_hash))) return sendJson(res, 401, { error: 'Email or password is incorrect.' });
      const token = crypto.randomBytes(32).toString('base64url');
      db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(hashToken(token), user.id, Date.now() + SESSION_TTL_SECONDS * 1000);
      return sendJson(res, 200, { user: { id: user.id, email: user.email } }, { 'Set-Cookie': sessionCookie(token) });
    }

    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
      if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
      return sendJson(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
    }
    if (pathname === '/api/auth/me' && req.method === 'GET') {
      const user = currentUser(req);
      return sendJson(res, 200, { user: user ? { id: user.id, email: user.email } : null });
    }

    if (pathname.startsWith('/api/projects')) {
      const user = requireUser(req, res);
      if (!user) return;
      if (pathname === '/api/projects' && req.method === 'GET') {
        const rows = db.prepare('SELECT id, name, description, created_at, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC').all(user.id);
        return sendJson(res, 200, { projects: rows.map(safeProject) });
      }
      if (pathname === '/api/projects' && req.method === 'POST') {
        const body = await readBody(req);
        const name = String(body.name || '').trim();
        const description = String(body.description || '').trim();
        if (!name || name.length > 120) return sendJson(res, 400, { error: 'Project name is required and must be 120 characters or fewer.' });
        if (description.length > 4000) return sendJson(res, 400, { error: 'Description must be 4,000 characters or fewer.' });
        const now = Date.now();
        const row = { id: crypto.randomUUID(), name, description, created_at: now, updated_at: now };
        db.prepare('INSERT INTO projects (id, user_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(row.id, user.id, name, description, now, now);
        return sendJson(res, 201, { project: safeProject(row) });
      }
      const match = pathname.match(/^\/api\/projects\/([0-9a-f-]{36})$/i);
      if (match) {
        const existing = db.prepare('SELECT id, name, description, created_at, updated_at FROM projects WHERE id = ? AND user_id = ?').get(match[1], user.id);
        if (!existing) return sendJson(res, 404, { error: 'Project not found.' });
        if (req.method === 'PUT') {
          const body = await readBody(req);
          const name = String(body.name ?? existing.name).trim();
          const description = String(body.description ?? existing.description).trim();
          if (!name || name.length > 120 || description.length > 4000) return sendJson(res, 400, { error: 'Project name or description is invalid.' });
          const now = Date.now();
          db.prepare('UPDATE projects SET name = ?, description = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(name, description, now, match[1], user.id);
          return sendJson(res, 200, { project: safeProject({ ...existing, name, description, updated_at: now }) });
        }
        if (req.method === 'DELETE') {
          db.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').run(match[1], user.id);
          return sendJson(res, 200, { ok: true });
        }
      }
      return sendJson(res, 404, { error: 'Project route not found.' });
    }

    if (pathname === '/api/chat' && req.method === 'POST') {
      const user = requireUser(req, res);
      if (!user) return;
      const body = await readBody(req);
      const prompt = String(body.prompt || '').trim();
      const mode = validateMode(String(body.mode || 'general'));
      if (!prompt) return sendJson(res, 400, { error: 'Prompt is required.' });
      if (prompt.length > 30000) return sendJson(res, 413, { error: 'Prompt is too long (maximum 30,000 characters).' });
      const response = await getAIResponse(prompt, mode);
      return sendJson(res, 200, { result: { mode, response } });
    }

    if (pathname === '/api/generate' && req.method === 'POST') {
      const user = requireUser(req, res);
      if (!user) return;
      const body = await readBody(req);
      const prompt = String(body.prompt || '').trim();
      if (!prompt) return sendJson(res, 400, { error: 'Prompt is required.' });
      const mode = validateMode(String(body.mode || 'general'));
      const response = await getAIResponse(prompt, mode);
      return sendJson(res, 200, { prompt, mode, result: { summary: 'AI response generated.', suggestions: [], checklist: [], snippet: response } });
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD' });
    let filePath = path.resolve(PUBLIC_DIR, `.${decodeURIComponent(pathname === '/' ? '/index.html' : pathname)}`);
    const relative = path.relative(PUBLIC_DIR, filePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return sendJson(res, 403, { error: 'Forbidden.' });
    try {
      if (!(await fs.promises.stat(filePath)).isFile()) filePath = path.join(PUBLIC_DIR, 'index.html');
    } catch {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }
    const content = await fs.promises.readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (error) {
    const status = error.status || (error.message.includes('API key') ? 503 : 500);
    if (!res.headersSent) sendJson(res, status, { error: status >= 500 ? 'Request failed. Please try again.' : error.message });
    else res.destroy();
    if (status >= 500) console.error(error);
  }
});

server.listen(PORT, () => console.log(`codegen-ai is running at http://localhost:${PORT}`));
