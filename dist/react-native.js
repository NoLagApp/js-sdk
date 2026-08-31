function utf8Count(str) {
    const strLength = str.length;
    let byteLength = 0;
    let pos = 0;
    while (pos < strLength) {
        let value = str.charCodeAt(pos++);
        if ((value & 0xffffff80) === 0) {
            // 1-byte
            byteLength++;
            continue;
        }
        else if ((value & 0xfffff800) === 0) {
            // 2-bytes
            byteLength += 2;
        }
        else {
            // handle surrogate pair
            if (value >= 0xd800 && value <= 0xdbff) {
                // high surrogate
                if (pos < strLength) {
                    const extra = str.charCodeAt(pos);
                    if ((extra & 0xfc00) === 0xdc00) {
                        ++pos;
                        value = ((value & 0x3ff) << 10) + (extra & 0x3ff) + 0x10000;
                    }
                }
            }
            if ((value & 0xffff0000) === 0) {
                // 3-byte
                byteLength += 3;
            }
            else {
                // 4-byte
                byteLength += 4;
            }
        }
    }
    return byteLength;
}
function utf8EncodeJs(str, output, outputOffset) {
    const strLength = str.length;
    let offset = outputOffset;
    let pos = 0;
    while (pos < strLength) {
        let value = str.charCodeAt(pos++);
        if ((value & 0xffffff80) === 0) {
            // 1-byte
            output[offset++] = value;
            continue;
        }
        else if ((value & 0xfffff800) === 0) {
            // 2-bytes
            output[offset++] = ((value >> 6) & 0x1f) | 0xc0;
        }
        else {
            // handle surrogate pair
            if (value >= 0xd800 && value <= 0xdbff) {
                // high surrogate
                if (pos < strLength) {
                    const extra = str.charCodeAt(pos);
                    if ((extra & 0xfc00) === 0xdc00) {
                        ++pos;
                        value = ((value & 0x3ff) << 10) + (extra & 0x3ff) + 0x10000;
                    }
                }
            }
            if ((value & 0xffff0000) === 0) {
                // 3-byte
                output[offset++] = ((value >> 12) & 0x0f) | 0xe0;
                output[offset++] = ((value >> 6) & 0x3f) | 0x80;
            }
            else {
                // 4-byte
                output[offset++] = ((value >> 18) & 0x07) | 0xf0;
                output[offset++] = ((value >> 12) & 0x3f) | 0x80;
                output[offset++] = ((value >> 6) & 0x3f) | 0x80;
            }
        }
        output[offset++] = (value & 0x3f) | 0x80;
    }
}
// TextEncoder and TextDecoder are standardized in whatwg encoding:
// https://encoding.spec.whatwg.org/
// and available in all the modern browsers:
// https://caniuse.com/textencoder
// They are available in Node.js since v12 LTS as well:
// https://nodejs.org/api/globals.html#textencoder
const sharedTextEncoder = new TextEncoder();
// This threshold should be determined by benchmarking, which might vary in engines and input data.
// Run `npx ts-node benchmark/encode-string.ts` for details.
const TEXT_ENCODER_THRESHOLD = 50;
function utf8EncodeTE(str, output, outputOffset) {
    sharedTextEncoder.encodeInto(str, output.subarray(outputOffset));
}
function utf8Encode(str, output, outputOffset) {
    if (str.length > TEXT_ENCODER_THRESHOLD) {
        utf8EncodeTE(str, output, outputOffset);
    }
    else {
        utf8EncodeJs(str, output, outputOffset);
    }
}
const CHUNK_SIZE$1 = 4096;
function utf8DecodeJs(bytes, inputOffset, byteLength) {
    let offset = inputOffset;
    const end = offset + byteLength;
    const units = [];
    let result = "";
    while (offset < end) {
        const byte1 = bytes[offset++];
        if ((byte1 & 0x80) === 0) {
            // 1 byte
            units.push(byte1);
        }
        else if ((byte1 & 0xe0) === 0xc0) {
            // 2 bytes
            const byte2 = bytes[offset++] & 0x3f;
            units.push(((byte1 & 0x1f) << 6) | byte2);
        }
        else if ((byte1 & 0xf0) === 0xe0) {
            // 3 bytes
            const byte2 = bytes[offset++] & 0x3f;
            const byte3 = bytes[offset++] & 0x3f;
            units.push(((byte1 & 0x1f) << 12) | (byte2 << 6) | byte3);
        }
        else if ((byte1 & 0xf8) === 0xf0) {
            // 4 bytes
            const byte2 = bytes[offset++] & 0x3f;
            const byte3 = bytes[offset++] & 0x3f;
            const byte4 = bytes[offset++] & 0x3f;
            let unit = ((byte1 & 0x07) << 0x12) | (byte2 << 0x0c) | (byte3 << 0x06) | byte4;
            if (unit > 0xffff) {
                unit -= 0x10000;
                units.push(((unit >>> 10) & 0x3ff) | 0xd800);
                unit = 0xdc00 | (unit & 0x3ff);
            }
            units.push(unit);
        }
        else {
            units.push(byte1);
        }
        if (units.length >= CHUNK_SIZE$1) {
            result += String.fromCharCode(...units);
            units.length = 0;
        }
    }
    if (units.length > 0) {
        result += String.fromCharCode(...units);
    }
    return result;
}
const sharedTextDecoder = new TextDecoder();
// This threshold should be determined by benchmarking, which might vary in engines and input data.
// Run `npx ts-node benchmark/decode-string.ts` for details.
const TEXT_DECODER_THRESHOLD = 200;
function utf8DecodeTD(bytes, inputOffset, byteLength) {
    const stringBytes = bytes.subarray(inputOffset, inputOffset + byteLength);
    return sharedTextDecoder.decode(stringBytes);
}
function utf8Decode(bytes, inputOffset, byteLength) {
    if (byteLength > TEXT_DECODER_THRESHOLD) {
        return utf8DecodeTD(bytes, inputOffset, byteLength);
    }
    else {
        return utf8DecodeJs(bytes, inputOffset, byteLength);
    }
}

/**
 * ExtData is used to handle Extension Types that are not registered to ExtensionCodec.
 */
class ExtData {
    constructor(type, data) {
        this.type = type;
        this.data = data;
    }
}

class DecodeError extends Error {
    constructor(message) {
        super(message);
        // fix the prototype chain in a cross-platform way
        const proto = Object.create(DecodeError.prototype);
        Object.setPrototypeOf(this, proto);
        Object.defineProperty(this, "name", {
            configurable: true,
            enumerable: false,
            value: DecodeError.name,
        });
    }
}

// Integer Utility
const UINT32_MAX = 4294967295;
// DataView extension to handle int64 / uint64,
// where the actual range is 53-bits integer (a.k.a. safe integer)
function setUint64(view, offset, value) {
    const high = value / 4294967296;
    const low = value; // high bits are truncated by DataView
    view.setUint32(offset, high);
    view.setUint32(offset + 4, low);
}
function setInt64(view, offset, value) {
    const high = Math.floor(value / 4294967296);
    const low = value; // high bits are truncated by DataView
    view.setUint32(offset, high);
    view.setUint32(offset + 4, low);
}
function getInt64(view, offset) {
    const high = view.getInt32(offset);
    const low = view.getUint32(offset + 4);
    return high * 4294967296 + low;
}
function getUint64(view, offset) {
    const high = view.getUint32(offset);
    const low = view.getUint32(offset + 4);
    return high * 4294967296 + low;
}

// https://github.com/msgpack/msgpack/blob/master/spec.md#timestamp-extension-type
const EXT_TIMESTAMP = -1;
const TIMESTAMP32_MAX_SEC = 0x100000000 - 1; // 32-bit unsigned int
const TIMESTAMP64_MAX_SEC = 0x400000000 - 1; // 34-bit unsigned int
function encodeTimeSpecToTimestamp({ sec, nsec }) {
    if (sec >= 0 && nsec >= 0 && sec <= TIMESTAMP64_MAX_SEC) {
        // Here sec >= 0 && nsec >= 0
        if (nsec === 0 && sec <= TIMESTAMP32_MAX_SEC) {
            // timestamp 32 = { sec32 (unsigned) }
            const rv = new Uint8Array(4);
            const view = new DataView(rv.buffer);
            view.setUint32(0, sec);
            return rv;
        }
        else {
            // timestamp 64 = { nsec30 (unsigned), sec34 (unsigned) }
            const secHigh = sec / 0x100000000;
            const secLow = sec & 0xffffffff;
            const rv = new Uint8Array(8);
            const view = new DataView(rv.buffer);
            // nsec30 | secHigh2
            view.setUint32(0, (nsec << 2) | (secHigh & 0x3));
            // secLow32
            view.setUint32(4, secLow);
            return rv;
        }
    }
    else {
        // timestamp 96 = { nsec32 (unsigned), sec64 (signed) }
        const rv = new Uint8Array(12);
        const view = new DataView(rv.buffer);
        view.setUint32(0, nsec);
        setInt64(view, 4, sec);
        return rv;
    }
}
function encodeDateToTimeSpec(date) {
    const msec = date.getTime();
    const sec = Math.floor(msec / 1e3);
    const nsec = (msec - sec * 1e3) * 1e6;
    // Normalizes { sec, nsec } to ensure nsec is unsigned.
    const nsecInSec = Math.floor(nsec / 1e9);
    return {
        sec: sec + nsecInSec,
        nsec: nsec - nsecInSec * 1e9,
    };
}
function encodeTimestampExtension(object) {
    if (object instanceof Date) {
        const timeSpec = encodeDateToTimeSpec(object);
        return encodeTimeSpecToTimestamp(timeSpec);
    }
    else {
        return null;
    }
}
function decodeTimestampToTimeSpec(data) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    // data may be 32, 64, or 96 bits
    switch (data.byteLength) {
        case 4: {
            // timestamp 32 = { sec32 }
            const sec = view.getUint32(0);
            const nsec = 0;
            return { sec, nsec };
        }
        case 8: {
            // timestamp 64 = { nsec30, sec34 }
            const nsec30AndSecHigh2 = view.getUint32(0);
            const secLow32 = view.getUint32(4);
            const sec = (nsec30AndSecHigh2 & 0x3) * 0x100000000 + secLow32;
            const nsec = nsec30AndSecHigh2 >>> 2;
            return { sec, nsec };
        }
        case 12: {
            // timestamp 96 = { nsec32 (unsigned), sec64 (signed) }
            const sec = getInt64(view, 4);
            const nsec = view.getUint32(0);
            return { sec, nsec };
        }
        default:
            throw new DecodeError(`Unrecognized data size for timestamp (expected 4, 8, or 12): ${data.length}`);
    }
}
function decodeTimestampExtension(data) {
    const timeSpec = decodeTimestampToTimeSpec(data);
    return new Date(timeSpec.sec * 1e3 + timeSpec.nsec / 1e6);
}
const timestampExtension = {
    type: EXT_TIMESTAMP,
    encode: encodeTimestampExtension,
    decode: decodeTimestampExtension,
};

// ExtensionCodec to handle MessagePack extensions
class ExtensionCodec {
    constructor() {
        // built-in extensions
        this.builtInEncoders = [];
        this.builtInDecoders = [];
        // custom extensions
        this.encoders = [];
        this.decoders = [];
        this.register(timestampExtension);
    }
    register({ type, encode, decode, }) {
        if (type >= 0) {
            // custom extensions
            this.encoders[type] = encode;
            this.decoders[type] = decode;
        }
        else {
            // built-in extensions
            const index = -1 - type;
            this.builtInEncoders[index] = encode;
            this.builtInDecoders[index] = decode;
        }
    }
    tryToEncode(object, context) {
        // built-in extensions
        for (let i = 0; i < this.builtInEncoders.length; i++) {
            const encodeExt = this.builtInEncoders[i];
            if (encodeExt != null) {
                const data = encodeExt(object, context);
                if (data != null) {
                    const type = -1 - i;
                    return new ExtData(type, data);
                }
            }
        }
        // custom extensions
        for (let i = 0; i < this.encoders.length; i++) {
            const encodeExt = this.encoders[i];
            if (encodeExt != null) {
                const data = encodeExt(object, context);
                if (data != null) {
                    const type = i;
                    return new ExtData(type, data);
                }
            }
        }
        if (object instanceof ExtData) {
            // to keep ExtData as is
            return object;
        }
        return null;
    }
    decode(data, type, context) {
        const decodeExt = type < 0 ? this.builtInDecoders[-1 - type] : this.decoders[type];
        if (decodeExt) {
            return decodeExt(data, type, context);
        }
        else {
            // decode() does not fail, returns ExtData instead.
            return new ExtData(type, data);
        }
    }
}
ExtensionCodec.defaultCodec = new ExtensionCodec();

function isArrayBufferLike(buffer) {
    return (buffer instanceof ArrayBuffer || (typeof SharedArrayBuffer !== "undefined" && buffer instanceof SharedArrayBuffer));
}
function ensureUint8Array(buffer) {
    if (buffer instanceof Uint8Array) {
        return buffer;
    }
    else if (ArrayBuffer.isView(buffer)) {
        return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    }
    else if (isArrayBufferLike(buffer)) {
        return new Uint8Array(buffer);
    }
    else {
        // ArrayLike<number>
        return Uint8Array.from(buffer);
    }
}

