/**
 * @typedef {import("@sveltejs/kit").RequestEvent} RequestEvent
 * @typedef {import("@sveltejs/kit").ResolveOptions} ResolveOptions
 */

/**
 * Set headers to enable SharedArrayBuffer support for cross-origin requests, allowing the application to use SharedArrayBuffer in a secure context.
 * This is necessary for features that require shared memory across different origins, such as certain web workers or performance optimizations.
 *
 * Use this in your SvelteKit server hooks file (e.g. `./src/hooks.server.js`) to ensure that the appropriate headers are set for all incoming requests, enabling the use of SharedArrayBuffer in a cross-origin context.
 *
 * @example
 * ```javascript
 * // src/hooks.server.js
 * export { handle } from "$python-web-kernel-suede/sveltekit/hooks.server";
 * ```
 *
 * @param {Object} params - The parameters object
 * @param {RequestEvent} params.event - The request event object
 * @param {(event: RequestEvent, opts?: ResolveOptions) => Promise<Response>} params.resolve - Function to resolve the request
 * @returns {Promise<Response>} The response object
 */
export async function handle({ event, resolve }) {
  const { setHeaders } = event;
  setHeaders({
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "cross-origin",
  });
  return await resolve(event);
}
