# codegen-ai

AI code generation, analysis, and debugging platform.

## Features

- Generate implementation ideas from plain-language prompts
- Analyze project structure and runtime issues
- Highlight refactoring opportunities
- Summarize code health and technical direction
- Connect to OpenAI for real AI-powered responses

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables:

```bash
cp .env.example .env
```

3. Add your OpenAI API key in `.env` if you want live AI responses.

4. Start the app:

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

## API endpoints

- `GET /api/health`
- `GET /api/summary`
- `GET /api/features`
- `POST /api/generate`
- `POST /api/chat`

## Project status

This repository now includes a working starter platform with a backend service, a browser UI, and an OpenAI-ready chat interface. If no API key is configured, the app automatically falls back to a demo response so the project remains usable right away.
