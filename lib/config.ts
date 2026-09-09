function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. Copy .env.local.example to .env.local and fill it in.`
    );
  }
  return value;
}

export const config = {
  // Optional: unauthenticated GitHub API access still works for public repos,
  // just rate-limited to 60 req/hr. Required in practice for private repos.
  githubToken: () => process.env.GITHUB_TOKEN || undefined,
  githubOwner: () => required("GITHUB_OWNER"),
  githubRepo: () => required("GITHUB_REPO"),
  ollamaHost: process.env.OLLAMA_HOST || "http://localhost:11434",
  // qwen3-coder:30b (30b-a3b MoE, 19GB, 256K native context, ~70% code pretraining)
  // was picked empirically for this dev machine: already fast to pull, fits
  // comfortably in RAM, and only ~3B params are active per token so it stays
  // fast even at large context sizes. Swap via env if you want to compare.
  ollamaModel: process.env.OLLAMA_MODEL || "qwen3-coder:30b",
};
