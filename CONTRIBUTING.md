# Contributing to ghostAutoPublish

Thanks for your interest in contributing! This project is intended for public use, so contributions that improve reliability, usability, or docs are very welcome.

## Getting Started

- Node.js 20+ installed locally.
- A Ghost Admin API key and Gemini API key if you want to exercise the full flow.

Clone the repo and install dependencies:

```bash
git clone https://github.com/equityCode/ghostAutoPost-Public.git
cd ghostAutoPost-Public
npm install
```

Create a local `.env` file (this file is **ignored by git**) using the variables described in `README.md`. Use only test or dummy values when sharing examples publicly.

## Running Locally

- Main publishing flow: `npm start`
- Gemini test harness: `npm run test:gemini`

Please make sure the basic flow you are touching still works before opening a pull request.

## Code Style and Scope

- Use modern JavaScript (ES modules, async/await).
- Keep functions small and focused; prefer adding new helpers in `src/` over growing a single large file.
- In PRs, keep changes focused on one logical improvement or bugfix.

## Security and Privacy

- **Never commit real API keys, secrets, or production URLs.**
- Do not commit `.env`, `logs/`, `data/`, or other local artifacts that may contain sensitive information—they are intentionally ignored via `.gitignore`.
- If a change requires new configuration, document it in `README.md` and reference it from this file rather than hard-coding secrets.

## How to Contribute

1. Fork the repository on GitHub.
2. Create a feature branch from `main`.
3. Make your changes with clear commit messages.
4. Add or update documentation when behavior changes.
5. Open a pull request with:
   - A concise description of the change.
   - Any manual testing steps you performed.
   - Notes about backwards compatibility or migration if needed.

## Reporting Issues and Feature Requests

Use GitHub Issues for bugs, questions, and feature ideas:

- For bugs, include steps to reproduce, expected vs actual behavior, and relevant logs (with any sensitive info removed).
- For feature requests, describe the problem you’re trying to solve and how you imagine the tool should behave.

Be respectful and constructive—this project aims to be a friendly place for collaboration.

