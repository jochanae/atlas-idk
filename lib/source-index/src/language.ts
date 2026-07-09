const EXT_TO_LANG: Record<string, string> = {
  ts: "ts",
  tsx: "tsx",
  js: "js",
  jsx: "jsx",
  mjs: "js",
  cjs: "js",
  py: "py",
  rb: "rb",
  go: "go",
  rs: "rs",
  java: "java",
  kt: "kt",
  swift: "swift",
  c: "c",
  cpp: "cpp",
  h: "c",
  hpp: "cpp",
  cs: "cs",
  php: "php",
  sh: "sh",
  bash: "sh",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  sass: "scss",
  less: "less",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  xml: "xml",
  md: "md",
  mdx: "mdx",
  txt: "txt",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  prisma: "prisma",
  vue: "vue",
  svelte: "svelte",
  env: "env",
};

export function detectLanguage(path: string): string | null {
  const base = path.split("/").pop() ?? path;
  if (base === "Dockerfile" || base.startsWith("Dockerfile.")) return "dockerfile";
  if (base === "Makefile") return "makefile";
  if (base === ".gitignore" || base === ".dockerignore") return "ignore";
  const ext = base.includes(".") ? base.split(".").pop()?.toLowerCase() ?? "" : "";
  return EXT_TO_LANG[ext] ?? null;
}

export const TEXT_EXTENSIONS = new Set(Object.keys(EXT_TO_LANG));

export function isTextPath(path: string): boolean {
  const base = path.split("/").pop() ?? path;
  if (base === "Dockerfile" || base.startsWith("Dockerfile.") || base === "Makefile") return true;
  if (base === ".gitignore" || base === ".dockerignore" || base === ".env") return true;
  const ext = base.includes(".") ? base.split(".").pop()?.toLowerCase() ?? "" : "";
  return TEXT_EXTENSIONS.has(ext);
}