const DEFAULT_MAX_DEPTH = 100;
const DEFAULT_INITIAL_BUFFER_SIZE = 2048;
class Encoder {
    constructor(options) {
        this.entered = false;
        this.extensionCodec = options?.extensionCodec ?? ExtensionCodec.defaultCodec;
        this.context = options?.context; // needs a type assertion because EncoderOptions has no context property when ContextType is undefined
        this.useBigInt64 = options?.useBigInt64 ?? false;
        this.maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;
        this.initialBufferSize = options?.initialBufferSize ?? DEFAULT_INITIAL_BUFFER_SIZE;
        this.sortKeys = options?.sortKeys ?? false;
        this.forceFloat32 = options?.forceFloat32 ?? false;
        this.ignoreUndefined = options?.ignoreUndefined ?? false;
        this.forceIntegerToFloat = options?.forceIntegerToFloat ?? false;
        this.pos = 0;
        this.view = new DataView(new ArrayBuffer(this.initialBufferSize));
        this.bytes = new Uint8Array(this.view.buffer);
    }
    clone() {
        // Because of slightly special argument `context`,
        // type assertion is needed.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        return new Encoder({
            extensionCodec: this.extensionCodec,
            context: this.context,
            useBigInt64: this.useBigInt64,
            maxDepth: this.maxDepth,
            initialBufferSize: this.initialBufferSize,
            sortKeys: this.sortKeys,
            forceFloat32: this.forceFloat32,
            ignoreUndefined: this.ignoreUndefined,
            forceIntegerToFloat: this.forceIntegerToFloat,
        });
    }
    reinitializeState() {
        this.pos = 0;
    }
    /**
     * This is almost equivalent to {@link Encoder#encode}, but it returns an reference of the encoder's internal buffer and thus much faster than {@link Encoder#encode}.
     *
     * @returns Encodes the object and returns a shared reference the encoder's internal buffer.
     */
    encodeSharedRef(object) {
        if (this.entered) {
            const instance = this.clone();
            return instance.encodeSharedRef(object);
        }
        try {
            this.entered = true;
            this.reinitializeState();
            this.doEncode(object, 1);
            return this.bytes.subarray(0, this.pos);
        }
        finally {
            this.entered = false;
        }
    }
    /**
     * @returns Encodes the object and returns a copy of the encoder's internal buffer.
     */
    encode(object) {
        if (this.entered) {
            const instance = this.clone();
            return instance.encode(object);
        }
        try {
            this.entered = true;
            this.reinitializeState();
            this.doEncode(object, 1);
            return this.bytes.slice(0, this.pos);
        }
        finally {
            this.entered = false;
        }
    }
    doEncode(object, depth) {
        if (depth > this.maxDepth) {
            throw new Error(`Too deep objects in depth ${depth}`);
        }
        if (object == null) {
            this.encodeNil();
        }
        else if (typeof object === "boolean") {
            this.encodeBoolean(object);
        }
        else if (typeof object === "number") {
            if (!this.forceIntegerToFloat) {
                this.encodeNumber(object);
            }
            else {
                this.encodeNumberAsFloat(object);
            }
        }
        else if (typeof object === "string") {
            this.encodeString(object);
        }
        else if (this.useBigInt64 && typeof object === "bigint") {
            this.encodeBigInt64(object);
        }
        else {
            this.encodeObject(object, depth);
        }
    }
    ensureBufferSizeToWrite(sizeToWrite) {
        const requiredSize = this.pos + sizeToWrite;
        if (this.view.byteLength < requiredSize) {
            this.resizeBuffer(requiredSize * 2);
        }
    }
    resizeBuffer(newSize) {
        const newBuffer = new ArrayBuffer(newSize);
        const newBytes = new Uint8Array(newBuffer);
        const newView = new DataView(newBuffer);
        newBytes.set(this.bytes);
        this.view = newView;
        this.bytes = newBytes;
    }
    encodeNil() {
        this.writeU8(0xc0);
    }
    encodeBoolean(object) {
        if (object === false) {
            this.writeU8(0xc2);
        }
        else {
            this.writeU8(0xc3);
        }
    }
    encodeNumber(object) {
        if (!this.forceIntegerToFloat && Number.isSafeInteger(object)) {
            if (object >= 0) {
                if (object < 0x80) {
                    // positive fixint
                    this.writeU8(object);
                }
                else if (object < 0x100) {
                    // uint 8
                    this.writeU8(0xcc);
                    this.writeU8(object);
                }
                else if (object < 0x10000) {
                    // uint 16
                    this.writeU8(0xcd);
                    this.writeU16(object);
                }
                else if (object < 0x100000000) {
                    // uint 32
                    this.writeU8(0xce);
                    this.writeU32(object);
                }
                else if (!this.useBigInt64) {
                    // uint 64
                    this.writeU8(0xcf);
                    this.writeU64(object);
                }
                else {
                    this.encodeNumberAsFloat(object);
                }
            }
            else {
                if (object >= -32) {
                    // negative fixint
                    this.writeU8(0xe0 | (object + 0x20));
                }
                else if (object >= -128) {
                    // int 8
                    this.writeU8(0xd0);
                    this.writeI8(object);
                }
                else if (object >= -32768) {
                    // int 16
                    this.writeU8(0xd1);
                    this.writeI16(object);
                }
                else if (object >= -2147483648) {
                    // int 32
                    this.writeU8(0xd2);
                    this.writeI32(object);
                }
                else if (!this.useBigInt64) {
                    // int 64
                    this.writeU8(0xd3);
                    this.writeI64(object);
                }
                else {
                    this.encodeNumberAsFloat(object);
                }
            }
        }
        else {
            this.encodeNumberAsFloat(object);
        }
    }
    encodeNumberAsFloat(object) {
        if (this.forceFloat32) {
            // float 32
            this.writeU8(0xca);
            this.writeF32(object);
        }
        else {
            // float 64
            this.writeU8(0xcb);
            this.writeF64(object);
        }
    }
    encodeBigInt64(object) {
        if (object >= BigInt(0)) {
            // uint 64
            this.writeU8(0xcf);
            this.writeBigUint64(object);
        }
        else {
            // int 64
            this.writeU8(0xd3);
            this.writeBigInt64(object);
        }
    }
    writeStringHeader(byteLength) {
        if (byteLength < 32) {
            // fixstr
            this.writeU8(0xa0 + byteLength);
        }
        else if (byteLength < 0x100) {
            // str 8
            this.writeU8(0xd9);
            this.writeU8(byteLength);
        }
        else if (byteLength < 0x10000) {
            // str 16
            this.writeU8(0xda);
            this.writeU16(byteLength);
        }
        else if (byteLength < 0x100000000) {
            // str 32
            this.writeU8(0xdb);
            this.writeU32(byteLength);
        }
        else {
            throw new Error(`Too long string: ${byteLength} bytes in UTF-8`);
        }
    }
    encodeString(object) {
        const maxHeaderSize = 1 + 4;
        const byteLength = utf8Count(object);
        this.ensureBufferSizeToWrite(maxHeaderSize + byteLength);
        this.writeStringHeader(byteLength);
        utf8Encode(object, this.bytes, this.pos);
        this.pos += byteLength;
    }
    encodeObject(object, depth) {
        // try to encode objects with custom codec first of non-primitives
        const ext = this.extensionCodec.tryToEncode(object, this.context);
        if (ext != null) {
            this.encodeExtension(ext);
        }
        else if (Array.isArray(object)) {
            this.encodeArray(object, depth);
        }
        else if (ArrayBuffer.isView(object)) {
            this.encodeBinary(object);
        }
        else if (typeof object === "object") {
            this.encodeMap(object, depth);
        }
        else {
            // symbol, function and other special object come here unless extensionCodec handles them.
            throw new Error(`Unrecognized object: ${Object.prototype.toString.apply(object)}`);
        }
    }
    encodeBinary(object) {
        const size = object.byteLength;
        if (size < 0x100) {
            // bin 8
            this.writeU8(0xc4);
            this.writeU8(size);
        }
        else if (size < 0x10000) {
            // bin 16
            this.writeU8(0xc5);
            this.writeU16(size);
        }
        else if (size < 0x100000000) {
            // bin 32
            this.writeU8(0xc6);
            this.writeU32(size);
        }
        else {
            throw new Error(`Too large binary: ${size}`);
        }
        const bytes = ensureUint8Array(object);
        this.writeU8a(bytes);
    }
    encodeArray(object, depth) {
        const size = object.length;
        if (size < 16) {
            // fixarray
            this.writeU8(0x90 + size);
        }
        else if (size < 0x10000) {
            // array 16
            this.writeU8(0xdc);
            this.writeU16(size);
        }
        else if (size < 0x100000000) {
            // array 32
            this.writeU8(0xdd);
            this.writeU32(size);
        }
        else {
            throw new Error(`Too large array: ${size}`);
        }
        for (const item of object) {
            this.doEncode(item, depth + 1);
        }
    }
    countWithoutUndefined(object, keys) {
        let count = 0;
        for (const key of keys) {
            if (object[key] !== undefined) {
                count++;
            }
        }
        return count;
    }
    encodeMap(object, depth) {
        const keys = Object.keys(object);
        if (this.sortKeys) {
            keys.sort();
        }
        const size = this.ignoreUndefined ? this.countWithoutUndefined(object, keys) : keys.length;
        if (size < 16) {
            // fixmap
            this.writeU8(0x80 + size);
        }
        else if (size < 0x10000) {
            // map 16
            this.writeU8(0xde);
            this.writeU16(size);
        }
        else if (size < 0x100000000) {
            // map 32
            this.writeU8(0xdf);
            this.writeU32(size);
        }
        else {
            throw new Error(`Too large map object: ${size}`);
        }
        for (const key of keys) {
            const value = object[key];
            if (!(this.ignoreUndefined && value === undefined)) {
                this.encodeString(key);
                this.doEncode(value, depth + 1);
            }
        }
    }
    encodeExtension(ext) {
        if (typeof ext.data === "function") {
            const data = ext.data(this.pos + 6);
            const size = data.length;
            if (size >= 0x100000000) {
                throw new Error(`Too large extension object: ${size}`);
            }
            this.writeU8(0xc9);
            this.writeU32(size);
            this.writeI8(ext.type);
            this.writeU8a(data);
            return;
        }
        const size = ext.data.length;
        if (size === 1) {
            // fixext 1
            this.writeU8(0xd4);
        }
        else if (size === 2) {
            // fixext 2
            this.writeU8(0xd5);
        }
        else if (size === 4) {
            // fixext 4
            this.writeU8(0xd6);
        }
        else if (size === 8) {
            // fixext 8
            this.writeU8(0xd7);
        }
        else if (size === 16) {
            // fixext 16
            this.writeU8(0xd8);
        }
        else if (size < 0x100) {
            // ext 8
            this.writeU8(0xc7);
            this.writeU8(size);
        }
        else if (size < 0x10000) {
            // ext 16
            this.writeU8(0xc8);
            this.writeU16(size);
        }
        else if (size < 0x100000000) {
            // ext 32
            this.writeU8(0xc9);
            this.writeU32(size);
        }
        else {
            throw new Error(`Too large extension object: ${size}`);
        }
        this.writeI8(ext.type);
        this.writeU8a(ext.data);
    }
    writeU8(value) {
        this.ensureBufferSizeToWrite(1);
        this.view.setUint8(this.pos, value);
        this.pos++;
    }
    writeU8a(values) {
        const size = values.length;
        this.ensureBufferSizeToWrite(size);
        this.bytes.set(values, this.pos);
        this.pos += size;
    }
    writeI8(value) {
        this.ensureBufferSizeToWrite(1);
        this.view.setInt8(this.pos, value);
        this.pos++;
    }
    writeU16(value) {
        this.ensureBufferSizeToWrite(2);
        this.view.setUint16(this.pos, value);
        this.pos += 2;
    }
    writeI16(value) {
        this.ensureBufferSizeToWrite(2);
        this.view.setInt16(this.pos, value);
        this.pos += 2;
    }
    writeU32(value) {
        this.ensureBufferSizeToWrite(4);
        this.view.setUint32(this.pos, value);
        this.pos += 4;
    }
    writeI32(value) {
        this.ensureBufferSizeToWrite(4);
        this.view.setInt32(this.pos, value);
        this.pos += 4;
    }
    writeF32(value) {
        this.ensureBufferSizeToWrite(4);
        this.view.setFloat32(this.pos, value);
        this.pos += 4;
    }
    writeF64(value) {
        this.ensureBufferSizeToWrite(8);
        this.view.setFloat64(this.pos, value);
        this.pos += 8;
    }
    writeU64(value) {
        this.ensureBufferSizeToWrite(8);
        setUint64(this.view, this.pos, value);
        this.pos += 8;
    }
    writeI64(value) {
        this.ensureBufferSizeToWrite(8);
        setInt64(this.view, this.pos, value);
        this.pos += 8;
    }
    writeBigUint64(value) {
        this.ensureBufferSizeToWrite(8);
        this.view.setBigUint64(this.pos, value);
        this.pos += 8;
    }
    writeBigInt64(value) {
        this.ensureBufferSizeToWrite(8);
        this.view.setBigInt64(this.pos, value);
        this.pos += 8;
    }
}

/**
 * It encodes `value` in the MessagePack format and
 * returns a byte buffer.
 *
 * The returned buffer is a slice of a larger `ArrayBuffer`, so you have to use its `#byteOffset` and `#byteLength` in order to convert it to another typed arrays including NodeJS `Buffer`.
 */
function encode(value, options) {
    const encoder = new Encoder(options);
    return encoder.encodeSharedRef(value);
}

function prettyByte(byte) {
    return `${byte < 0 ? "-" : ""}0x${Math.abs(byte).toString(16).padStart(2, "0")}`;
}

const DEFAULT_MAX_KEY_LENGTH = 16;
const DEFAULT_MAX_LENGTH_PER_KEY = 16;
class CachedKeyDecoder {
    constructor(maxKeyLength = DEFAULT_MAX_KEY_LENGTH, maxLengthPerKey = DEFAULT_MAX_LENGTH_PER_KEY) {
        this.hit = 0;
        this.miss = 0;
        this.maxKeyLength = maxKeyLength;
        this.maxLengthPerKey = maxLengthPerKey;
        // avoid `new Array(N)`, which makes a sparse array,
        // because a sparse array is typically slower than a non-sparse array.
        this.caches = [];
        for (let i = 0; i < this.maxKeyLength; i++) {
            this.caches.push([]);
        }
    }
    canBeCached(byteLength) {
        return byteLength > 0 && byteLength <= this.maxKeyLength;
    }
    find(bytes, inputOffset, byteLength) {
        const records = this.caches[byteLength - 1];
        FIND_CHUNK: for (const record of records) {
            const recordBytes = record.bytes;
            for (let j = 0; j < byteLength; j++) {
                if (recordBytes[j] !== bytes[inputOffset + j]) {
                    continue FIND_CHUNK;
                }
            }
            return record.str;
        }
        return null;
    }
    store(bytes, value) {
        const records = this.caches[bytes.length - 1];
        const record = { bytes, str: value };
        if (records.length >= this.maxLengthPerKey) {
            // `records` are full!
            // Set `record` to an arbitrary position.
            records[(Math.random() * records.length) | 0] = record;
        }
        else {
            records.push(record);
        }
    }
    decode(bytes, inputOffset, byteLength) {
        const cachedValue = this.find(bytes, inputOffset, byteLength);
        if (cachedValue != null) {
            this.hit++;
            return cachedValue;
        }
        this.miss++;
        const str = utf8DecodeJs(bytes, inputOffset, byteLength);
        // Ensure to copy a slice of bytes because the bytes may be a NodeJS Buffer and Buffer#slice() returns a reference to its internal ArrayBuffer.
        const slicedCopyOfBytes = Uint8Array.prototype.slice.call(bytes, inputOffset, inputOffset + byteLength);
        this.store(slicedCopyOfBytes, str);
        return str;
    }
}

