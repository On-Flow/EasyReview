// Maps a file path to a refractor/Prism language id for syntax highlighting.
// Deliberately small and best-effort: an unmapped extension just renders
// without highlighting rather than guessing wrong.
const EXT_TO_LANGUAGE: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  mts: "typescript",
  cts: "typescript",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  json: "json",
  jsonc: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  css: "css",
  scss: "scss",
  sass: "sass",
  less: "less",
  html: "markup",
  htm: "markup",
  xml: "markup",
  svg: "markup",
  vue: "markup",
  md: "markdown",
  mdx: "markdown",
  sql: "sql",
  graphql: "graphql",
  proto: "protobuf",
  dockerfile: "docker",
  lua: "lua",
  r: "r",
  scala: "scala",
  ex: "elixir",
  exs: "elixir",
  erl: "erlang",
  hs: "haskell",
  clj: "clojure",
  dart: "dart",
  groovy: "groovy",
  ps1: "powershell",
  tf: "hcl",
  ini: "ini",
  makefile: "makefile",
};

export function languageForPath(path: string): string | null {
  const filename = (path.split("/").pop() ?? path).toLowerCase();
  if (filename === "dockerfile") return "docker";
  if (filename === "makefile") return "makefile";

  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex <= 0) return null;

  const ext = filename.slice(dotIndex + 1);
  return EXT_TO_LANGUAGE[ext] ?? null;
}
