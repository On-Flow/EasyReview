# Contributing to EasyReview

Thanks for your interest in contributing. This is a small POC project, so the
process is intentionally lightweight.

## Before you start

For anything beyond a small fix (typos, obvious bugs), please open an issue
first to discuss the change. This avoids wasted effort on pull requests that
don't fit the project's direction — see the README for the current scope and
known limitations (this is a read-only, single-repo POC by design).

## Development setup

```bash
cp .env.local.example .env.local
# edit .env.local: set GITHUB_OWNER / GITHUB_REPO to the repo you want to review
npm install
npm run dev
```

You'll need [Ollama](https://ollama.com) running locally with a model pulled
(see the README for details).

## Making changes

1. Fork the repo and create a branch off `main`.
2. Make your change, keeping it focused — small, single-purpose PRs are much
   easier to review than large ones.
3. Run the linter before submitting:
   ```bash
   npm run lint
   ```
4. There is currently no automated test suite. Manually verify your change
   against a real PR (the README documents how the tool was verified) and
   describe how you tested it in the PR description.
5. Open a pull request against `main` with a clear description of what
   changed and why.

## Code style

- TypeScript, following the existing patterns in the codebase (see `lib/` and
  `app/` for conventions).
- Run `npm run lint` and fix any issues before submitting.
- Keep comments to the "why," not the "what" — the code should be clear enough
  to explain itself otherwise.

## Reporting bugs

Open an issue with:

- What you expected to happen vs. what actually happened
- Steps to reproduce
- Relevant environment details (Node version, OS, which Ollama model)

## Security issues

Please don't open a public issue for security vulnerabilities — see
[SECURITY.md](SECURITY.md) instead.

## Code of Conduct

This project follows a [Code of Conduct](CODE_OF_CONDUCT.md). By
participating, you're expected to uphold it.