const STATE_ARRAY = "array";
const STATE_MAP_KEY = "map_key";
const STATE_MAP_VALUE = "map_value";
const mapKeyConverter = (key) => {
    if (typeof key === "string" || typeof key === "number") {
        return key;
    }
    throw new DecodeError("The type of key must be string or number but " + typeof key);
};
class StackPool {
    constructor() {
        this.stack = [];
        this.stackHeadPosition = -1;
    }
    get length() {
        return this.stackHeadPosition + 1;
    }
    top() {
        return this.stack[this.stackHeadPosition];
    }
    pushArrayState(size) {
        const state = this.getUninitializedStateFromPool();
        state.type = STATE_ARRAY;
        state.position = 0;
        state.size = size;
        state.array = new Array(size);
    }
    pushMapState(size) {
        const state = this.getUninitializedStateFromPool();
        state.type = STATE_MAP_KEY;
        state.readCount = 0;
        state.size = size;
        state.map = {};
    }
    getUninitializedStateFromPool() {
        this.stackHeadPosition++;
        if (this.stackHeadPosition === this.stack.length) {
            const partialState = {
                type: undefined,
                size: 0,
                array: undefined,
                position: 0,
                readCount: 0,
                map: undefined,
                key: null,
            };
            this.stack.push(partialState);
        }
        return this.stack[this.stackHeadPosition];
    }
    release(state) {
        const topStackState = this.stack[this.stackHeadPosition];
        if (topStackState !== state) {
            throw new Error("Invalid stack state. Released state is not on top of the stack.");
        }
        if (state.type === STATE_ARRAY) {
            const partialState = state;
            partialState.size = 0;
            partialState.array = undefined;
            partialState.position = 0;
            partialState.type = undefined;
        }
        if (state.type === STATE_MAP_KEY || state.type === STATE_MAP_VALUE) {
            const partialState = state;
            partialState.size = 0;
            partialState.map = undefined;
            partialState.readCount = 0;
            partialState.type = undefined;
        }
        this.stackHeadPosition--;
    }
    reset() {
        this.stack.length = 0;
        this.stackHeadPosition = -1;
    }
}
const HEAD_BYTE_REQUIRED = -1;
const EMPTY_VIEW = new DataView(new ArrayBuffer(0));
const EMPTY_BYTES = new Uint8Array(EMPTY_VIEW.buffer);
try {
    // IE11: The spec says it should throw RangeError,
    // IE11: but in IE11 it throws TypeError.
    EMPTY_VIEW.getInt8(0);
}
catch (e) {
    if (!(e instanceof RangeError)) {
        throw new Error("This module is not supported in the current JavaScript engine because DataView does not throw RangeError on out-of-bounds access");
    }
}
const MORE_DATA = new RangeError("Insufficient data");
const sharedCachedKeyDecoder = new CachedKeyDecoder();
class Decoder {
    constructor(options) {
        this.totalPos = 0;
        this.pos = 0;
        this.view = EMPTY_VIEW;
        this.bytes = EMPTY_BYTES;
        this.headByte = HEAD_BYTE_REQUIRED;
        this.stack = new StackPool();
        this.entered = false;
        this.extensionCodec = options?.extensionCodec ?? ExtensionCodec.defaultCodec;
        this.context = options?.context; // needs a type assertion because EncoderOptions has no context property when ContextType is undefined
        this.useBigInt64 = options?.useBigInt64 ?? false;
        this.rawStrings = options?.rawStrings ?? false;
        this.maxStrLength = options?.maxStrLength ?? UINT32_MAX;
        this.maxBinLength = options?.maxBinLength ?? UINT32_MAX;
        this.maxArrayLength = options?.maxArrayLength ?? UINT32_MAX;
        this.maxMapLength = options?.maxMapLength ?? UINT32_MAX;
        this.maxExtLength = options?.maxExtLength ?? UINT32_MAX;
        this.keyDecoder = options?.keyDecoder !== undefined ? options.keyDecoder : sharedCachedKeyDecoder;
        this.mapKeyConverter = options?.mapKeyConverter ?? mapKeyConverter;
    }
    clone() {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        return new Decoder({
            extensionCodec: this.extensionCodec,
            context: this.context,
            useBigInt64: this.useBigInt64,
            rawStrings: this.rawStrings,
            maxStrLength: this.maxStrLength,
            maxBinLength: this.maxBinLength,
            maxArrayLength: this.maxArrayLength,
            maxMapLength: this.maxMapLength,
            maxExtLength: this.maxExtLength,
            keyDecoder: this.keyDecoder,
        });
    }
    reinitializeState() {
        this.totalPos = 0;
        this.headByte = HEAD_BYTE_REQUIRED;
        this.stack.reset();
        // view, bytes, and pos will be re-initialized in setBuffer()
    }
    setBuffer(buffer) {
        const bytes = ensureUint8Array(buffer);
        this.bytes = bytes;
        this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        this.pos = 0;
    }
    appendBuffer(buffer) {
        if (this.headByte === HEAD_BYTE_REQUIRED && !this.hasRemaining(1)) {
            this.setBuffer(buffer);
        }
        else {
            const remainingData = this.bytes.subarray(this.pos);
            const newData = ensureUint8Array(buffer);
            // concat remainingData + newData
            const newBuffer = new Uint8Array(remainingData.length + newData.length);
            newBuffer.set(remainingData);
            newBuffer.set(newData, remainingData.length);
            this.setBuffer(newBuffer);
        }
    }
    hasRemaining(size) {
        return this.view.byteLength - this.pos >= size;
    }
    createExtraByteError(posToShow) {
        const { view, pos } = this;
        return new RangeError(`Extra ${view.byteLength - pos} of ${view.byteLength} byte(s) found at buffer[${posToShow}]`);
    }
    /**
     * @throws {@link DecodeError}
     * @throws {@link RangeError}
     */
    decode(buffer) {
        if (this.entered) {
            const instance = this.clone();
            return instance.decode(buffer);
        }
        try {
            this.entered = true;
            this.reinitializeState();
            this.setBuffer(buffer);
            const object = this.doDecodeSync();
            if (this.hasRemaining(1)) {
                throw this.createExtraByteError(this.pos);
            }
            return object;
        }
        finally {
            this.entered = false;
        }
    }
    *decodeMulti(buffer) {
        if (this.entered) {
            const instance = this.clone();
            yield* instance.decodeMulti(buffer);
            return;
        }
        try {
            this.entered = true;
            this.reinitializeState();
            this.setBuffer(buffer);
            while (this.hasRemaining(1)) {
                yield this.doDecodeSync();
            }
        }
        finally {
            this.entered = false;
        }
    }
    async decodeAsync(stream) {
        if (this.entered) {
            const instance = this.clone();
            return instance.decodeAsync(stream);
        }
        try {
            this.entered = true;
            let decoded = false;
            let object;
            for await (const buffer of stream) {
                if (decoded) {
                    this.entered = false;
                    throw this.createExtraByteError(this.totalPos);
                }
                this.appendBuffer(buffer);
                try {
                    object = this.doDecodeSync();
                    decoded = true;
                }
                catch (e) {
                    if (!(e instanceof RangeError)) {
                        throw e; // rethrow
                    }
                    // fallthrough
                }
                this.totalPos += this.pos;
            }
            if (decoded) {
                if (this.hasRemaining(1)) {
                    throw this.createExtraByteError(this.totalPos);
                }
                return object;
            }
            const { headByte, pos, totalPos } = this;
            throw new RangeError(`Insufficient data in parsing ${prettyByte(headByte)} at ${totalPos} (${pos} in the current buffer)`);
        }
        finally {
            this.entered = false;
        }
    }
    decodeArrayStream(stream) {
        return this.decodeMultiAsync(stream, true);
    }
    decodeStream(stream) {
        return this.decodeMultiAsync(stream, false);
    }
    async *decodeMultiAsync(stream, isArray) {
        if (this.entered) {
            const instance = this.clone();
            yield* instance.decodeMultiAsync(stream, isArray);
            return;
        }
        try {
            this.entered = true;
            let isArrayHeaderRequired = isArray;
            let arrayItemsLeft = -1;
            for await (const buffer of stream) {
                if (isArray && arrayItemsLeft === 0) {
                    throw this.createExtraByteError(this.totalPos);
                }
                this.appendBuffer(buffer);
                if (isArrayHeaderRequired) {
                    arrayItemsLeft = this.readArraySize();
                    isArrayHeaderRequired = false;
                    this.complete();
                }
                try {
                    while (true) {
                        yield this.doDecodeSync();
                        if (--arrayItemsLeft === 0) {
                            break;
                        }
                    }
                }
                catch (e) {
                    if (!(e instanceof RangeError)) {
                        throw e; // rethrow
                    }
                    // fallthrough
                }
                this.totalPos += this.pos;
            }
        }
        finally {
            this.entered = false;
        }
    }
    doDecodeSync() {
        DECODE: while (true) {
            const headByte = this.readHeadByte();
            let object;
            if (headByte >= 0xe0) {
                // negative fixint (111x xxxx) 0xe0 - 0xff
                object = headByte - 0x100;
            }
            else if (headByte < 0xc0) {
                if (headByte < 0x80) {
                    // positive fixint (0xxx xxxx) 0x00 - 0x7f
                    object = headByte;
                }
                else if (headByte < 0x90) {
                    // fixmap (1000 xxxx) 0x80 - 0x8f
                    const size = headByte - 0x80;
                    if (size !== 0) {
                        this.pushMapState(size);
                        this.complete();
                        continue DECODE;
                    }
                    else {
                        object = {};
                    }
                }
                else if (headByte < 0xa0) {
                    // fixarray (1001 xxxx) 0x90 - 0x9f
                    const size = headByte - 0x90;
                    if (size !== 0) {
                        this.pushArrayState(size);
                        this.complete();
                        continue DECODE;
                    }
                    else {
                        object = [];
                    }
                }
                else {
                    // fixstr (101x xxxx) 0xa0 - 0xbf
                    const byteLength = headByte - 0xa0;
                    object = this.decodeString(byteLength, 0);
                }
            }
            else if (headByte === 0xc0) {
                // nil
                object = null;
            }
            else if (headByte === 0xc2) {
                // false
                object = false;
            }
            else if (headByte === 0xc3) {
                // true
                object = true;
            }
            else if (headByte === 0xca) {
                // float 32
                object = this.readF32();
            }
            else if (headByte === 0xcb) {
                // float 64
                object = this.readF64();
            }
            else if (headByte === 0xcc) {
                // uint 8
                object = this.readU8();
            }
            else if (headByte === 0xcd) {
                // uint 16
                object = this.readU16();
            }
            else if (headByte === 0xce) {
                // uint 32
                object = this.readU32();
            }
            else if (headByte === 0xcf) {
                // uint 64
                if (this.useBigInt64) {
                    object = this.readU64AsBigInt();
                }
                else {
                    object = this.readU64();
                }
            }
            else if (headByte === 0xd0) {
                // int 8
                object = this.readI8();
            }
            else if (headByte === 0xd1) {
                // int 16
                object = this.readI16();
            }
            else if (headByte === 0xd2) {
                // int 32
                object = this.readI32();
            }
            else if (headByte === 0xd3) {
                // int 64
                if (this.useBigInt64) {
                    object = this.readI64AsBigInt();
                }
                else {
                    object = this.readI64();
                }
            }
            else if (headByte === 0xd9) {
                // str 8
                const byteLength = this.lookU8();
                object = this.decodeString(byteLength, 1);
            }
            else if (headByte === 0xda) {
                // str 16
                const byteLength = this.lookU16();
                object = this.decodeString(byteLength, 2);
            }
            else if (headByte === 0xdb) {
                // str 32
                const byteLength = this.lookU32();
                object = this.decodeString(byteLength, 4);
            }
            else if (headByte === 0xdc) {
                // array 16
                const size = this.readU16();
                if (size !== 0) {
                    this.pushArrayState(size);
                    this.complete();
                    continue DECODE;
                }
                else {
                    object = [];
                }
            }
            else if (headByte === 0xdd) {
                // array 32
                const size = this.readU32();
                if (size !== 0) {
                    this.pushArrayState(size);
                    this.complete();
                    continue DECODE;
                }
                else {
                    object = [];
                }
            }
            else if (headByte === 0xde) {
                // map 16
                const size = this.readU16();
                if (size !== 0) {
                    this.pushMapState(size);
                    this.complete();
                    continue DECODE;
                }
                else {
                    object = {};
                }
            }
            else if (headByte === 0xdf) {
                // map 32
                const size = this.readU32();
                if (size !== 0) {
                    this.pushMapState(size);
                    this.complete();
                    continue DECODE;
                }
                else {
                    object = {};
                }
            }
            else if (headByte === 0xc4) {
                // bin 8
                const size = this.lookU8();
                object = this.decodeBinary(size, 1);
            }
            else if (headByte === 0xc5) {
                // bin 16
                const size = this.lookU16();
                object = this.decodeBinary(size, 2);
            }
            else if (headByte === 0xc6) {
                // bin 32
                const size = this.lookU32();
                object = this.decodeBinary(size, 4);
            }
            else if (headByte === 0xd4) {
                // fixext 1
                object = this.decodeExtension(1, 0);
            }
            else if (headByte === 0xd5) {
                // fixext 2
                object = this.decodeExtension(2, 0);
            }
            else if (headByte === 0xd6) {
                // fixext 4
                object = this.decodeExtension(4, 0);
            }
            else if (headByte === 0xd7) {
                // fixext 8
                object = this.decodeExtension(8, 0);
            }
            else if (headByte === 0xd8) {
                // fixext 16
                object = this.decodeExtension(16, 0);
            }
            else if (headByte === 0xc7) {
                // ext 8
                const size = this.lookU8();
                object = this.decodeExtension(size, 1);
            }
            else if (headByte === 0xc8) {
                // ext 16
                const size = this.lookU16();
                object = this.decodeExtension(size, 2);
            }
            else if (headByte === 0xc9) {
                // ext 32
                const size = this.lookU32();
                object = this.decodeExtension(size, 4);
            }
            else {
                throw new DecodeError(`Unrecognized type byte: ${prettyByte(headByte)}`);
            }
            this.complete();
            const stack = this.stack;
            while (stack.length > 0) {
                // arrays and maps
                const state = stack.top();
                if (state.type === STATE_ARRAY) {
                    state.array[state.position] = object;
                    state.position++;
                    if (state.position === state.size) {
                        object = state.array;
                        stack.release(state);
                    }
                    else {
                        continue DECODE;
                    }
                }
                else if (state.type === STATE_MAP_KEY) {
                    if (object === "__proto__") {
                        throw new DecodeError("The key __proto__ is not allowed");
                    }
                    state.key = this.mapKeyConverter(object);
                    state.type = STATE_MAP_VALUE;
                    continue DECODE;
                }
                else {
                    // it must be `state.type === State.MAP_VALUE` here
                    state.map[state.key] = object;
                    state.readCount++;
                    if (state.readCount === state.size) {
                        object = state.map;
                        stack.release(state);
                    }
                    else {
                        state.key = null;
                        state.type = STATE_MAP_KEY;
                        continue DECODE;
                    }
                }
            }
            return object;
        }
    }
    readHeadByte() {
        if (this.headByte === HEAD_BYTE_REQUIRED) {
            this.headByte = this.readU8();
            // console.log("headByte", prettyByte(this.headByte));
        }
        return this.headByte;
    }
    complete() {
        this.headByte = HEAD_BYTE_REQUIRED;
    }
    readArraySize() {
        const headByte = this.readHeadByte();
        switch (headByte) {
            case 0xdc:
                return this.readU16();
            case 0xdd:
                return this.readU32();
            default: {
                if (headByte < 0xa0) {
                    return headByte - 0x90;
                }
                else {
                    throw new DecodeError(`Unrecognized array type byte: ${prettyByte(headByte)}`);
                }
            }
        }
    }
    pushMapState(size) {
        if (size > this.maxMapLength) {
            throw new DecodeError(`Max length exceeded: map length (${size}) > maxMapLengthLength (${this.maxMapLength})`);
        }
        this.stack.pushMapState(size);
    }
    pushArrayState(size) {
        if (size > this.maxArrayLength) {
            throw new DecodeError(`Max length exceeded: array length (${size}) > maxArrayLength (${this.maxArrayLength})`);
        }
        this.stack.pushArrayState(size);
    }
    decodeString(byteLength, headerOffset) {
        if (!this.rawStrings || this.stateIsMapKey()) {
            return this.decodeUtf8String(byteLength, headerOffset);
        }
        return this.decodeBinary(byteLength, headerOffset);
    }
    /**
     * @throws {@link RangeError}
     */
    decodeUtf8String(byteLength, headerOffset) {
        if (byteLength > this.maxStrLength) {
            throw new DecodeError(`Max length exceeded: UTF-8 byte length (${byteLength}) > maxStrLength (${this.maxStrLength})`);
        }
        if (this.bytes.byteLength < this.pos + headerOffset + byteLength) {
            throw MORE_DATA;
        }
        const offset = this.pos + headerOffset;
        let object;
        if (this.stateIsMapKey() && this.keyDecoder?.canBeCached(byteLength)) {
            object = this.keyDecoder.decode(this.bytes, offset, byteLength);
        }
        else {
            object = utf8Decode(this.bytes, offset, byteLength);
        }
        this.pos += headerOffset + byteLength;
        return object;
    }
    stateIsMapKey() {
        if (this.stack.length > 0) {
            const state = this.stack.top();
            return state.type === STATE_MAP_KEY;
        }
        return false;
    }
    /**
     * @throws {@link RangeError}
     */
    decodeBinary(byteLength, headOffset) {
        if (byteLength > this.maxBinLength) {
            throw new DecodeError(`Max length exceeded: bin length (${byteLength}) > maxBinLength (${this.maxBinLength})`);
        }
        if (!this.hasRemaining(byteLength + headOffset)) {
            throw MORE_DATA;
        }
        const offset = this.pos + headOffset;
        const object = this.bytes.subarray(offset, offset + byteLength);
        this.pos += headOffset + byteLength;
        return object;
    }
    decodeExtension(size, headOffset) {
        if (size > this.maxExtLength) {
            throw new DecodeError(`Max length exceeded: ext length (${size}) > maxExtLength (${this.maxExtLength})`);
        }
        const extType = this.view.getInt8(this.pos + headOffset);
        const data = this.decodeBinary(size, headOffset + 1 /* extType */);
        return this.extensionCodec.decode(data, extType, this.context);
    }
    lookU8() {
        return this.view.getUint8(this.pos);
    }
    lookU16() {
        return this.view.getUint16(this.pos);
    }
    lookU32() {
        return this.view.getUint32(this.pos);
    }
    readU8() {
        const value = this.view.getUint8(this.pos);
        this.pos++;
        return value;
    }
    readI8() {
        const value = this.view.getInt8(this.pos);
        this.pos++;
        return value;
    }
    readU16() {
        const value = this.view.getUint16(this.pos);
        this.pos += 2;
        return value;
    }
    readI16() {
        const value = this.view.getInt16(this.pos);
        this.pos += 2;
        return value;
    }
    readU32() {
        const value = this.view.getUint32(this.pos);
        this.pos += 4;
        return value;
    }
    readI32() {
        const value = this.view.getInt32(this.pos);
        this.pos += 4;
        return value;
    }
    readU64() {
        const value = getUint64(this.view, this.pos);
        this.pos += 8;
        return value;
    }
    readI64() {
        const value = getInt64(this.view, this.pos);
        this.pos += 8;
        return value;
    }
    readU64AsBigInt() {
        const value = this.view.getBigUint64(this.pos);
        this.pos += 8;
        return value;
    }
    readI64AsBigInt() {
        const value = this.view.getBigInt64(this.pos);
        this.pos += 8;
        return value;
    }
    readF32() {
        const value = this.view.getFloat32(this.pos);
        this.pos += 4;
        return value;
    }
    readF64() {
        const value = this.view.getFloat64(this.pos);
        this.pos += 8;
        return value;
    }
}

