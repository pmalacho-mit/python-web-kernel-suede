import { register } from "tsx/esm/api";

/**
 * Registers TypeScript resolution inside the worker before loading the fixture.
 *
 * Passing `--import tsx` through `execArgv` instead leaves the fixture's own
 * relative imports unresolvable on some Node versions — 22.22.2 fails where
 * 22.23.2 and 24.x succeed — and the failure surfaces as every test in the file
 * timing out rather than as anything about module resolution.
 */
register();

await import("./bridge.fixture.ts");
