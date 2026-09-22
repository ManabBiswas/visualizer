import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    server: {
      deps: {
        inline: ["next-auth"],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
      "next/server": path.resolve(import.meta.dirname, "node_modules/next/server.js"),
      "next/headers": path.resolve(import.meta.dirname, "node_modules/next/headers.js"),
    },
  },
});