/**
 * It decodes a single MessagePack object in a buffer.
 *
 * This is a synchronous decoding function.
 * See other variants for asynchronous decoding: {@link decodeAsync}, {@link decodeMultiStream}, or {@link decodeArrayStream}.
 *
 * @throws {@link RangeError} if the buffer is incomplete, including the case where the buffer is empty.
 * @throws {@link DecodeError} if the buffer contains invalid data.
 */
function decode(buffer, options) {
    const decoder = new Decoder(options);
    return decoder.decode(buffer);
}

/**
 * Structured errors — every failure carries enough context to act on.
 *
 * The platform's debugging history shows that silent or generic failures
 * ("Correlation timed out") cost days; these errors exist so the SDK can
 * tell users WHAT failed and WHERE, at the call site that caused it.
 */
/** A payload could not be msgpack-encoded (e.g. class instances, cycles). */
class NoLagEncodeError extends Error {
    constructor(op, topic, cause) {
        const causeMsg = cause instanceof Error ? cause.message : String(cause);
        super(`Cannot encode payload for ${op}${topic ? ` to '${topic}'` : ""}: ${causeMsg}. ` +
            `Payloads must be plain msgpack-serializable data (no class instances, ` +
            `Promises, functions, or circular references).`);
        this.name = "NoLagEncodeError";
        this.op = op;
        this.topic = topic;
    }
}
/** A structured error frame sent by the broker. */
class NoLagServerError extends Error {
    constructor(frame) {
        super(`${frame.error}${frame.code ? ` (${frame.code})` : ""}` +
            `${frame.topic ? ` on '${frame.topic}'` : ""}` +
            `${frame.hint ? ` — ${frame.hint}` : ""}`);
        this.name = "NoLagServerError";
        this.code = frame.code;
        this.error = frame.error;
        this.topic = frame.topic;
        this.hint = frame.hint;
        this.msgRef = frame.msgRef;
    }
}

// WebSocket ready states (same for browser and ws package)
const WS_READY_STATE = {
    OPEN: 1};

/**
 * Platform adapters.
 *
 * The core client has no opinion about how a host reports app lifecycle or
 * network reachability. Browsers expose `document.visibilitychange` and
 * `window.online`/`offline`; React Native exposes `AppState` and NetInfo;
 * Node exposes neither. Rather than sniff the environment, the client takes
 * these as injectable adapters and falls back to the DOM implementations when
 * they are available.
 */
/**
 * Lifecycle adapter backed by the Page Visibility API.
 * Returns null where there is no `document` (Node, React Native), leaving the
 * client without a lifecycle signal unless one is injected.
 */
function createDocumentLifecycleAdapter() {
    if (typeof document === "undefined" ||
        typeof document.addEventListener !== "function") {
        return null;
    }
    return {
        onStateChange(handler) {
            const listener = () => {
                handler(document.visibilityState === "hidden" ? "background" : "active");
            };
            document.addEventListener("visibilitychange", listener);
            return () => document.removeEventListener("visibilitychange", listener);
        },
    };
}
/**
 * Network adapter backed by the browser's online/offline events.
 * Returns null where there is no `window` (Node, React Native).
 *
 * Note these events only report whether the machine has *a* network, not
 * whether it can actually reach anything. They are a useful hint for dropping
 * reconnect backoff early, not a guarantee.
 */
function createWindowNetworkAdapter() {
    if (typeof window === "undefined" ||
        typeof window.addEventListener !== "function") {
        return null;
    }
    return {
        onReachabilityChange(handler) {
            const onOnline = () => handler(true);
            const onOffline = () => handler(false);
            window.addEventListener("online", onOnline);
            window.addEventListener("offline", onOffline);
            return () => {
                window.removeEventListener("online", onOnline);
                window.removeEventListener("offline", onOffline);
            };
        },
    };
}

/**
 * Self-contained base64url and UTF-8 decoding.
 *
 * The JWT path deliberately avoids `atob`, `Buffer` and `TextDecoder`: none of
 * the three is guaranteed on React Native/Hermes, and depending on them would
 * turn a missing global into a runtime token failure on mobile.
 */
const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
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
function symbolAt(input, index) {
    const code = input.charCodeAt(index);
    return code < 128 ? BASE64_LOOKUP[code] : -1;
}
/**
 * Decode base64 or base64url into bytes. Padding is optional and any
 * non-symbol character is skipped.
 */
