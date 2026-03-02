import type { PyodideAPI } from "pyodide";

export type RenderPayload = {
  base64: string;
  format: "png" | "gif";
  width: number;
  height: number;
};

export const is = (query: any): query is RenderPayload =>
  typeof query === "object" &&
  query !== null &&
  typeof query.base64 === "string" &&
  typeof query.width === "number" &&
  typeof query.height === "number";

export const patchMatplotlib = async (pyodide: PyodideAPI) => {
  const patch = `
import base64
import io
from PIL import Image

import matplotlib
matplotlib.use('Agg')

from matplotlib import pyplot as plt
import matplotlib.animation as animation

global FuncAnimation
FuncAnimation = animation.FuncAnimation

_animation_ref = None

def ensure_matplotlib_patch():
    global FuncAnimation
    _old_show = plt.show
    old_FuncAnimation = FuncAnimation

    global _animation_ref
    global _total_frames
    total_frames = 0

    # Custom function to create and store animations
    def custom_FuncAnimation(*args, **kwargs):
        global _animation_ref
        global _total_frames

        frames = kwargs.get('frames', None)

        if isinstance(frames, int):
            _total_frames = frames
        elif hasattr(frames, '__len__'):
            _total_frames = len(frames)
        elif frames is not None:
            # Estimate frame count if it's a generator (iterate over it once to count)
            _total_frames = sum(1 for _ in frames)
        else:
            raise TypeError("Unable to determine the total number of frames")

        _animation_ref = old_FuncAnimation(*args, **kwargs)
        return _animation_ref

    # Override FuncAnimation to capture the animation reference
    animation.FuncAnimation = custom_FuncAnimation
    FuncAnimation = custom_FuncAnimation

    def show():
        fig = plt.gcf()
        buf = io.BytesIO()
        outformat = 'png'
        global _animation_ref
        if _animation_ref is not None:
            outformat = 'gif'
            frames = []
            for frame in range(_total_frames):  # Iterate over all frames
                _animation_ref._step()  # Advance to the next frame
                buf = io.BytesIO()
                fig.savefig(buf, format='png')  # Save current frame to buffer
                buf.seek(0)
                curr_img = Image.open(buf)
                frames.append(curr_img)  # Append frame as PIL Image
            gif_buf = io.BytesIO()
            frames[0].save(fp=gif_buf, format='GIF', save_all=True, append_images=frames[1:], loop=0)
            gif_buf.seek(0)
            data = base64.b64encode(gif_buf.read()).decode('utf-8')
            width, height = frames[0].size
        else:
            fig.savefig(buf, format='png')
            buf.seek(0)
            # encode to a base64 str
            data = base64.b64encode(buf.read()).decode('utf-8')
            width, height = fig.get_size_inches() * fig.dpi
            width, height = int(width), int(height)
        plt.close(fig)
        return {
            '${"base64" satisfies keyof RenderPayload}': data,
            '${"width" satisfies keyof RenderPayload}': width,
            '${"height" satisfies keyof RenderPayload}': height,
            '${"format" satisfies keyof RenderPayload}': outformat,
        }

    plt.show = show

ensure_matplotlib_patch()
`;
  await pyodide.loadPackage("matplotlib");
  await pyodide.runPythonAsync(patch);
};

export const unloadLocalModules = async (pyodide: PyodideAPI, root: string) => {
  const code = `
import sys
import importlib
from pathlib import PurePosixPath

def _module_paths(mod):
    """Return possible filesystem paths a module/package lives at."""
    spec = getattr(mod, "__spec__", None)
    out = set()

    # Normal modules/packages
    f = getattr(mod, "__file__", None)
    if f:
        out.add(str(PurePosixPath(f)))

    # importlib metadata
    if spec is not None:
        origin = getattr(spec, "origin", None)
        if origin and origin not in ("built-in", "frozen"):
            out.add(str(PurePosixPath(origin)))

        # Namespace packages / packages: list of directories
        locs = getattr(spec, "submodule_search_locations", None)
        if locs:
            for p in locs:
                out.add(str(PurePosixPath(p)))

    return out

def unload_local_modules(
    local_roots=("/home/pyodide",),   # add your project root(s) here
    external_roots=("/lib/python", "/usr/lib", "/usr/local/lib"),
    extra_keep=(),
):
    """
    Remove modules considered 'local' from sys.modules.
    Heuristic: module path is under a local_root and NOT under any external_root.
    """
    local_roots = tuple(str(PurePosixPath(p)) for p in local_roots)
    external_roots = tuple(str(PurePosixPath(p)) for p in external_roots)
    keep = set(extra_keep)

    to_delete = []
    for name, mod in list(sys.modules.items()):
        if mod is None or name in keep:
            continue

        paths = _module_paths(mod)
        if not paths:
            continue  # built-in/frozen/no-file modules -> skip

        # "local" if any path is inside local_roots, and none are inside external_roots
        is_under_local = any(any(p.startswith(r.rstrip("/") + "/") or p == r for r in local_roots) for p in paths)
        is_under_external = any(any(p.startswith(r.rstrip("/") + "/") or p == r for r in external_roots) for p in paths)

        if is_under_local and not is_under_external:
            to_delete.append(name)

    for name in to_delete:
        sys.modules.pop(name, None)

    importlib.invalidate_caches()
    return to_delete;
    
unload_local_modules(local_roots=("${root}",))
`;

  const unloaded = await pyodide.runPythonAsync(code);
  const report = unloaded.__str__();
  if (unloaded instanceof pyodide.ffi.PyProxy) unloaded.destroy();
  console.log("Unloaded modules:", report);
};
