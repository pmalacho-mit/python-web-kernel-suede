import pyodide.code
import os
import sys
import micropip


def find_external_imports_of_local_modules(
    source: str,
    path: str,
    recursive = True,
):
    external_imports: set[str] = set()
    visited: set[str] = set()
    stdlib = set(sys.stdlib_module_names)
    installed = {pkg.name for pkg in micropip.list().values()}

    def is_installed(name: str) -> bool:
        return (
            name in installed
            or name.replace("_", "-") in installed
            or name.replace("-", "_") in installed
        )

    def resolve_local_module(name: str, base_dir: str):
        candidate_file = os.path.join(base_dir, name + ".py")
        if os.path.isfile(candidate_file):
            return candidate_file, base_dir

        candidate_pkg = os.path.join(base_dir, name, "__init__.py")
        if os.path.isfile(candidate_pkg):
            return candidate_pkg, os.path.dirname(candidate_pkg)

        return None, None

    def visit_local_module(module_path: str, module_base_dir: str):
        if module_path in visited:
            return

        visited.add(module_path)
        try:
            with open(module_path) as f:
                src = f.read()
        except Exception:
            return

        for imp in pyodide.code.find_imports(src):
            top = imp.split(".")[0]
            next_module_path, next_base_dir = resolve_local_module(top, module_base_dir)

            if next_module_path:
                if recursive:
                    visit_local_module(next_module_path, next_base_dir)
                continue

            if top not in stdlib and not is_installed(top):
                external_imports.add(top)

    base_dir = os.path.dirname(path)
    for imp in pyodide.code.find_imports(source):
        top = imp.split(".")[0]
        module_path, module_base_dir = resolve_local_module(top, base_dir)
        if module_path:
            visit_local_module(module_path, module_base_dir)

    return sorted(external_imports)