function base64UrlToBytes(input) {
    let symbolCount = 0;
    for (let i = 0; i < input.length; i++) {
        if (symbolAt(input, i) >= 0)
            symbolCount++;
    }
    // Each group of 4 symbols carries 3 bytes; a trailing group of 2 or 3
    // symbols carries 1 or 2 bytes.
    const bytes = new Uint8Array(Math.floor((symbolCount * 3) / 4));
    let acc = 0;
    let accBits = 0;
    let out = 0;
    for (let i = 0; i < input.length; i++) {
        const value = symbolAt(input, i);
        if (value < 0)
            continue;
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
function utf8BytesToString(bytes) {
    const length = bytes.length;
    const units = [];
    let result = "";
    let i = 0;
    while (i < length) {
        const byte1 = bytes[i++];
        let codePoint;
        if (byte1 < 0x80) {
            codePoint = byte1;
        }
        else if ((byte1 & 0xe0) === 0xc0) {
            codePoint = ((byte1 & 0x1f) << 6) | (bytes[i++] & 0x3f);
        }
        else if ((byte1 & 0xf0) === 0xe0) {
            codePoint =
                ((byte1 & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
        }
        else if ((byte1 & 0xf8) === 0xf0) {
            codePoint =
                ((byte1 & 0x07) << 18) |
                    ((bytes[i++] & 0x3f) << 12) |
                    ((bytes[i++] & 0x3f) << 6) |
                    (bytes[i++] & 0x3f);
        }
        else {
            codePoint = 0xfffd;
        }
        if (codePoint > 0xffff) {
            // Outside the BMP: emit a surrogate pair.
            const offset = codePoint - 0x10000;
            units.push(0xd800 | (offset >> 10), 0xdc00 | (offset & 0x3ff));
        }
        else {
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
function base64UrlToString(input) {
    return utf8BytesToString(base64UrlToBytes(input));
}

/**
 * NoLag Client
 * WebSocket client for Kraken Proxy with automatic reconnection
 *
 * Subscriptions are persisted server-side - no local tracking needed.
 * On reconnect, the server automatically restores all subscriptions.
 */
const DEFAULT_URL = "wss://broker.nolag.app/ws";
/** Protocol v2: loud failures (42940 unknown_topic), published acks, auto-provisioned rooms */
const PROTOCOL_VERSION = 2;
const PENDING_OP_TIMEOUT_MS = 10000;
const DEFAULT_RECONNECT_INTERVAL = 5000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 10;
const DEFAULT_HEARTBEAT_INTERVAL = 30000;
const REAUTH_TIMEOUT_MS = 10000;
/**
 * NoLag Client
 *
 * A Socket.IO-style API for real-time messaging via Kraken Proxy.
 *
 * Subscriptions are automatically restored on reconnect by the server.
 *
 * @example
 * ```typescript
 * // Simple connection
 * const client = new NoLag('your_access_token');
 * await client.connect();
 *
 * // Fluent API (recommended)
 * const room = client.setApp('chat').setRoom('general');
 * room.subscribe('messages');
 * room.on('messages', (data) => console.log(data));
 * room.emit('messages', { text: 'Hello!' });
 *
 * // Direct API (full topic paths)
 * client.subscribe('chat/general/messages');
 * client.on('chat/general/messages', (data) => console.log(data));
 * client.emit('chat/general/messages', { text: 'Hello!' });
 *
 * // Worker with load balancing
 * const worker = new NoLag('worker_token', {
 *   loadBalance: true,
 *   loadBalanceGroup: 'worker-pool-1'
 * });
 * ```
 */
let NoLag$1 = class NoLag {
    constructor(createWebSocket, token, options) {
        this._ws = null;
        this._status = "disconnected";
        this._reconnectAttempts = 0;
        this._reconnectTimer = null;
        this._heartbeatTimer = null;
        this._isReconnecting = false; // True when reconnecting after disconnect, false on fresh connect
        this._tokenRefreshTimer = null;
        this._pendingTokenRefresh = false; // True while a proactive refresh close/reconnect is in flight
        // Actor info (populated after auth)
        this._actorTokenId = null;
        this._projectId = null;
        this._actorType = null;
        this._protocolVersion = 1;
        // Pending operation tracking: real acks instead of optimistic cb(null)
        this._pendingSubscribes = new Map();
        this._pendingPublishes = new Map();
        this._msgRefCounter = 0;
        // Presence
        this._presence = null;
        this._presenceMap = new Map();
        // Replay state
        this._isReplaying = false;
        this._replayInfo = null;
        // ACK batching
        this._pendingAcks = [];
        this._ackTimer = null;
        this._ackBatchInterval = 0; // ms (default: immediate ACKs)
        // Topic filters tracking (topic -> mixed filter array with OR strings and AND groups)
        this._topicFilters = new Map();
        this._lifecycleUnsub = null;
        this._networkUnsub = null;
        // Event handlers (local - for routing messages to callbacks)
        this._eventHandlers = new Map();
        this._createWebSocket = createWebSocket;
        this._tokenOrProvider = token;
        this._options = {
            // Last-resolved token; provider results land here on each connect
            token: typeof token === "string" ? token : "",
            url: options?.url ?? DEFAULT_URL,
            actorTokenId: options?.actorTokenId,
            reconnect: options?.reconnect ?? true,
            reconnectInterval: options?.reconnectInterval ?? DEFAULT_RECONNECT_INTERVAL,
            maxReconnectAttempts: DEFAULT_MAX_RECONNECT_ATTEMPTS,
            disconnectOnHidden: options?.disconnectOnHidden ?? false,
            debug: options?.debug ?? false,
            qos: options?.qos ?? 1,
            loadBalance: options?.loadBalance ?? false,
            loadBalanceGroup: options?.loadBalanceGroup,
            heartbeatInterval: options?.heartbeatInterval ?? DEFAULT_HEARTBEAT_INTERVAL,
            projectId: options?.projectId,
            clientId: options?.clientId,
        };
        this._ackBatchInterval = options?.ackBatchInterval ?? 0;
        this._reconnectConfigured = this._options.reconnect;
        this._setupLifecycleAdapter(options?.lifecycle);
        this._setupNetworkAdapter(options?.network);
    }
    // ============ Platform Adapters ============
    /**
     * Wire app foreground/background transitions.
     *
     * Two things hang off this. `disconnectOnHidden` drops the socket while
     * backgrounded, and every resume rechecks token freshness: JS timers are
     * throttled or skipped outright while an app is suspended, so the scheduled
     * refresh may never have fired and the held token can already be expired.
     *
     * Pass `lifecycle: null` to opt out entirely.
     */
    _setupLifecycleAdapter(injected) {
        const adapter = injected === null ? null : injected ?? createDocumentLifecycleAdapter();
        if (!adapter)
            return;
        this._lifecycleUnsub = adapter.onStateChange((state) => {
            if (state === "background") {
                if (this._options.disconnectOnHidden) {
                    this._log("App backgrounded, disconnecting");
                    this.disconnect();
                }
                return;
            }
            this._log("App foregrounded");
            if (this._status === "connected") {
                // Survived the background: the refresh timer is the unreliable part.
                void this._revalidateToken();
                return;
            }
            if (this._options.disconnectOnHidden && this._status === "disconnected") {
                // disconnect() cleared the runtime reconnect flag; restore the
                // caller's configured value before resuming.
                this._options.reconnect = this._reconnectConfigured;
                this.connect().catch((err) => {
                    this._log("Reconnect on foreground failed:", err);
                });
            }
        });
    }
    /**
     * Wire network reachability.
     *
     * Reconnect backoff grows to 30s, which is the wrong behaviour on a device
     * that just moved from a dead cell to wifi. A reachability signal collapses
     * the backoff and retries immediately.
     *
     * Pass `network: null` to opt out entirely.
     */
    _setupNetworkAdapter(injected) {
        const adapter = injected === null ? null : injected ?? createWindowNetworkAdapter();
        if (!adapter)
            return;
        this._networkUnsub = adapter.onReachabilityChange((reachable) => {
            if (!reachable) {
                this._log("Network unreachable");
                return;
            }
            if (!this._options.reconnect)
                return;
            if (this._status === "connected" || this._status === "connecting")
                return;
            this._log("Network reachable, retrying now");
            if (this._reconnectTimer) {
                clearTimeout(this._reconnectTimer);
                this._reconnectTimer = null;
            }
            this._reconnectAttempts = 0;
            this._isReconnecting = true;
            this._status = "reconnecting";
            this.connect().catch((err) => {
                this._log("Reconnect on network recovery failed:", err);
            });
        });
    }
    /**
     * Re-evaluate the held client token after a period where timers may not have
     * run. Refreshes immediately if it is expired or close to it, otherwise
     * re-arms the scheduled refresh.
     */
    async _revalidateToken() {
        if (typeof this._tokenOrProvider !== "function")
            return;
        const exp = this._decodeJwtExp(this._options.token);
        if (exp === null)
            return;
        if (exp * 1000 - Date.now() <= 30000) {
            this._log("Token expired or expiring while backgrounded, refreshing now");
            await this._refreshToken();
        }
        else {
            this._scheduleTokenRefresh();
        }
    }
    /**
     * Release everything this client owns: the socket, its timers, and the
     * lifecycle/network subscriptions.
     *
     * `disconnect()` deliberately leaves the adapter subscriptions in place so a
     * backgrounded client can come back. Call `destroy()` when the client itself
     * is going away (React unmount, for instance) to avoid leaking listeners.
     * Registered event handlers are left alone.
     */
    destroy() {
        this.disconnect();
        this._lifecycleUnsub?.();
        this._lifecycleUnsub = null;
        this._networkUnsub?.();
        this._networkUnsub = null;
    }
    // ============ Public Properties ============
    get status() {
        return this._status;
    }
    get connected() {
        return this._status === "connected";
    }
    get actorId() {
        return this._actorTokenId;
    }
    get actorType() {
        return this._actorType;
    }
    /** Whether we're currently replaying missed messages */
    get isReplayingMessages() {
        return this._isReplaying;
    }
    /** Current replay progress (count and received), or null if not replaying */
    get replayProgress() {
        return this._replayInfo;
    }
    get projectId() {
        return this._projectId;
    }
    get loadBalanced() {
        return this._options.loadBalance;
    }
    get loadBalanceGroup() {
        return this._options.loadBalanceGroup;
    }
    /** Negotiated protocol version (1 against pre-v2 brokers). */
    get protocolVersion() {
        return this._protocolVersion;
    }
    // ============ Connection ============
    /**
     * Connect to NoLag
     *
     * On reconnect, the server automatically restores all previous subscriptions.
     */
    connect() {
        return new Promise((resolve, reject) => {
            if (this._status === "connected") {
                resolve();
                return;
            }
            if (this._status === "connecting") {
                // Wait for existing connection attempt
                const checkConnection = () => {
                    if (this._status === "connected") {
                        resolve();
                    }
                    else if (this._status === "disconnected") {
                        reject(new Error("Connection failed"));
                    }
                    else {
                        setTimeout(checkConnection, 100);
                    }
                };
                checkConnection();
                return;
            }
            this._status = "connecting";
            this._log("Connecting to", this._options.url);
            try {
                this._ws = this._createWebSocket(this._options.url);
                this._ws.onOpen = () => {
                    this._log("WebSocket opened, authenticating...");
                    this._authenticate()
                        .then((restoredSubscriptions) => {
                        this._status = "connected";
                        this._reconnectAttempts = 0;
                        // Reset reconnecting flag after successful connection
                        // Next connect() call will be a fresh connect unless scheduled via _scheduleReconnect
                        this._isReconnecting = false;
                        this._log("Connected and authenticated");
                        if (restoredSubscriptions && restoredSubscriptions.length > 0) {
                            this._log("Server restored subscriptions:", restoredSubscriptions);
                        }
                        this._emitEvent("connect");
                        // Start heartbeat
                        this._startHeartbeat();
                        // Proactively refresh client tokens (JWTs) before they expire
                        this._scheduleTokenRefresh();
                        // Restore presence (client-side only, not persisted on server)
                        if (this._presence) {
                            this._sendPresence(this._presence);
                        }
                        resolve();
                    })
                        .catch((err) => {
                        this._log("Authentication failed:", err);
                        this._ws?.close();
                        reject(err);
                    });
                };
                this._ws.onMessage = (data) => {
                    this._handleMessage(data);
                };
                this._ws.onClose = (event) => {
                    const wasConnected = this._status === "connected";
                    this._status = "disconnected";
                    this._ws = null;
                    this._stopHeartbeat();
                    this._clearTokenRefresh();
                    // Proactive client-token refresh: reconnect immediately with a
                    // freshly minted token; the server restores subscriptions. No
                    // disconnect event - this is routine token rotation.
                    if (this._pendingTokenRefresh) {
                        this._pendingTokenRefresh = false;
                        this._reconnectAttempts = 0;
                        this._isReconnecting = true;
                        this._status = "reconnecting";
                        this._log("Reconnecting with refreshed client token");
                        this.connect().catch((err) => {
                            this._log("Token refresh reconnect failed:", err);
                        });
                        return;
                    }
                    // Server closed because the client token expired (4003):
                    // reconnect immediately without backoff so a token provider can
                    // mint a fresh token. Without a provider, the retry fails auth
                    // and falls back to the normal backoff path.
                    if (event?.code === 4003) {
                        this._reconnectAttempts = 0;
                        if (wasConnected) {
                            this._emitEvent("disconnect", "token_expired");
                        }
                        if (this._options.reconnect) {
                            this._isReconnecting = true;
                            this._status = "reconnecting";
                            this.connect().catch((err) => {
                                this._log("Reconnect after token expiry failed:", err);
                            });
                        }
                        return;
                    }
                    if (wasConnected) {
                        this._emitEvent("disconnect", event?.reason || "Connection closed");
                    }
                    // Attempt reconnection
                    if (this._options.reconnect && this._reconnectAttempts < this._options.maxReconnectAttempts) {
                        this._scheduleReconnect();
                    }
                };
                this._ws.onError = (event) => {
                    this._log("WebSocket error:", event);
                    this._emitEvent("error", new Error("WebSocket error"));
                    if (this._status === "connecting") {
                        reject(new Error("Connection failed"));
                    }
                };
            }
            catch (err) {
                this._status = "disconnected";
                reject(err);
            }
        });
    }
    /**
     * Disconnect from NoLag
     */
    disconnect() {
        this._log("Disconnecting...");
        const wasConnected = this._status === "connected";
        this._options.reconnect = false; // Prevent auto-reconnect
        this._stopHeartbeat();
        this._clearTokenRefresh();
        this._pendingTokenRefresh = false;
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
        if (this._ws) {
            this._ws.close(1000, "Client disconnect");
            this._ws = null;
        }
        this._status = "disconnected";
        this._presenceMap.clear();
        this._failAllPending("client disconnected");
        // Emit disconnect event if we were connected
        if (wasConnected) {
            this._emitEvent("disconnect", "Client disconnect");
        }
    }
    // ============ Presence ============
    /**
     * Set your presence (project-level)
     *
     * Note: Presence is client-side only and will be re-sent on reconnect.
     */
    setPresence(data, callback) {
        this._presence = data;
        if (!this.connected || !this._ws) {
            callback?.(new Error("Not connected"));
            return;
        }
        this._sendPresence(data, callback);
    }
    getPresence(actorId) {
        if (actorId) {
            return this._presenceMap.get(actorId);
        }
        return Array.from(this._presenceMap.values());
    }
    /**
     * Request presence list from server
     */
    fetchPresence() {
        return new Promise((resolve, reject) => {
            if (!this.connected || !this._ws) {
                reject(new Error("Not connected"));
                return;
            }
            // Set up one-time handler for presence list response
            const handler = (presenceList) => {
                this.off("presenceList", handler);
                resolve(presenceList);
            };
            this.on("presenceList", handler);
            this._trySend({ type: "getPresence" });
            // Timeout after 5 seconds
            setTimeout(() => {
                this.off("presenceList", handler);
                reject(new Error("Presence request timeout"));
            }, 5000);
        });
    }
    subscribe(topic, optionsOrCallback, callback) {
        const options = typeof optionsOrCallback === "object" ? optionsOrCallback : {};
        const cb = typeof optionsOrCallback === "function" ? optionsOrCallback : callback;
        if (!this.connected || !this._ws) {
            cb?.(new Error("Not connected"));
            return;
        }
        // Use connection-level defaults, allow per-topic override
        const loadBalance = options.loadBalance ?? this._options.loadBalance;
        const loadBalanceGroup = options.loadBalanceGroup ?? this._options.loadBalanceGroup;
        this._log("Subscribing to:", topic, loadBalance ? "(load balanced)" : "");
        // Use connection-level QoS default, allow per-topic override
        const qos = options.qos ?? this._options.qos;
        // Only include loadBalance fields when actually using load balancing
        const subscribeMessage = {
            type: "subscribe",
            topic,
            qos,
        };
        if (loadBalance) {
            subscribeMessage.loadBalance = true;
            if (loadBalanceGroup) {
                subscribeMessage.loadBalanceGroup = loadBalanceGroup;
            }
        }
        // Include filters if provided (supports mixed arrays with AND groups)
        const filters = options.filters;
        if (filters && filters.length > 0) {
            subscribeMessage.filters = filters;
            this._topicFilters.set(topic, [...filters]);
        }
        try {
            this._send(subscribeMessage, { op: "subscribe", topic });
        }
        catch (e) {
            if (cb) {
                cb(e);
                return;
            }
            throw e;
        }
        // Real ack: resolve on the broker's `subscribed` frame, reject on a
        // topic-matched error frame (e.g. not_authorized, 42940 unknown_topic).
        if (cb) {
            const timer = setTimeout(() => {
                this._settleSubscribe(topic, new Error(`subscribe '${topic}' was not acknowledged within ${PENDING_OP_TIMEOUT_MS}ms`));
            }, PENDING_OP_TIMEOUT_MS);
            const entry = { cb, timer };
            const pending = this._pendingSubscribes.get(topic);
            if (pending)
                pending.push(entry);
            else
                this._pendingSubscribes.set(topic, [entry]);
        }
    }
    _settleSubscribe(topic, err) {
        const pending = this._pendingSubscribes.get(topic);
        if (!pending)
            return;
        this._pendingSubscribes.delete(topic);
        for (const { cb, timer } of pending) {
            clearTimeout(timer);
            cb(err);
        }
    }
    _settlePublish(msgRef, err) {
        const pending = this._pendingPublishes.get(msgRef);
        if (!pending)
            return false;
        this._pendingPublishes.delete(msgRef);
        clearTimeout(pending.timer);
        pending.cb(err);
        return true;
    }
    _failAllPending(reason) {
        for (const [topic] of this._pendingSubscribes) {
            this._settleSubscribe(topic, new Error(`subscribe '${topic}' aborted: ${reason}`));
        }
        for (const [msgRef] of this._pendingPublishes) {
            this._settlePublish(msgRef, new Error(`publish aborted: ${reason}`));
        }
    }
    /**
     * Unsubscribe from a topic
     *
     * This also removes the subscription from server-side persistence.
     */
    unsubscribe(topic, callback) {
        if (!this.connected || !this._ws) {
            callback?.(new Error("Not connected"));
            return;
        }
        this._log("Unsubscribing from:", topic);
        try {
            this._send({ type: "unsubscribe", topic }, { op: "unsubscribe", topic });
        }
        catch (e) {
            if (callback) {
                callback(e);
                return;
            }
            throw e;
        }
        callback?.(null);
    }
    /**
     * Replace all filters for a topic.
     * Sends a setFilters message to the server which handles subscribe/unsubscribe diffs.
     * Empty array switches back to wildcard (receive all messages).
     */
    setFilters(topic, filters, callback) {
        if (!this.connected || !this._ws) {
            callback?.(new Error("Not connected"));
            return;
        }
        this._log("Setting filters for:", topic, filters);
        if (filters.length > 0) {
            this._topicFilters.set(topic, [...filters]);
        }
        else {
            this._topicFilters.delete(topic);
        }
        this._send({ type: "setFilters", topic, filters }, { op: "setFilters", topic });
        callback?.(null);
    }
    /**
     * Add filters to the existing set for a topic.
     * Merges with current filters and sends the full set to the server.
     */
    addFilters(topic, filters, callback) {
        const existing = this._topicFilters.get(topic) || [];
        // Collect existing simple strings into a set for dedup
        const simpleSet = new Set();
        const andGroups = [];
        for (const item of existing) {
            if (typeof item === "string") {
                simpleSet.add(item);
            }
            else {
                andGroups.push(item);
            }
        }
        for (const f of filters) {
            simpleSet.add(f);
        }
        const merged = [...Array.from(simpleSet), ...andGroups];
        this.setFilters(topic, merged, callback);
    }
    /**
     * Remove specific filters from a topic.
     * Removes from current set and sends the remaining filters to the server.
     */
    removeFilters(topic, filters, callback) {
        const existing = this._topicFilters.get(topic);
        if (!existing) {
            callback?.(null);
            return;
        }
        const removeSet = new Set(filters);
        // Remove matching simple strings, preserve AND groups
        const remaining = existing.filter((item) => typeof item !== "string" || !removeSet.has(item));
        this.setFilters(topic, remaining, callback);
    }
    /**
     * Acknowledge receipt of a message
     *
     * Note: ACKs are automatically sent when messages have `requiresAck: true`.
     * Use this method for manual ACK scenarios.
     */
    ack(msgId) {
        if (!this.connected || !this._ws) {
            this._log("Cannot ACK, not connected");
            return;
        }
        this._queueAck(msgId);
    }
    /**
     * Acknowledge multiple messages at once
     */
    batchAck(msgIds) {
        if (!this.connected || !this._ws) {
            this._log("Cannot ACK, not connected");
            return;
        }
        for (const msgId of msgIds) {
            this._queueAck(msgId);
        }
    }
    /**
     * Emit/publish to a topic
     */
    emit(topic, data, optionsOrCallback, callback) {
        if (!this.connected || !this._ws) {
            const cb = typeof optionsOrCallback === "function" ? optionsOrCallback : callback;
            cb?.(new Error("Not connected"));
            return;
        }
        const options = typeof optionsOrCallback === "object" ? optionsOrCallback : {};
        const ackCb = typeof optionsOrCallback === "function" ? optionsOrCallback : callback;
        this._log("Emitting to:", topic, data);
        const publishMessage = {
            type: "publish",
            topic,
            data,
            qos: options.qos ?? this._options.qos,
            echo: options.echo ?? true,
        };
        if (options.filter) {
            publishMessage.filter = options.filter;
        }
        else if (options.filters && options.filters.length > 0) {
            publishMessage.filters = options.filters;
        }
        // v2 brokers ack publishes: attach a msgRef and resolve the callback on
        // the `published` frame (or a msgRef-matched error frame). v1 keeps the
        // legacy optimistic "sent" semantics.
        const useRealAck = !!ackCb && this._protocolVersion >= 2;
        let msgRef;
        if (useRealAck) {
            msgRef = `${++this._msgRefCounter}-${Math.random().toString(36).slice(2, 10)}`;
            publishMessage.msgRef = msgRef;
        }
        try {
            this._send(publishMessage, { op: "publish", topic });
        }
        catch (e) {
            if (ackCb) {
                ackCb(e);
                return;
            }
            throw e;
        }
        if (useRealAck && msgRef && ackCb) {
            const timer = setTimeout(() => {
                this._settlePublish(msgRef, new Error(`publish to '${topic}' was not acknowledged within ${PENDING_OP_TIMEOUT_MS}ms`));
            }, PENDING_OP_TIMEOUT_MS);
            this._pendingPublishes.set(msgRef, { cb: ackCb, timer });
        }
        else {
            ackCb?.(null);
        }
    }
    on(event, handler) {
        if (!this._eventHandlers.has(event)) {
            this._eventHandlers.set(event, new Set());
        }
        this._eventHandlers.get(event).add(handler);
        return this;
    }
    /**
     * Remove event handler
     */
    off(event, handler) {
        if (handler) {
            this._eventHandlers.get(event)?.delete(handler);
        }
        else {
            this._eventHandlers.delete(event);
        }
        return this;
    }
    /**
     * Listen to all topic messages
     */
    onAny(handler) {
        this.on("*", handler);
        return this;
    }
    // ============ Fluent API ============
    /**
     * Set the app context for scoped pub/sub
     *
     * @example
     * ```typescript
     * const room = client.setApp('chat').setRoom('general');
     *
     * room.subscribe('messages');
     * room.on('messages', (data) => console.log(data));
     * room.emit('messages', { text: 'Hello!' });
     *
     * // Equivalent to:
     * // client.subscribe('chat/general/messages');
     * // client.on('chat/general/messages', ...);
     * // client.emit('chat/general/messages', ...);
     * ```
     */
    setApp(app) {
        return new App(this, app);
    }
    // ============ Private Methods ============
    _authenticate() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("Authentication timeout"));
            }, 10000);
            // Set up one-time auth response handler
            const authHandler = (msg) => {
                if (msg.type === "auth") {
                    clearTimeout(timeout);
                    if (msg.success) {
                        this._actorTokenId = msg.actorTokenId || this._options.actorTokenId || null;
                        this._projectId = msg.projectId || null;
                        this._actorType = msg.actorType || null;
                        // Pre-v2 brokers omit the field => negotiate down to 1
                        this._protocolVersion =
                            typeof msg.protocolVersion === "number" ? msg.protocolVersion : 1;
                        // Return restored subscriptions (server returns objects with loadBalance info)
                        resolve(msg.restoredSubscriptions || []);
                    }
                    else {
                        reject(new Error(msg.error || "Authentication failed"));
                    }
                }
            };
            // Temporarily store handler
            this._authHandler = authHandler;
            // Resolve the token: providers are invoked on EVERY connect and
            // reconnect so each attempt authenticates with a fresh client token
            const tokenOrProvider = this._tokenOrProvider;
            Promise.resolve(typeof tokenOrProvider === "function" ? tokenOrProvider() : tokenOrProvider)
                .then((token) => {
                this._options.token = token;
                // Only include reconnect flag when true (reconnecting after disconnect)
                // Absence of reconnect flag = fresh connect (no subscription restoration)
                const authMessage = {
                    type: "auth",
                    token,
                    protocolVersion: PROTOCOL_VERSION,
                };
                // Names this client instance so the broker keeps a session per
                // worker rather than per credential. Sent on every connect and
                // reconnect: it is what identifies the returning worker.
                if (this._options.clientId) {
                    authMessage.clientId = this._options.clientId;
                }
                if (this._isReconnecting) {
                    authMessage.reconnect = true;
                }
                // Include projectId for debug logging (pre-auth events)
                if (this._options.projectId) {
                    authMessage.projectId = this._options.projectId;
                }
                this._send(authMessage, { op: "auth" });
            })
                .catch((e) => {
                clearTimeout(timeout);
                delete this._authHandler;
                reject(e instanceof Error ? e : new Error(String(e)));
            });
        });
    }
    /**
     * Decode the exp claim (unix seconds) from a JWT without verifying it.
     * Returns null for opaque tokens or anything that does not parse.
     */
    _decodeJwtExp(token) {
        if (!token.startsWith("eyJ"))
            return null;
        const parts = token.split(".");
        if (parts.length !== 3)
            return null;
        try {
            const payload = JSON.parse(base64UrlToString(parts[1]));
            return typeof payload.exp === "number" ? payload.exp : null;
        }
        catch {
            return null;
        }
    }
    /**
     * Schedule a proactive refresh-reconnect shortly before a client token
     * (JWT) expires. Only armed when a token provider is available to mint
     * a fresh token; static-string JWTs simply expire (4003).
     */
    _scheduleTokenRefresh() {
        this._clearTokenRefresh();
        if (typeof this._tokenOrProvider !== "function")
            return;
        const exp = this._decodeJwtExp(this._options.token);
        if (exp === null)
            return;
        const delay = Math.max(exp * 1000 - Date.now() - 30000, 5000);
        this._log(`Client token expires at ${exp}, refresh-reconnect in ${delay}ms`);
        this._tokenRefreshTimer = setTimeout(() => {
            this._tokenRefreshTimer = null;
            void this._refreshToken();
        }, delay);
    }
    /**
     * Renew the client token. Preferred path: in-band `reauth` over the live
     * connection (nothing drops, no resubscribe). Fallback (older brokers or
     * transient failures): the reconnect flow, where the provider mints a
     * fresh token and the server restores subscriptions.
     */
    async _refreshToken() {
        if (!this._ws || this._status !== "connected")
            return;
        let token;
        try {
            const tokenOrProvider = this._tokenOrProvider;
            token =
                typeof tokenOrProvider === "function"
                    ? await tokenOrProvider()
                    : tokenOrProvider;
        }
        catch (err) {
            this._log("Token provider failed during refresh, falling back to reconnect:", err);
            this._refreshViaReconnect();
            return;
        }
        if (!this._ws || this._status !== "connected")
            return;
        const ok = await this._sendReauth(token);
        if (ok) {
            this._options.token = token;
            this._log("Client token refreshed in-band");
            this._scheduleTokenRefresh();
        }
        else if (this._ws && this._status === "connected") {
            this._log("In-band reauth unavailable, refreshing via reconnect");
            this._refreshViaReconnect();
        }
        // If the socket dropped mid-reauth, the normal reconnect flow re-arms
        // the refresh cycle after the next successful auth.
    }
    _refreshViaReconnect() {
        if (!this._ws || this._status !== "connected")
            return;
        this._pendingTokenRefresh = true;
        // onClose drives the immediate reconnect; the provider mints a fresh
        // token and the server restores subscriptions (reconnect: true)
        this._ws.close(1000, "token_refresh");
    }
    /** Send a reauth frame and resolve with the broker's verdict.
     *  Resolves false on failure, timeout, or brokers without reauth support
     *  (they ignore the unknown frame and the timeout fires). */
    _sendReauth(token) {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                delete this._reauthHandler;
                resolve(false);
            }, REAUTH_TIMEOUT_MS);
            this._reauthHandler = (msg) => {
                clearTimeout(timeout);
                delete this._reauthHandler;
                if (msg.success !== true) {
                    this._log("Reauth rejected:", msg.error);
                }
                resolve(msg.success === true);
            };
            try {
                this._send({ type: "reauth", token }, { op: "reauth" });
            }
            catch (e) {
                clearTimeout(timeout);
                delete this._reauthHandler;
                this._log("Reauth send failed:", e);
                resolve(false);
            }
        });
    }
    _clearTokenRefresh() {
        if (this._tokenRefreshTimer) {
            clearTimeout(this._tokenRefreshTimer);
            this._tokenRefreshTimer = null;
        }
    }
    _sendPresence(data, callback) {
        this._trySend({ type: "presence", data }, { op: "presence" });
        callback?.(null);
    }
    _send(message, context) {
        if (!this._ws || this._ws.readyState !== WS_READY_STATE.OPEN) {
            throw new Error(`Cannot send${context ? ` (${context.op}${context.topic ? ` '${context.topic}'` : ""})` : ""}: WebSocket not open`);
        }
        let payload;
        try {
            payload = encode(message);
        }
        catch (cause) {
            const err = new NoLagEncodeError(context?.op ?? "send", context?.topic, cause);
            this._emitEvent("error", err);
            throw err;
        }
        this._ws.send(payload);
    }
    /** Fire-and-forget internal sends (acks, presence, heartbeats): never throw,
     *  but encode failures are still surfaced on the 'error' event by _send. */
    _trySend(message, context) {
        try {
            this._send(message, context);
        }
        catch (e) {
            this._log("Send failed:", e.message);
        }
    }
    _handleMessage(data) {
        // Handle empty binary packet (heartbeat response)
        if (data instanceof ArrayBuffer && data.byteLength === 0) {
            this._log("Heartbeat pong received");
            return;
        }
        let message;
        try {
            if (data instanceof ArrayBuffer) {
                message = decode(new Uint8Array(data));
            }
            else {
                // Fallback for text messages (JSON)
                message = JSON.parse(data);
            }
        }
        catch (e) {
            this._log("Failed to decode message:", e);
            return;
        }
        this._log("Received:", message);
        // Handle auth response (during connection)
        if (message.type === "auth" && this._authHandler) {
            this._authHandler(message);
            delete this._authHandler;
            return;
        }
        // Handle in-band reauth response (client-token refresh on the live socket)
        if (message.type === "reauth") {
            this._reauthHandler?.(message);
            return;
        }
        // Handle different message types
        switch (message.type) {
            case "message":
                this._handleTopicMessage(message);
                break;
            case "presence":
                this._handlePresenceEvent(message);
                break;
            case "presenceList":
                this._handlePresenceList(message);
                break;
            case "lobbyPresence":
                this._handleLobbyPresenceEvent(message);
                break;
            case "lobbySubscribed":
                this._handleLobbySubscribed(message);
                break;
            case "lobbyUnsubscribed":
                this._log("Unsubscribed from lobby:", message.lobbyId);
                break;
            case "lobbyPresenceList":
                this._handleLobbyPresenceList(message);
                break;
            case "subscribed":
                this._log("Subscribed to:", message.topic);
                this._settleSubscribe(message.topic, null);
                break;
            case "published":
                this._log("Publish acked:", message.topic, message.msgRef);
                if (message.msgRef) {
                    this._settlePublish(message.msgRef, null);
                }
                break;
            case "unsubscribed":
                this._log("Unsubscribed from:", message.topic);
                this._topicFilters.delete(message.topic);
                break;
            case "filtersUpdated":
                this._log("Filters updated for:", message.topic, message.filters);
                break;
            case "replayStart":
                this._handleReplayStart(message);
                break;
            case "replayEnd":
                this._handleReplayEnd(message);
                break;
            case "error": {
                this._log("Server error:", message.error, message.topic ?? "", message.hint ?? "");
                const serverError = new NoLagServerError({
                    code: message.code,
                    error: message.error,
                    topic: message.topic,
                    hint: message.hint,
                    msgRef: message.msgRef,
                });
                // Route to the pending operation that caused it (and ALSO emit the
                // event — observers should see every server error)
                if (message.msgRef) {
                    this._settlePublish(message.msgRef, serverError);
                }
                if (message.topic) {
                    this._settleSubscribe(message.topic, serverError);
                }
                this._emitEvent("error", serverError);
                break;
            }
            default:
                this._log("Unknown message type:", message.type);
        }
    }
    _handleTopicMessage(message) {
        const { topic, data, isReplay, msgId, requiresAck, filter } = message;
        const meta = {
            isReplay: isReplay ?? this._isReplaying,
            msgId,
        };
        if (filter) {
            meta.filter = filter;
        }
        // Track replay progress
        if (this._replayInfo && meta.isReplay) {
            this._replayInfo.received++;
        }
        // Emit to specific topic handlers
        this._emitEvent(topic, data, meta);
        // Emit to wildcard handlers
        const anyHandlers = this._eventHandlers.get("*");
        if (anyHandlers) {
            for (const handler of anyHandlers) {
                try {
                    handler(topic, data, meta);
                }
                catch (e) {
                    console.error("Error in wildcard handler:", e);
                }
            }
        }
        // Queue ACK if required
        if (requiresAck && msgId) {
            this._queueAck(msgId);
        }
    }
    _handleReplayStart(message) {
        this._isReplaying = true;
        this._replayInfo = { count: message.count, received: 0 };
        this._log("Replay starting:", message.count, "messages");
        this._emitEvent("replay:start", {
            count: message.count,
            oldestTimestamp: message.oldestTimestamp,
            newestTimestamp: message.newestTimestamp,
        });
    }
    _handleReplayEnd(message) {
        this._isReplaying = false;
        this._log("Replay complete:", message.replayed, "messages");
        this._emitEvent("replay:end", {
            replayed: message.replayed,
        });
        this._replayInfo = null;
    }
    _queueAck(msgId) {
        this._pendingAcks.push(msgId);
        // Send immediately if no batching, otherwise debounce
        if (this._ackBatchInterval === 0) {
            this._flushAcks();
        }
        else if (!this._ackTimer) {
            this._ackTimer = setTimeout(() => {
                this._flushAcks();
            }, this._ackBatchInterval);
        }
    }
    _flushAcks() {
        if (this._pendingAcks.length === 0)
            return;
        if (this._pendingAcks.length === 1) {
            // Single ACK
            this._trySend({ type: "ack", msgId: this._pendingAcks[0] });
        }
        else {
            // Batch ACK
            this._trySend({ type: "batchAck", msgIds: this._pendingAcks });
        }
        this._pendingAcks = [];
        this._ackTimer = null;
    }
    _handlePresenceEvent(message) {
        const { event, data: rawData } = message;
        if (!rawData)
            return;
        // Normalize snake_case to camelCase (Kraken sends snake_case)
        const data = {
            actorTokenId: rawData.actorTokenId || rawData.actor_token_id,
            presence: rawData.presence,
            joinedAt: rawData.joinedAt || rawData.joined_at,
            // Persistent Presence: status (online|offline|waking) + advertisement version
            status: rawData.status,
            advertisementVersion: rawData.advertisementVersion ?? rawData.advertisement_version,
        };
        if (!data.actorTokenId) {
            return;
        }
        switch (event) {
            case "join":
                this._presenceMap.set(data.actorTokenId, data);
                this._emitEvent("presence:join", data);
                break;
            case "leave":
                this._presenceMap.delete(data.actorTokenId);
                this._emitEvent("presence:leave", data);
                break;
            case "update":
                this._presenceMap.set(data.actorTokenId, data);
                this._emitEvent("presence:update", data);
                break;
            // Persistent Presence: a wake webhook was fired for an offline actor.
            case "waking":
                this._presenceMap.set(data.actorTokenId, data);
                this._emitEvent("presence:waking", data);
                this._emitEvent("presence:update", data);
                break;
        }
    }
    _handlePresenceList(message) {
        // Update local presence map
        this._presenceMap.clear();
        for (const actor of message.data || []) {
            if (actor.actorTokenId) {
                this._presenceMap.set(actor.actorTokenId, actor);
            }
        }
        // Emit for fetchPresence() promise (with optional roomId for room-scoped presence)
        this._emitEvent("presenceList", message.data, message.roomId);
    }
    _handleLobbyPresenceEvent(message) {
        const { event, lobbyId, roomId, actorId, data } = message;
        const presenceEvent = {
            lobbyId,
            roomId,
            actorId,
            data,
        };
        // Emit lobby-specific event (e.g., "lobby:active-trips:presence:join")
        const eventKey = `lobby:${lobbyId}:presence:${event}`;
        this._emitEvent(eventKey, presenceEvent);
        // Also emit generic lobby presence event
        this._emitEvent(`lobbyPresence:${event}`, presenceEvent);
    }
    _handleLobbySubscribed(message) {
        this._log("Subscribed to lobby:", message.lobbyId);
        // Emit for lobby.subscribe() promise
        this._emitEvent(`lobbySubscribed:${message.lobbyId}`, message.presence);
    }
    _handleLobbyPresenceList(message) {
        // Emit for lobby.fetchPresence() promise
        this._emitEvent(`lobbyPresenceList:${message.lobbyId}`, message.presence);
    }
    _scheduleReconnect() {
        if (this._reconnectTimer)
            return;
        this._reconnectAttempts++;
        const delay = Math.min(this._options.reconnectInterval * Math.pow(1.5, this._reconnectAttempts - 1), 30000 // Max 30 seconds
        );
        this._log(`Reconnecting in ${delay}ms (attempt ${this._reconnectAttempts})`);
        this._status = "reconnecting";
        this._emitEvent("reconnect");
        this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
            // Set flag so server knows to restore subscriptions
            this._isReconnecting = true;
            this.connect().catch((err) => {
                this._log("Reconnection failed:", err);
            });
        }, delay);
    }
    _emitEvent(event, ...args) {
        const handlers = this._eventHandlers.get(event);
        if (handlers) {
            for (const handler of handlers) {
                try {
                    handler(...args);
                }
                catch (e) {
                    console.error("Error in event handler:", e);
                }
            }
        }
    }
    _log(...args) {
        if (this._options.debug) {
            console.log("[NoLag]", ...args);
        }
    }
    _startHeartbeat() {
        if (this._options.heartbeatInterval <= 0) {
            return;
        }
        this._stopHeartbeat();
        this._heartbeatTimer = setInterval(() => {
            if (this._ws && this._ws.readyState === WS_READY_STATE.OPEN) {
                // Send empty binary packet as heartbeat
                this._ws.send(new ArrayBuffer(0));
                this._log("Heartbeat ping sent");
            }
        }, this._options.heartbeatInterval);
    }
    _stopHeartbeat() {
        if (this._heartbeatTimer) {
            clearInterval(this._heartbeatTimer);
            this._heartbeatTimer = null;
        }
    }
};
/**
 * Room - Scoped context for pub/sub within an app.room
 *
 * Provides a cleaner API by automatically prefixing topics with app.room
 */
