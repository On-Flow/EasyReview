# Security Policy

## Supported Versions

This is a proof-of-concept project without formal releases. Security fixes are
only made against the latest commit on `main`.

## Reporting a Vulnerability

Please do not report security vulnerabilities through public GitHub issues.

Instead, email **hello@on-flow.co.uk** with a description of the issue and
steps to reproduce it. We'll acknowledge receipt as soon as we can and follow
up once we've had a chance to investigate.

## Known, accepted risks

- `refractor@2.10.1` (used for diff syntax highlighting) pulls in an old
  `prismjs` version with published ReDoS/XSS advisories. This is a deliberate,
  documented tradeoff — see the README's "Model choice" section for the
  rationale. Tokenization runs client-side only and output always goes through
  React's normal JSX escaping (never `dangerouslySetInnerHTML`).
- This POC has no authentication and is intended for local/trusted use only.
  Do not deploy it to a public-facing environment without adding
  authentication and access controls first.
