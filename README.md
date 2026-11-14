# codegen-ai

A private AI engineering workspace with accounts, project management, and optional OpenAI-powered assistance.

## Features

- Email/password registration and sign-in
- Passwords hashed with Node.js `scrypt`; session tokens are random, stored as hashes, and sent in HttpOnly cookies
- Private project CRUD backed by SQLite; users can only access their own projects
- General, debugging, component, and API assistant modes
- Demo responses when no OpenAI key is configured
- Responsive dashboard and browser UI

## Run locally

Requires a supported Node.js version for the dependencies. From the repository root:

```bash
npm install
cp .env.example .env
```

Set `OPENAI_API_KEY` in `.env` to enable live model responses; leave it blank to use demo mode. Then:

```bash
npm start
```

Open <http://localhost:3000>. SQLite data is stored in `data/codegen-ai.sqlite` by default. Set `DATA_DIR` to use another persistent directory. Keep `.env` and the database out of version control.

For production, set `NODE_ENV=production` (which enables Secure cookies behind HTTPS), use a persistent disk for `DATA_DIR`, and configure a real OpenAI API key through the hosting provider's secret manager. Back up the database and use HTTPS.

## API

- `GET /api/health`, `/api/summary`, `/api/features`
- `POST /api/auth/register` with `{ "email", "password" }`
- `POST /api/auth/login` with `{ "email", "password" }`
- `POST /api/auth/logout`; `GET /api/auth/me`
- Authenticated `GET`, `POST`, `PUT`, and `DELETE` under `/api/projects`
- Authenticated `POST /api/chat` and `/api/generate`

## About limits

The app does not impose an arbitrary project-count cap. “Unlimited” cannot be guaranteed: storage, hosting resources, model-provider quotas, and provider safety policies still apply. Keep API keys private and never commit them to the repository.