class Room {
    constructor(_client, _app, _room) {
        this._client = _client;
        this._app = _app;
        this._room = _room;
    }
    get prefix() {
        return `${this._app}/${this._room}`;
    }
    _fullTopic(topic) {
        return `${this.prefix}/${topic}`;
    }
    subscribe(topic, optionsOrCallback, callback) {
        const fullTopic = this._fullTopic(topic);
        if (typeof optionsOrCallback === "function") {
            this._client.subscribe(fullTopic, optionsOrCallback);
        }
        else {
            this._client.subscribe(fullTopic, optionsOrCallback || {}, callback);
        }
    }
    unsubscribe(topic, callback) {
        this._client.unsubscribe(this._fullTopic(topic), callback);
    }
    emit(topic, data, optionsOrCallback, callback) {
        const fullTopic = this._fullTopic(topic);
        if (typeof optionsOrCallback === "function") {
            this._client.emit(fullTopic, data, optionsOrCallback);
        }
        else {
            this._client.emit(fullTopic, data, optionsOrCallback || {}, callback);
        }
    }
    on(topic, handler) {
        this._client.on(this._fullTopic(topic), handler);
        return this;
    }
    off(topic, handler) {
        this._client.off(this._fullTopic(topic), handler);
        return this;
    }
    // Room-level filter methods
    setFilters(topic, filters, callback) {
        this._client.setFilters(this._fullTopic(topic), filters, callback);
    }
    addFilters(topic, filters, callback) {
        this._client.addFilters(this._fullTopic(topic), filters, callback);
    }
    removeFilters(topic, filters, callback) {
        this._client.removeFilters(this._fullTopic(topic), filters, callback);
    }
    // Room-level presence methods
    /**
     * Set presence in this room (auto-propagates to lobbies containing this room)
     */
    setPresence(data, callback) {
        if (!this._client.connected) {
            callback?.(new Error("Not connected"));
            return;
        }
        // Send presence with roomId for room-scoped presence
        this._client._send({
            type: "presence",
            roomId: this._room,
            data,
        });
        callback?.(null);
    }
    /**
     * Get local cache of presence for this room
     */
    getPresence() {
        // Return presence map as object keyed by actorTokenId
        const presenceMap = this._client._presenceMap;
        const result = {};
        presenceMap.forEach((value, key) => {
            result[key] = value;
        });
        return result;
    }
    /**
     * Fetch presence for this room from server
     */
    fetchPresence() {
        return new Promise((resolve, reject) => {
            if (!this._client.connected) {
                reject(new Error("Not connected"));
                return;
            }
            // Set up one-time handler for presence list response
            const handler = (presenceList, roomId) => {
                if (roomId === this._room || !roomId) {
                    this._client.off("presenceList", handler);
                    resolve(presenceList);
                }
            };
            this._client.on("presenceList", handler);
            this._client._send({ type: "getPresence", roomId: this._room });
            // Timeout after 5 seconds
            setTimeout(() => {
                this._client.off("presenceList", handler);
                reject(new Error("Presence request timeout"));
            }, 5000);
        });
    }
}
/**
 * Lobby - Scoped context for observing presence across rooms in a lobby
 *
 * Lobbies are read-only - you can only observe presence, not publish to them.
 */
