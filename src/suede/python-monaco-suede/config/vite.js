/// <reference types="node" />

import importMetaUrlPlugin from "@codingame/esbuild-import-meta-url-plugin";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { findNearestNodeModules } from "./utils";
import { suederoot } from "./dirname";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

/**
 * @typedef {object} ApplyOptions
 * @property {string} [base] Base URL to embed into PYTHON_MONACO_BASE
 */

/**
 *
 * @param {import('vite').UserConfig} current
 * @param {ApplyOptions} [options]
 * @return {import('vite').UserConfig}
 */
export const applyConfig = (current, options = {}) => {
  current.server ??= {};
  current.server.host ??= "0.0.0.0";
  current.server.fs ??= {};
  current.server.fs.allow ??= [];
  current.server.fs.allow.push(suederoot);
  current.define ??= {};
  current.define["PYTHON_MONACO_BASE"] =
    `"${options?.base ?? current.base ?? `/`}"`;
  current.plugins ??= [];

  const node_modules = findNearestNodeModules(suederoot);
  if (!node_modules) throw new Error("Could not find node_modules directory");

  const pyright = resolve(
    node_modules,
    "@typefox/pyright-browser/dist/pyright.worker.js",
  );

  if (!existsSync(pyright)) throw new Error("Could not find pyright.worker.js");

  const typeshed = resolve(
    suederoot,
    "assets/stdlib-source-with-typeshed-pyi.zip",
  );

  if (!existsSync(typeshed))
    throw new Error("Could not find stdlib-source-with-typeshed-pyi.zip asset");

  current.plugins.push(
    viteStaticCopy({
      targets: [
        { src: pyright, dest: "./" },
        { src: typeshed, dest: "./" },
      ],
    }),
  );
  current.optimizeDeps ??= {};
  current.optimizeDeps.esbuildOptions ??= {};
  current.optimizeDeps.esbuildOptions.plugins ??= [];
  current.optimizeDeps.esbuildOptions.plugins.push({
    name: "import.meta.url for @codingame only (causes svelte issues otherwise)",
    setup(args) {
      importMetaUrlPlugin.setup({
        ...args,
        onLoad: (options, callback) => {
          args.onLoad(
            {
              ...options,
              filter: /.*(@codingame|monaco-).*\.js$/,
            },
            callback,
          );
        },
      });
    },
  });
  return current;
};
