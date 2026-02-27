import type { PyodideAPI } from "pyodide";

export type Payload = {
  base64: string;
  format: "png" | "gif";
  width: number;
  height: number;
};

export const is = (query: any): query is Payload =>
  typeof query === "object" &&
  query !== null &&
  typeof query.base64 === "string" &&
  typeof query.width === "number" &&
  typeof query.height === "number";

/**
 * Matplotlib currently creates a dom element which never gets attached to the DOM.
 * Without a way to specify our own DOM node creation function, we override it here - saving us from shipping our own matplotlib package.
 */
export async function patchMatplotlib(pyodide: PyodideAPI) {
  // Switch to simpler matplotlib backend https://github.com/jupyterlite/jupyterlite/blob/main/packages/pyolite-kernel/py/pyolite/pyolite/patches.py

  await pyodide.loadPackage("ipython");
  await pyodide.loadPackage("matplotlib_inline");
  await pyodide.loadPackage("matplotlib");

  //   await pyodide.runPythonAsync(`
  // import matplotlib
  // matplotlib.use('module://matplotlib_inline.backend_inline')
  // import matplotlib.pyplot

  // old_show = matplotlib.pyplot.show

  // import base64
  // import io

  // def show():
  //   #fig = matplotlib.pyplot.gcf()
  //   #buf = io.BytesIO()
  //   #fig.savefig(buf, format='png')
  //   #png_data = base64.b64encode(buf.getvalue()).decode('utf-8')
  //   #result = { '${"base64" satisfies keyof Payload}': png_data, '${"width" satisfies keyof Payload}': fig.get_size_inches()[0] * fig.dpi, '${"height" satisfies keyof Payload}': fig.get_size_inches()[1] * fig.dpi }
  //   #matplotlib.pyplot.close(fig)
  //   old_show()
  //   #return result

  // matplotlib.pyplot.show = show
  // `);

  await pyodide.runPythonAsync(z);
}

const z = `
import matplotlib
matplotlib.use('Agg')


from matplotlib import pyplot as plt
import matplotlib.animation as animation
global FuncAnimation
FuncAnimation = animation.FuncAnimation

import base64
import io
from PIL import Image  # Import Pillow for manual GIF creation

_animation_ref = None

### DO NOT MODIFY
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
            img = base64.b64encode(gif_buf.read()).decode('utf-8')
            width, height = frames[0].size
        else:
            fig.savefig(buf, format='png')
            buf.seek(0)
            # encode to a base64 str
            img = base64.b64encode(buf.read()).decode('utf-8')
            width, height = fig.get_size_inches() * fig.dpi
            width, height = int(width), int(height)
        plt.close(fig)
        return { '${"base64" satisfies keyof Payload}': img, '${"width" satisfies keyof Payload}': width, '${"height" satisfies keyof Payload}': height, '${"format" satisfies keyof Payload}': outformat }

    plt.show = show

ensure_matplotlib_patch()
`;