class Lobby {
    constructor(_client, _lobbyId) {
        this._client = _client;
        this._lobbyId = _lobbyId;
    }
    get lobbyId() {
        return this._lobbyId;
    }
    /**
     * Subscribe to this lobby's presence events.
     * Returns a snapshot of current presence when subscription completes.
     */
    subscribe(callback) {
        return new Promise((resolve, reject) => {
            if (!this._client.connected) {
                const err = new Error("Not connected");
                callback?.(err);
                reject(err);
                return;
            }
            // Set up one-time handler for lobby subscribed response
            const handler = (presence) => {
                this._client.off(`lobbySubscribed:${this._lobbyId}`, handler);
                callback?.(null);
                resolve(presence);
            };
            this._client.on(`lobbySubscribed:${this._lobbyId}`, handler);
            this._client._send({
                type: "lobbySubscribe",
                lobbyId: this._lobbyId,
            });
            // Timeout after 10 seconds
            setTimeout(() => {
                this._client.off(`lobbySubscribed:${this._lobbyId}`, handler);
                const err = new Error("Lobby subscription timeout");
                callback?.(err);
                reject(err);
            }, 10000);
        });
    }
    /**
     * Unsubscribe from this lobby's presence events
     */
    unsubscribe(callback) {
        if (!this._client.connected) {
            callback?.(new Error("Not connected"));
            return;
        }
        this._client._send({
            type: "lobbyUnsubscribe",
            lobbyId: this._lobbyId,
        });
        callback?.(null);
    }
    /**
     * Fetch current presence state for the lobby
     */
    fetchPresence() {
        return new Promise((resolve, reject) => {
            if (!this._client.connected) {
                reject(new Error("Not connected"));
                return;
            }
            // Set up one-time handler for lobby presence list response
            const handler = (presence) => {
                this._client.off(`lobbyPresenceList:${this._lobbyId}`, handler);
                resolve(presence);
            };
            this._client.on(`lobbyPresenceList:${this._lobbyId}`, handler);
            this._client._send({
                type: "getLobbyPresence",
                lobbyId: this._lobbyId,
            });
            // Timeout after 10 seconds
            setTimeout(() => {
                this._client.off(`lobbyPresenceList:${this._lobbyId}`, handler);
                reject(new Error("Lobby presence request timeout"));
            }, 10000);
        });
    }
    on(event, handler) {
        // Map event names to internal event keys
        const eventType = event.replace("presence:", "");
        const eventKey = `lobby:${this._lobbyId}:presence:${eventType}`;
        this._client.on(eventKey, handler);
        return this;
    }
    /**
     * Remove presence event handler
     */
    off(event, handler) {
        const eventType = event.replace("presence:", "");
        const eventKey = `lobby:${this._lobbyId}:presence:${eventType}`;
        this._client.off(eventKey, handler);
        return this;
    }
}
/**
 * App - Intermediate context for setting the room or lobby
 */
