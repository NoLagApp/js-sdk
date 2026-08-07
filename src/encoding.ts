/**
 * Self-contained base64url and UTF-8 decoding.
 *
 * The JWT path deliberately avoids `atob`, `Buffer` and `TextDecoder`: none of
 * the three is guaranteed on React Native/Hermes, and depending on them would
 * turn a missing global into a runtime token failure on mobile.
 */

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// Char code -> 6-bit value. -1 marks anything that is not a base64 symbol,
// which includes padding and the whitespace some encoders insert.
const BASE64_LOOKUP = /* @__PURE__ */ (() => {
  const table = new Int16Array(128).fill(-1);
  for (let i = 0; i < BASE64_ALPHABET.length; i++) {
    table[BASE64_ALPHABET.charCodeAt(i)] = i;
  }
  // URL-safe aliases for + and /
  table["-".charCodeAt(0)] = 62;
  table["_".charCodeAt(0)] = 63;
  return table;
})();

function symbolAt(input: string, index: number): number {
  const code = input.charCodeAt(index);
  return code < 128 ? BASE64_LOOKUP[code] : -1;
}

/**
 * Decode base64 or base64url into bytes. Padding is optional and any
 * non-symbol character is skipped.
 */
export function base64UrlToBytes(input: string): Uint8Array {
  let symbolCount = 0;
  for (let i = 0; i < input.length; i++) {
    if (symbolAt(input, i) >= 0) symbolCount++;
  }

  // Each group of 4 symbols carries 3 bytes; a trailing group of 2 or 3
  // symbols carries 1 or 2 bytes.
  const bytes = new Uint8Array(Math.floor((symbolCount * 3) / 4));

  let acc = 0;
  let accBits = 0;
  let out = 0;
  for (let i = 0; i < input.length; i++) {
    const value = symbolAt(input, i);
    if (value < 0) continue;
    acc = (acc << 6) | value;
    accBits += 6;
    if (accBits >= 8) {
      accBits -= 8;
      bytes[out++] = (acc >> accBits) & 0xff;
    }
  }

  return bytes;
}

// String.fromCharCode is applied in chunks: spreading a large array blows the
// call stack on every engine we care about.
const CHUNK_SIZE = 0x1000;

/**
 * Decode UTF-8 bytes into a string. Malformed sequences become U+FFFD rather
 * than throwing, matching TextDecoder's non-fatal default.
 */
export function utf8BytesToString(bytes: Uint8Array): string {
  const length = bytes.length;
  const units: number[] = [];
  let result = "";
  let i = 0;

  while (i < length) {
    const byte1 = bytes[i++];
    let codePoint: number;

    if (byte1 < 0x80) {
      codePoint = byte1;
    } else if ((byte1 & 0xe0) === 0xc0) {
      codePoint = ((byte1 & 0x1f) << 6) | (bytes[i++] & 0x3f);
    } else if ((byte1 & 0xf0) === 0xe0) {
      codePoint =
        ((byte1 & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    } else if ((byte1 & 0xf8) === 0xf0) {
      codePoint =
        ((byte1 & 0x07) << 18) |
        ((bytes[i++] & 0x3f) << 12) |
        ((bytes[i++] & 0x3f) << 6) |
        (bytes[i++] & 0x3f);
    } else {
      codePoint = 0xfffd;
    }

    if (codePoint > 0xffff) {
      // Outside the BMP: emit a surrogate pair.
      const offset = codePoint - 0x10000;
      units.push(0xd800 | (offset >> 10), 0xdc00 | (offset & 0x3ff));
    } else {
      units.push(codePoint);
    }

    if (units.length >= CHUNK_SIZE) {
      result += String.fromCharCode(...units);
      units.length = 0;
    }
  }

  if (units.length > 0) {
    result += String.fromCharCode(...units);
  }

  return result;
}

/**
 * Decode a base64url-encoded UTF-8 string (a JWT segment, for example).
 */
export function base64UrlToString(input: string): string {
  return utf8BytesToString(base64UrlToBytes(input));
}
