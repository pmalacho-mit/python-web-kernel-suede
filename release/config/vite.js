/// <reference types="node" />

import { viteStaticCopy } from "vite-plugin-static-copy";
import { suederoot } from "./dirname";
import { resolve } from "node:path";

/**
 * @typedef {object} ApplyOptions
 * @property {boolean} [patchCrossOriginIsolation] Whether to patch cross-origin isolation headers
 */

/**
 *
 * @param {import('vite').UserConfig} current
 * @param {ApplyOptions} [options]
 * @return {import('vite').UserConfig}
 */
export const applyConfig = (
  current,
  { patchCrossOriginIsolation = true } = {},
) => {
  current.server ??= {};
  current.server.host ??= "0.0.0.0";
  current.server.fs ??= {};
  current.server.fs.allow ??= [];
  current.server.fs.allow.push(suederoot);
  current.server.headers ??= {};
  current.server.headers["Cross-Origin-Embedder-Policy"] = "require-corp";
  current.server.headers["Cross-Origin-Opener-Policy"] = "same-origin";

  current.worker ??= {};

  current.worker.format ??= "es";

  if (patchCrossOriginIsolation) {
    current.plugins ??= [];

    const coi = resolve(suederoot, "config/static/coi-serviceworker.js");

    current.plugins.push(
      viteStaticCopy({
        targets: [{ src: coi, dest: "./" }],
      }),
    );
  }

  return current;
};
