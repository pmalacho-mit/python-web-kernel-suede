/// <reference types="vite/client" />

import patchMatplotlib from "./patch_matplotlib.py?raw";
import unloadLocalModules from "./unload_local_modules.py?raw";

export const code = {
  patchMatplotlib,
  unloadLocalModules: (root: string) => `${unloadLocalModules}
unload_local_modules(local_roots=("${root}",))`,
};
