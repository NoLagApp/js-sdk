import { describe, it, expect } from "vitest";
import {
  base64UrlToBytes,
  base64UrlToString,
  utf8BytesToString,
} from "../../src/encoding";

/**
 * The JWT path must not depend on atob/Buffer/TextDecoder, since none of them
 * is guaranteed on React Native/Hermes. These tests pin the inlined decoder
 * against Node's built-ins, which are the reference implementation.
 */

function refEncodeBase64Url(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

describe("base64UrlToBytes", () => {
  it("decodes each unpadded length class (0, 1, 2 trailing symbols)", () => {
    for (const input of ["", "a", "ab", "abc", "abcd", "abcde", "abcdef"]) {
      const encoded = refEncodeBase64Url(input);
      expect(Array.from(base64UrlToBytes(encoded))).toEqual(
        Array.from(Buffer.from(input, "utf8"))
      );
    }
  });

  it("accepts padded input", () => {
    expect(Array.from(base64UrlToBytes("YQ=="))).toEqual([0x61]);
    expect(Array.from(base64UrlToBytes("YWI="))).toEqual([0x61, 0x62]);
  });

  it("maps the URL-safe alphabet to + and /", () => {
    // 0xfb 0xff maps to '-_' in base64url and '+/' in standard base64.
    expect(Array.from(base64UrlToBytes("-_8"))).toEqual([0xfb, 0xff]);
    expect(Array.from(base64UrlToBytes("+/8"))).toEqual([0xfb, 0xff]);
  });

  it("decodes the full byte range", () => {
    const bytes = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
    const encoded = bytes.toString("base64url");
    expect(Array.from(base64UrlToBytes(encoded))).toEqual(Array.from(bytes));
  });

  it("skips whitespace rather than corrupting the output", () => {
    expect(Array.from(base64UrlToBytes("YW\nJj"))).toEqual([0x61, 0x62, 0x63]);
  });
});

describe("utf8BytesToString", () => {
  const cases: Array<[string, string]> = [
    ["ascii", "hello world"],
    ["2-byte", "café résumé naïve"],
    ["3-byte", "日本語テキスト"],
    ["4-byte astral", "emoji 🚀🎉 and 𝄞 clef"],
    ["mixed", 'a£€𝄞 {"exp":123}'],
    ["empty", ""],
  ];

  for (const [name, input] of cases) {
    it(`round-trips ${name} identically to TextDecoder`, () => {
      const bytes = new Uint8Array(Buffer.from(input, "utf8"));
      expect(utf8BytesToString(bytes)).toBe(input);
      expect(utf8BytesToString(bytes)).toBe(new TextDecoder().decode(bytes));
    });
  }

  it("handles input larger than the internal chunk size", () => {
    // CHUNK_SIZE is 0x1000; go well past it to exercise the flush path.
    const input = "aé日🚀".repeat(3000);
    const bytes = new Uint8Array(Buffer.from(input, "utf8"));
    expect(utf8BytesToString(bytes)).toBe(input);
  });

  it("substitutes U+FFFD for a malformed lead byte instead of throwing", () => {
    expect(utf8BytesToString(new Uint8Array([0xf8, 0x41]))).toBe("�A");
  });
});

describe("base64UrlToString", () => {
  it("decodes a realistic JWT payload segment", () => {
    const payload = {
      sub: "actor_123",
      exp: 1893456000,
      name: "Renée 日本",
      scope: ["subscribe", "publish"],
    };
    const segment = refEncodeBase64Url(JSON.stringify(payload));
    expect(JSON.parse(base64UrlToString(segment))).toEqual(payload);
  });

  it("does not reach for atob, Buffer or TextDecoder", async () => {
    // Prove the module works with all three globals removed, which is the
    // failure mode we are guarding against on Hermes.
    const globals = globalThis as Record<string, unknown>;
    const saved = {
      atob: globals.atob,
      Buffer: globals.Buffer,
      TextDecoder: globals.TextDecoder,
    };
    const segment = refEncodeBase64Url('{"exp":1893456000}');

    delete globals.atob;
    delete globals.Buffer;
    delete globals.TextDecoder;
    try {
      expect(JSON.parse(base64UrlToString(segment)).exp).toBe(1893456000);
    } finally {
      Object.assign(globals, saved);
    }
  });
});
