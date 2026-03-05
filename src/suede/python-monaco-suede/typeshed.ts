/// <reference path="./globals.d.ts" />
import { readZipFile } from "./utils/zip";

const typeshedUrl = PYTHON_MONACO_BASE + "stdlib-source-with-typeshed-pyi.zip";

const tryPrependSlash = (filename: string) =>
  filename.replace(/^(stdlib|stubs)/, "/$1");

export const types = () => readZipFile(typeshedUrl, tryPrependSlash);
