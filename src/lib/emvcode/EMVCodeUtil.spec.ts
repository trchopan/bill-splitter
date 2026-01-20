import {describe, it, expect} from 'vitest';
import {generateQrEmvPayload, crc16CcittFalseHex} from './EMVCodeUtil';

type TlvNode = {
    tag: string;
    len: number;
    value: string;
    valueBytes: Uint8Array;
    start: number; // byte offset in the original buffer
    end: number; // byte offset (exclusive)
};

function asciiFromBytes(bytes: Uint8Array): string {
    return String.fromCharCode(...bytes);
}

function decodeUtf8(bytes: Uint8Array): string {
    return new TextDecoder().decode(bytes);
}

/**
 * Parse EMV-style TLV where:
 * - Tag is 2 ASCII digits
 * - Length is 2 ASCII digits (decimal byte length)
 * - Value is UTF-8 bytes with byte length specified by Length
 *
 * IMPORTANT: This parser uses byte offsets (not JS string slicing),
 * so it is correct for Vietnamese / non-ASCII text.
 */
function parseTlvBytes(buf: Uint8Array, offset = 0, maxBytes?: number): TlvNode[] {
    const out: TlvNode[] = [];
    const end = maxBytes == null ? buf.length : Math.min(buf.length, offset + maxBytes);

    let i = offset;
    while (i < end) {
        if (i + 4 > end) {
            throw new Error(`TLV truncated at byte ${i} (need at least 4 bytes for tag+len)`);
        }

        const tag = asciiFromBytes(buf.slice(i, i + 2));
        const lenStr = asciiFromBytes(buf.slice(i + 2, i + 4));
        if (!/^\d{2}$/.test(tag)) throw new Error(`Invalid TLV tag "${tag}" at byte ${i}`);
        if (!/^\d{2}$/.test(lenStr)) throw new Error(`Invalid TLV length "${lenStr}" at byte ${i}`);

        const len = Number.parseInt(lenStr, 10);
        const valueStart = i + 4;
        const valueEnd = valueStart + len;

        if (valueEnd > end) {
            throw new Error(
                `TLV value overruns buffer: tag=${tag}, len=${len}, start=${valueStart}, end=${valueEnd}, bufEnd=${end}`
            );
        }

        const valueBytes = buf.slice(valueStart, valueEnd);
        const value = decodeUtf8(valueBytes);

        out.push({tag, len, value, valueBytes, start: i, end: valueEnd});
        i = valueEnd;
    }

    return out;
}

function findOne(nodes: TlvNode[], tag: string): TlvNode {
    const hits = nodes.filter(n => n.tag === tag);
    if (hits.length !== 1) {
        throw new Error(`Expected exactly 1 TLV tag ${tag}, found ${hits.length}`);
    }
    return hits[0];
}

function maybeFind(nodes: TlvNode[], tag: string): TlvNode | null {
    const hits = nodes.filter(n => n.tag === tag);
    if (hits.length === 0) return null;
    if (hits.length > 1) throw new Error(`Expected at most 1 TLV tag ${tag}, found ${hits.length}`);
    return hits[0];
}

describe('emvcode payload (TLV structure + CRC)', () => {
    it('should generate a structurally valid EMV payload and CRC must verify', () => {
        const {payload, bank} = generateQrEmvPayload({
            bank: 'VCB',
            accountNumber: '123456789',
            amount: 50000,
            note: 'Test Payment',
        });

        expect(bank.code).toBe('VCB');

        // CRC verification:
        // Payload ends with Tag 63 len 04 + CRC(4 hex).
        // CRC is computed over everything up to (and including) "6304".
        expect(payload).toMatch(/63\d{2}[0-9A-F]{4}$/); // light sanity: ends with tag63 + crc
        expect(payload.slice(-8, -4)).toBe('6304'); // last tag header should be 6304

        const crcActual = payload.slice(-4);
        const crcExpected = crc16CcittFalseHex(payload.slice(0, -4));
        expect(crcActual).toBe(crcExpected);

        // Parse top-level TLV correctly by UTF-8 bytes
        const bytes = new TextEncoder().encode(payload);
        const top = parseTlvBytes(bytes);

        // Required top-level tags (based on your generator)
        expect(findOne(top, '00').value).toBe('01'); // Payload Format Indicator
        expect(findOne(top, '01').value).toBe('12'); // POI method default dynamic

        const t38 = findOne(top, '38');
        const t53 = findOne(top, '53');
        const t54 = findOne(top, '54');
        const t58 = findOne(top, '58');
        const t63 = findOne(top, '63');

        expect(t53.value).toBe('704');
        expect(t54.value).toBe('50000');
        expect(t58.value).toBe('VN');
        expect(t63.value).toMatch(/^[0-9A-F]{4}$/);

        // Tag 38 is nested TLV: 00=GUI, 01=BeneficiaryTemplate
        const inside38 = parseTlvBytes(t38.valueBytes);
        expect(findOne(inside38, '00').value).toBe('A000000727');

        const beneficiaryTemplate = findOne(inside38, '01');
        const insideBeneficiary = parseTlvBytes(beneficiaryTemplate.valueBytes);

        expect(findOne(insideBeneficiary, '00').value).toBe(bank.bin); // bank BIN
        expect(findOne(insideBeneficiary, '01').value).toBe('123456789'); // account number
        expect(findOne(insideBeneficiary, '02').value).toBe('QRIBFTTA'); // service code

        // Tag 62 contains subtag 08 = note
        const t62 = findOne(top, '62');
        const inside62 = parseTlvBytes(t62.valueBytes);
        expect(findOne(inside62, '08').value).toBe('Test Payment');
    });

    it('should omit Tag 62 when note is missing', () => {
        const {payload} = generateQrEmvPayload({
            bank: 'VCB',
            accountNumber: '123',
            amount: 1000,
        });

        // Parse and confirm Tag 62 not present structurally
        const bytes = new TextEncoder().encode(payload);
        const top = parseTlvBytes(bytes);

        expect(maybeFind(top, '62')).toBeNull();

        // CRC still valid
        const crcActual = payload.slice(-4);
        const crcExpected = crc16CcittFalseHex(payload.slice(0, -4));
        expect(crcActual).toBe(crcExpected);
    });

    it('should compute TLV byte lengths correctly for Vietnamese note (UTF-8)', () => {
        const note = 'Xin chào Việt Nam'; // contains diacritics (multi-byte in UTF-8)

        const {payload} = generateQrEmvPayload({
            bank: 'VCB',
            accountNumber: '123456',
            amount: 99000,
            note,
        });

        // Parse TLV by bytes
        const bytes = new TextEncoder().encode(payload);
        const top = parseTlvBytes(bytes);

        const t62 = findOne(top, '62');
        const inside62 = parseTlvBytes(t62.valueBytes);

        const t08 = findOne(inside62, '08');
        expect(t08.value).toBe(note);

        // Assert the length field equals UTF-8 byte length of note
        const expectedByteLen = new TextEncoder().encode(note).length;
        expect(t08.len).toBe(expectedByteLen);

        // CRC must verify
        const crcActual = payload.slice(-4);
        const crcExpected = crc16CcittFalseHex(payload.slice(0, -4));
        expect(crcActual).toBe(crcExpected);
    });
});
