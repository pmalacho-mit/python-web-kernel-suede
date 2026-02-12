import { defineConfig } from "vitest/config";
import { sveltekit } from "@sveltejs/kit/vite";
import { applyConfig } from "./release/config/vite";

export default applyConfig(
  defineConfig({
    plugins: [sveltekit()],
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
);
