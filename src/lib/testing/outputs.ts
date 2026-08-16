import { Output } from "../../../release";

/** The `data:` URLs of every image a run displayed. */
export const imagesIn = (outputs: Output.Specific[]) =>
  outputs
    .filter((output) => Output.is(output, "display_data"))
    .map((output) => Output.accessor(output).image)
    .filter((image): image is string => image !== undefined);

/** The rendered values a run produced, as html or plain text. */
export const resultsIn = (outputs: Output.Specific[]) =>
  outputs
    .filter((output) => Output.is(output, "execute_result"))
    .map((output) => Output.accessor(output));

export const startsWith = (value: unknown, magic: number[]) =>
  value instanceof Uint8Array &&
  magic.every((byte, index) => value[index] === byte);

export const MAGIC = {
  gif: [0x47, 0x49, 0x46, 0x38],
  png: [0x89, 0x50, 0x4e, 0x47],
};
