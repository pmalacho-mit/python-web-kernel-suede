import { fromConfiguredBase } from "./globals";
import { readZipFile } from "./utils/zip";

const typeshedUrl = fromConfiguredBase("stdlib-source-with-typeshed-pyi.zip");

const tryPrependSlash = (filename: string) =>
  filename.replace(/^(stdlib|stubs)/, "/$1");

export const types = () => readZipFile(typeshedUrl, tryPrependSlash);
