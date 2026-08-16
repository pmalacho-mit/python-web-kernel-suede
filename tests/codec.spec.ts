import { describe, expect, it } from "vitest";
import { codec, CodecError, KNOWN_SYMBOLS, type References } from "../release/worker/codec";

const roundTrip = <T>(value: T, references?: References) =>
  codec.decode(codec.encode(value, references), references);

const allByteValues = Uint8Array.from({ length: 256 }, (_, index) => index);

/** Comparing megabytes element by element is slower than the codec itself. */
const digest = (bytes: Uint8Array) => ({
  length: bytes.byteLength,
  checksum: bytes.reduce((sum, byte, index) => (sum + byte * (index + 1)) % 2 ** 32, 0),
});

const registry = (): References => {
  const objects = new Map<string, unknown>();
  let next = 0;
  return {
    encode(value) {
      const id = `ref-${next++}`;
      objects.set(id, value);
      return id;
    },
    decode: (id) => objects.get(id),
  };
};

describe("primitives", () => {
  it.each([undefined, null, true, false])("round trips %s", (value) => {
    expect(roundTrip(value)).toBe(value);
  });

  it.each([0, 1, -1, 1.5, 1e300, Number.MAX_SAFE_INTEGER, Infinity, -Infinity])(
    "round trips the number %s",
    (value) => {
      expect(roundTrip(value)).toBe(value);
    },
  );

  it("round trips NaN", () => {
    expect(roundTrip(NaN)).toBeNaN();
  });

  it("keeps negative zero distinguishable", () => {
    expect(Object.is(roundTrip(-0), -0)).toBe(true);
  });

  it("round trips bigints beyond double precision", () => {
    const value = 123456789012345678901234567890n;
    expect(roundTrip(value)).toBe(value);
  });

  it("round trips dates", () => {
    const value = new Date("2024-02-29T12:34:56.789Z");
    expect(roundTrip(value)).toEqual(value);
  });
});

describe("text", () => {
  const samples = {
    empty: "",
    ascii: "print('hello')",
    accents: "café — naïve",
    cjk: "日本語のコメント",
    astral: "🐍 emoji 🎉 with surrogate pairs",
    combining: "é à",
    nul: "with a\u0000nul",
    maximum: "\u{10FFFF} is the last code point",
    whitespace: "tab\tnewline\ncarriage\rreturn",
    quotes: `mixed "double" 'single' \`\`\`triple\`\`\``,
  };

  it.each(Object.entries(samples))("round trips %s", (_name, value) => {
    expect(roundTrip(value)).toBe(value);
  });

  it("round trips a python source file byte for byte", () => {
    const source = [
      "# -*- coding: utf-8 -*-",
      'ΣΥΜΒΟΛΑ = {"π": 3.14159, "ø": 0}',
      'print("emoji 🐍 and a tab\\tand a nul \\x00")',
      "def λ(x):\r\n    return x ** 2\r\n",
    ].join("\n");
    expect(roundTrip(source)).toBe(source);
  });

  it("round trips text far larger than the initial write buffer", () => {
    const value = "🎉".repeat(200_000);
    expect(roundTrip(value)).toBe(value);
  });
});

describe("binary", () => {
  it("round trips an empty byte array", () => {
    expect(roundTrip(new Uint8Array())).toEqual(new Uint8Array());
  });

  it("round trips every possible byte value", () => {
    expect(roundTrip(allByteValues)).toEqual(allByteValues);
  });

  it("round trips bytes that are not valid utf-8", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(roundTrip(png)).toEqual(png);
  });

  it("round trips a megabyte of bytes", () => {
    const value = Uint8Array.from({ length: 1 << 20 }, (_, i) => (i * 31) % 256);
    expect(digest(roundTrip(value) as Uint8Array)).toEqual(digest(value));
  });

  it("returns bytes that own their buffer", () => {
    const decoded = roundTrip(allByteValues) as Uint8Array;
    expect(decoded.byteOffset).toBe(0);
    expect(decoded.buffer.byteLength).toBe(decoded.byteLength);
  });

  it("round trips array buffers", () => {
    const decoded = roundTrip(allByteValues.buffer) as ArrayBuffer;
    expect(decoded).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(decoded)).toEqual(allByteValues);
  });

  it("keeps bytes nested inside a structure", () => {
    const value = { ok: true, data: allByteValues, path: "sprite.png" };
    expect(roundTrip(value)).toEqual(value);
  });
});