class App {
    constructor(_client, _app) {
        this._client = _client;
        this._app = _app;
    }
    setRoom(room) {
        return new Room(this._client, this._app, room);
    }
    setLobby(lobby) {
        return new Lobby(this._client, lobby);
    }
}

const createWebSocket = (url) => {
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    let onOpenCallback;
    let onMessageCallback;
    let onCloseCallback;
    let onErrorCallback;
    ws.onopen = (event) => {
        onOpenCallback?.(event);
    };
    ws.onmessage = (event) => {
        onMessageCallback?.(event.data);
    };
    ws.onclose = (event) => {
        onCloseCallback?.(event);
    };
    ws.onerror = (event) => {
        onErrorCallback?.(event);
    };
    return {
        send(data) {
            ws.send(data);
        },
        close(code, reason) {
            ws.close(code, reason);
        },
        set onOpen(callback) {
            onOpenCallback = callback;
        },
        set onMessage(callback) {
            onMessageCallback = callback;
        },
        set onClose(callback) {
            onCloseCallback = callback;
        },
        set onError(callback) {
            onErrorCallback = callback;
        },
        get readyState() {
            return ws.readyState;
        },
    };
};

/**
 * NoLag REST API Client
 *
 * Provides management operations for NoLag resources via REST API.
 * API keys are scoped to a specific project, so no organization or project IDs needed.
 *
 * Use this for managing apps, rooms, and actors within your project.
 * For real-time messaging, use the main NoLag WebSocket client.
 */
const DEFAULT_BASE_URL = "https://api.nolag.app/v1";
const DEFAULT_TIMEOUT = 30000;
/**
 * NoLag REST API Client
 *
 * API keys are project-scoped, so you don't need to pass organization or project IDs.
 *
 * @example
 * ```typescript
 * // Create client with project API key
 * const api = new NoLagApi('nlg_live_xxx.secret');
 *
 * // List apps in your project
 * const apps = await api.apps.list();
 *
 * // Create a room
 * const room = await api.rooms.create(appId, {
 *   name: 'chat-room',
 *   description: 'General chat'
 * });
 *
 * // Create an actor and get the access token
 * const actor = await api.actors.create({
 *   name: 'web-client',
 *   actorType: 'device'
 * });
 * console.log('Save this token:', actor.accessToken);
 * ```
 */
class NoLagApi {
    constructor(apiKey, options) {
        this._apiKey = apiKey;
        this._baseUrl = (options?.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
        this._timeout = options?.timeout ?? DEFAULT_TIMEOUT;
        this._customHeaders = options?.headers ?? {};
        // Initialize sub-APIs
        this.apps = new AppsApi(this);
        this.rooms = new RoomsApi(this);
        this.actors = new ActorsApi(this);
        this.scopes = new ScopesApi(this);
    }
    /**
     * Make an authenticated request to the NoLag API
     */
    async request(method, path, body, query) {
        const url = new URL(`${this._baseUrl}${path}`);
        // Add query parameters
        if (query) {
            for (const [key, value] of Object.entries(query)) {
                if (value !== undefined) {
                    url.searchParams.set(key, String(value));
                }
            }
        }
        const headers = {
            Authorization: `Bearer ${this._apiKey}`,
            "Content-Type": "application/json",
            ...this._customHeaders,
        };
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this._timeout);
        try {
            const response = await fetch(url.toString(), {
                method,
                headers,
                body: body ? JSON.stringify(body) : undefined,
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
                let errorData;
                try {
                    errorData = await response.json();
                }
                catch {
                    errorData = {
                        statusCode: response.status,
                        message: response.statusText || "Request failed",
                    };
                }
                throw new NoLagApiError(errorData.message || "Request failed", response.status, errorData);
            }
            // Handle 204 No Content
            if (response.status === 204) {
                return undefined;
            }
            return await response.json();
        }
        catch (error) {
            clearTimeout(timeoutId);
            if (error instanceof NoLagApiError) {
                throw error;
            }
            if (error instanceof Error && error.name === "AbortError") {
                throw new NoLagApiError("Request timeout", 408, {
                    statusCode: 408,
                    message: "Request timeout",
                });
            }
            throw new NoLagApiError(error instanceof Error ? error.message : "Unknown error", 0, { statusCode: 0, message: "Network error" });
        }
    }
}
/**
 * API Error class
 */
class NoLagApiError extends Error {
    constructor(message, statusCode, details) {
        super(message);
        this.name = "NoLagApiError";
        this.statusCode = statusCode;
        this.details = details;
    }
}
// ============ Apps API ============
class AppsApi {
    constructor(_api) {
        this._api = _api;
    }
    /**
     * List all apps in the project
     */
    async list(options) {
        return this._api.request("GET", "/apps", undefined, options);
    }
    /**
     * Get an app by ID
     */
    async get(appId) {
        return this._api.request("GET", `/apps/${appId}`);
    }
    /**
     * Create a new app
     */
    async create(data) {
        return this._api.request("POST", "/apps", data);
    }
    /**
     * Update an app
     */
    async update(appId, data) {
        return this._api.request("PATCH", `/apps/${appId}`, data);
    }
    /**
     * Delete an app (soft delete)
     */
    async delete(appId) {
        return this._api.request("DELETE", `/apps/${appId}`);
    }
    /**
     * Reset app to its blueprint configuration
     */
    async resetToBlueprint(appId) {
        return this._api.request("POST", `/apps/${appId}/reset-to-blueprint`);
    }
}
// ============ Rooms API ============
class RoomsApi {
    constructor(_api) {
        this._api = _api;
    }
    /**
     * List all rooms in an app
     */
    async list(appId) {
        return this._api.request("GET", `/apps/${appId}/rooms`);
    }
    /**
     * Get a room by ID
     */
    async get(appId, roomId) {
        return this._api.request("GET", `/apps/${appId}/rooms/${roomId}`);
    }
    /**
     * Create a new dynamic room
     */
    async create(appId, data) {
        return this._api.request("POST", `/apps/${appId}/rooms`, data);
    }
    /**
     * Ensure a dynamic room exists (idempotent create-if-not-exists).
     *
     * For runtime per-entity rooms (a matter id, a device id): the creator
     * calls this once at entity-creation time; everyone else just joins and
     * gets a loud error if the room is missing (the broker never creates rooms
     * implicitly — that would silently hide typo'd/asymmetric slugs). Requires
     * the app to have `config.autoProvisionRooms=true`; capped per app. Returns
     * the existing room unchanged on slug match.
     */
    async ensure(appId, data) {
        return this._api.request("POST", `/apps/${appId}/rooms/ensure`, data);
    }
    /**
     * Update a room
     */
    async update(appId, roomId, data) {
        return this._api.request("PATCH", `/apps/${appId}/rooms/${roomId}`, data);
    }
    /**
     * Delete a dynamic room (static rooms cannot be deleted)
     */
    async delete(appId, roomId) {
        await this._api.request("DELETE", `/apps/${appId}/rooms/${roomId}`);
    }
    /**
     * Grant an actor access to a room (room-level ACL).
     *
     * The first grant makes the room private — after that the broker only admits
     * actors with an explicit, unexpired grant. Pass `actorTokenId` (a token in
     * this project) or `actorType` (a type label). Use this to make a room (e.g.
     * a per-user notification bell) genuinely private.
     */
    async grantActor(appId, roomId, data) {
        return this._api.request("POST", `/apps/${appId}/rooms/${roomId}/actors`, data);
    }
    /**
     * List a room's actor grants
     */
    async listActors(appId, roomId) {
        return this._api.request("GET", `/apps/${appId}/rooms/${roomId}/actors`);
    }
    /**
     * Revoke an actor's room access. Removing the last grant makes the room public again.
     */
    async revokeActor(appId, roomId, roomActorAccessId) {
        await this._api.request("DELETE", `/apps/${appId}/rooms/${roomId}/actors/${roomActorAccessId}`);
    }
}
// ============ Actors API ============
class ActorsApi {
    constructor(_api) {
        this._api = _api;
    }
    /**
     * List all actors in the project
     */
    async list() {
        return this._api.request("GET", "/actors");
    }
    /**
     * Get an actor by ID
     */
    async get(actorId) {
        return this._api.request("GET", `/actors/${actorId}`);
    }
    /**
     * Create a new actor
     *
     * IMPORTANT: The access token is only returned once! Save it immediately.
     */
    async create(data) {
        return this._api.request("POST", "/actors", data);
    }
    /**
     * Update an actor
     */
    async update(actorId, data) {
        return this._api.request("PATCH", `/actors/${actorId}`, data);
    }
    /**
     * Delete an actor
     */
    async delete(actorId) {
        await this._api.request("DELETE", `/actors/${actorId}`);
    }
}
// ============ Scopes API ============
class ScopesApi {
    constructor(_api) {
        this._api = _api;
    }
    /**
     * List all access scopes in the project
     */
    async list(options) {
        return this._api.request("GET", "/scopes", undefined, options);
    }
    /**
     * Get an access scope by ID
     */
    async get(scopeId) {
        return this._api.request("GET", `/scopes/${scopeId}`);
    }
    /**
     * Create a new access scope
     */
    async create(data) {
        return this._api.request("POST", "/scopes", data);
    }
    /**
     * Update an access scope
     */
    async update(scopeId, data) {
        return this._api.request("PATCH", `/scopes/${scopeId}`, data);
    }
    /**
     * Delete an access scope
     */
    async delete(scopeId) {
        await this._api.request("DELETE", `/scopes/${scopeId}`);
    }
    /**
     * List actors assigned to a scope
     */
    async listActors(scopeId) {
        return this._api.request("GET", `/scopes/${scopeId}/actors`);
    }
    /**
     * Assign an actor to this scope
     */
    async addActor(scopeId, actorId) {
        return this._api.actors.update(actorId, { accessScopeId: scopeId });
    }
    /**
     * Remove an actor from this scope (unscope it)
     */
    async removeActor(actorId) {
        return this._api.actors.update(actorId, { accessScopeId: null });
    }
}

/**
 * NoLag SDK
 * Real-time messaging for React Native.
 *
 * React Native's WebSocket is the native one and supports
 * `binaryType = "arraybuffer"`, so the transport is identical to the browser
 * build. This entry point exists for two reasons.
 *
 * 1. Metro needs a `react-native` condition to resolve. It matches
 *    "react-native" then "import"/"require", and does not understand the
 *    "browser" condition at all, so without this it resolves the Node build and
 *    tries to bundle `ws` (and with it net, tls and http).
 *
 * 2. The WebRTC module is deliberately excluded. `webrtc/environment.ts` does a
 *    bare require of the Node-only wrtc package. Metro collects dependencies
 *    statically, and `allowOptionalDependencies` defaults to false:
 *    @expo/metro-config turns it on, but bare @react-native/metro-config does
 *    not, so that require fails the bundle on bare React Native while working
 *    under Expo. Rather than ship something that breaks on half the ecosystem,
 *    WebRTC is left out. React Native needs `react-native-webrtc` regardless,
 *    which is a separate piece of work.
 *
 * The core has no other React Native specific behaviour. App lifecycle and
 * network reachability arrive through the `lifecycle` and `network` adapter
 * options; `@nolag/react-native` wires those to AppState and NetInfo for you.
 *
 * Note: `@msgpack/msgpack` constructs `TextEncoder`/`TextDecoder` at module
 * scope, so importing this on a runtime lacking those globals throws on import.
 * `@nolag/react-native` installs a guarded polyfill; if you import this entry
 * directly, make sure they exist.
 */
// NOTE: the WebRTC module is intentionally absent here. See the header.
/**
 * Create a NoLag client for React Native
 *
 * Pass an access token string, or (strongly preferred on mobile) a
 * TokenProvider function that returns a short-lived client token (JWT) minted
 * by your backend. Never ship a long-lived actor access token inside an app
 * bundle: it is extractable from the IPA or APK.
 */
const NoLag = (token, options) => {
    return new NoLag$1(createWebSocket, token, options);
};

export { NoLag, NoLagApi, NoLagApiError, NoLagEncodeError, NoLagServerError, NoLag$1 as NoLagSocket, createDocumentLifecycleAdapter, createWindowNetworkAdapter, NoLag as default };
//# sourceMappingURL=react-native.js.map
