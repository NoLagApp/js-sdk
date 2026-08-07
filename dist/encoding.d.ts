/**
 * Self-contained base64url and UTF-8 decoding.
 *
 * The JWT path deliberately avoids `atob`, `Buffer` and `TextDecoder`: none of
 * the three is guaranteed on React Native/Hermes, and depending on them would
 * turn a missing global into a runtime token failure on mobile.
 */
/**
 * Decode base64 or base64url into bytes. Padding is optional and any
 * non-symbol character is skipped.
 */
export declare function base64UrlToBytes(input: string): Uint8Array;
/**
 * Decode UTF-8 bytes into a string. Malformed sequences become U+FFFD rather
 * than throwing, matching TextDecoder's non-fatal default.
 */
export declare function utf8BytesToString(bytes: Uint8Array): string;
/**
 * Decode a base64url-encoded UTF-8 string (a JWT segment, for example).
 */
export declare function base64UrlToString(input: string): string;