describe("structures", () => {
  it("round trips nested arrays and records", () => {
    const value = {
      name: "ps4",
      files: ["a.py", "b.py"],
      nested: { deep: { deeper: [1, { two: 2n }] } },
      missing: undefined,
      nothing: null,
    };
    expect(roundTrip(value)).toEqual(value);
  });

  it("round trips maps keyed by things other than strings", () => {
    const value = new Map<unknown, unknown>([
      [1, "one"],
      ["two", 2],
      [Symbol.iterator, "symbol key"],
    ]);
    expect(roundTrip(value)).toEqual(value);
  });

  it("round trips sets", () => {
    const value = new Set([1, "two", null]);
    expect(roundTrip(value)).toEqual(value);
  });

  it("round trips errors with their name and stack", () => {
    const error = new TypeError("bad argument");
    const decoded = roundTrip(error) as Error;
    expect(decoded).toBeInstanceOf(Error);
    expect(decoded.name).toBe("TypeError");
    expect(decoded.message).toBe("bad argument");
    expect(decoded.stack).toBe(error.stack);
  });

  it("refuses to encode a circular structure", () => {
    const value: any = { name: "loop" };
    value.self = value;
    expect(() => codec.encode(value)).toThrow(CodecError);
  });

  it("encodes the same object twice when it is not circular", () => {
    const shared = { shared: true };
    expect(roundTrip([shared, shared])).toEqual([shared, shared]);
  });
});

describe("symbols", () => {
  it.each(KNOWN_SYMBOLS)("round trips the well known symbol %s", (value) => {
    expect(roundTrip(value)).toBe(value);
  });

  it("round trips registered symbols by identity", () => {
    expect(roundTrip(Symbol.for("id"))).toBe(Symbol.for("id"));
  });

  it("keeps the description of an unregistered symbol", () => {
    const decoded = roundTrip(Symbol("local")) as symbol;
    expect(decoded.description).toBe("local");
  });
});

describe("references", () => {
  it("sends functions by reference", () => {
    const references = registry();
    const value = () => "called";
    expect(roundTrip(value, references)).toBe(value);
  });

  it("sends class instances by reference", () => {
    const references = registry();
    const value = new (class Widget {
      count = 1;
    })();
    expect(roundTrip(value, references)).toBe(value);
  });

  it("refuses values it cannot represent when there is no registry", () => {
    expect(() => codec.encode(() => {})).toThrow(CodecError);
    expect(() => codec.encode(new Map([[1, () => {}]]))).toThrow(CodecError);
  });
});

describe("identity", () => {
  const remote = (id: string) => {
    const value = { looks: "plain" };
    const references: References = {
      identify: (candidate) => (candidate === value ? id : undefined),
      encode: () => id,
      decode: (found) => (found === id ? value : undefined),
    };
    return { value, references };
  };

  it("sends a value the other thread owns by reference, not by shape", () => {
    const { value, references } = remote("host-1");
    expect(roundTrip(value, references)).toBe(value);
  });

  it("sends one nested inside a structure by reference too", () => {
    const { value, references } = remote("host-1");
    expect(roundTrip({ held: [value] }, references)).toEqual({ held: [value] });
  });

  it("still copies values the other thread does not own", () => {
    const { references } = remote("host-1");
    const local = { looks: "plain" };
    expect(roundTrip(local, references)).not.toBe(local);
    expect(roundTrip(local, references)).toEqual(local);
  });
});

describe("framing", () => {
  it("rejects decoding straight out of shared memory", () => {
    const shared = new Uint8Array(new SharedArrayBuffer(16));
    shared.set(codec.encode(true));
    expect(() => codec.decode(shared)).toThrow(CodecError);
  });

  it("rejects an unknown tag", () => {
    const encoded = codec.encode(true);
    expect(() => codec.decode(Uint8Array.of(encoded[0], 200))).toThrow(CodecError);
  });

  it("rejects a payload from a different version of the codec", () => {
    const encoded = codec.encode("hello");
    encoded[0] += 1;
    expect(() => codec.decode(encoded)).toThrow(/version/);
  });

  it("says a payload is truncated rather than mis-reading it", () => {
    const encoded = codec.encode("a longer string than survives the cut");
    expect(() => codec.decode(encoded.slice(0, 6))).toThrow(/truncated/);
  });
});
