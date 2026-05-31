import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function getBuildVersion() {
  try {
    return execSync("git rev-parse --short=12 HEAD", { encoding: "utf8" }).trim();
  } catch {
    return `local-${Date.now()}`;
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backendTarget = env.VITE_DEV_BACKEND_URL || "http://127.0.0.1:5000";
  const base = env.VITE_BASE_PATH || "/";
  const buildVersion = getBuildVersion();

  return {
    base,
    define: {
      __QUELESS_BUILD_VERSION__: JSON.stringify(buildVersion),
      __QUELESS_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
    plugins: [
      react(),
      {
        name: "queless-version-file",
        closeBundle() {
          const outDir = path.resolve(process.cwd(), "dist");
          fs.mkdirSync(outDir, { recursive: true });
          fs.writeFileSync(
            path.join(outDir, "version.json"),
            JSON.stringify(
              {
                version: buildVersion,
                builtAt: new Date().toISOString(),
                base,
                mode,
              },
              null,
              2
            )
          );
        },
      },
    ],
    build: {
      sourcemap: false,
      emptyOutDir: true,
    },
    server: {
      proxy: {
        "/api": {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
        },
        "/socket.io": {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
          ws: true,
        },
      },
    },
  };
});
