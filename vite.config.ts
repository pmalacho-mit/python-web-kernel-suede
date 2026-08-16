import { defineConfig } from "vitest/config";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { applyConfig as applyReleaseConfig } from "./release/config/vite";

const base = process.env.BASE_PATH ?? "";

export default applyReleaseConfig(
  defineConfig({
    base,
    plugins: [tailwindcss(), sveltekit()],
    test: {
      expect: { requireAssertions: true },
      projects: [
        {
          extends: "./vite.config.ts",
          test: {
            name: "unit",
            environment: "node",
            include: ["tests/**/*.{test,spec}.ts"],
          },
        },
      ],
    },
  }),
);
