import { defineConfig } from "vitest/config";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { applyConfig as applyReleaseConfig } from "./release/config/vite";
import { applyConfig as applyMonacoConfig } from "./src/suede/python-monaco-suede/config/vite";

export default applyReleaseConfig(
  applyMonacoConfig(
    defineConfig({
      plugins: [tailwindcss(), sveltekit()],
      test: {
        expect: { requireAssertions: true },
        projects: [
          {
            extends: "./vite.config.ts",
            test: {
              name: "server",
              environment: "node",
              include: ["src/**/*.{test,spec}.{js,ts}"],
              exclude: ["src/**/*.svelte.{test,spec}.{js,ts}"],
            },
          },
        ],
      },
    }),
  ),
);
