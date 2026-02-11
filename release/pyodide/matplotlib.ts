import type { PyodideAPI } from "pyodide";

export type Payload = {
  base64: string;
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

  await pyodide.runPythonAsync(`
import matplotlib
matplotlib.use('module://matplotlib_inline.backend_inline')
import matplotlib.pyplot

import base64
import io

def show():
  fig = matplotlib.pyplot.gcf()
  buf = io.BytesIO()
  fig.savefig(buf, format='png')
  png_data = base64.b64encode(buf.getvalue()).decode('utf-8')
  result = { '${"base64" satisfies keyof Payload}': png_data, '${"width" satisfies keyof Payload}': fig.get_size_inches()[0] * fig.dpi, '${"height" satisfies keyof Payload}': fig.get_size_inches()[1] * fig.dpi }
  matplotlib.pyplot.close(fig)
  return result

matplotlib.pyplot.show = show
`);
}
