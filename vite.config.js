import { defineConfig } from "vite";

function normalizeBasePath(basePath) {
  if (!basePath || basePath === "/") {
    return "/";
  }

  const withLeadingSlash = basePath.startsWith("/") ? basePath : `/${basePath}`;
  return withLeadingSlash.endsWith("/")
    ? withLeadingSlash
    : `${withLeadingSlash}/`;
}

function resolveBasePath() {
  if (process.env.VITE_BASE_PATH) {
    return normalizeBasePath(process.env.VITE_BASE_PATH);
  }

  if (process.env.GITHUB_ACTIONS === "true") {
    const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1];
    if (repoName && !repoName.toLowerCase().endsWith(".github.io")) {
      return `/${repoName}/`;
    }
  }

  return "/";
}

export default defineConfig({
  base: resolveBasePath(),
});
