import {describe, it, expect} from 'vitest';
import {generateQrEmvPayload, crc16CcittFalseHexLower} from './EMVCodeUtil';

type TlvNode = {
    tag: string;
    len: number; // graphemes length
    value: string;
    start: number; // JS string index (UTF-16 code units)
    end: number; // JS string index (exclusive)
};

/**
 * Grapheme-aware utilities.
 */
function graphemeSegments(str: string): {segment: string; index: number}[] {
    const AnyIntl: any = Intl as any;
    if (typeof AnyIntl?.Segmenter === 'function') {
        const seg = new AnyIntl.Segmenter(undefined, {granularity: 'grapheme'});
        // segment() returns iterable with {segment, index, isWordLike}
        return Array.from(seg.segment(str), (x: any) => ({segment: x.segment, index: x.index}));
    }
    // Fallback: code points (close enough for most cases)
    const out: {segment: string; index: number}[] = [];
    let i = 0;
    for (const ch of Array.from(str)) {
        out.push({segment: ch, index: i});
        i += ch.length; // ch.length is 2 for surrogate pairs, else 1
    }
    return out;
}

function graphemeLength(str: string): number {
    return graphemeSegments(str).length;
}

/**
 * Slice by grapheme count from a given JS string index.
 * Returns [slice, newIndex].
 */
function sliceByGraphemes(str: string, startIndex: number, count: number): [string, number] {
    if (count <= 0) return ['', startIndex];

    const tail = str.slice(startIndex);
    const segs = graphemeSegments(tail);

    if (count > segs.length) {
        throw new Error(
            `sliceByGraphemes overrun: need ${count} graphemes from index=${startIndex}, but only ${segs.length} available`
        );
    }

    const endInTail = count === segs.length ? tail.length : segs[count].index; // index of the (count+1)th segment start

    const slice = tail.slice(0, endInTail);
    return [slice, startIndex + endInTail];
}

/**
 * Parse EMV TLV where:
 * - Tag is 2 chars (digits)
 * - Length is 2 digits (we assume < 100 in tests)
 * - Value length is in GRAPHEMES, not UTF-8 bytes
 */
function parseTlv(payload: string, offset = 0, maxChars?: number): TlvNode[] {
    const out: TlvNode[] = [];

    const payloadEnd =
        maxChars == null ? payload.length : Math.min(payload.length, offset + maxChars);
    let i = offset;

    while (i < payloadEnd) {
        if (i + 4 > payloadEnd) {
            throw new Error(`TLV truncated at index ${i} (need at least 4 chars for tag+len)`);
        }

        const tag = payload.slice(i, i + 2);
        const lenStr = payload.slice(i + 2, i + 4);

        if (!/^\d{2}$/.test(tag)) throw new Error(`Invalid TLV tag "${tag}" at index ${i}`);
        if (!/^\d{2}$/.test(lenStr))
            throw new Error(`Invalid TLV length "${lenStr}" at index ${i}`);

        const len = Number.parseInt(lenStr, 10);
        const valueStart = i + 4;

        const [value, valueEnd] = sliceByGraphemes(payload, valueStart, len);

        out.push({tag, len, value, start: i, end: valueEnd});
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

describe('emvcode payload (compatible TLV structure + CRC)', () => {
    it('should generate a structurally valid EMV payload and CRC must verify', () => {
        const {payload, bank} = generateQrEmvPayload({
            bank: 'VCB',
            accountNumber: '123456789',
            amount: 50000,
            note: 'Test Payment',
            countryCode: 'VN',
        });

        expect(bank.code).toBe('VCB');

        // CRC verification:
        // Payload ends with Tag 63 len 04 + CRC(4 hex).
        // CRC is computed over everything up to (and including) "6304".
        expect(payload).toMatch(/6304[0-9a-f]{4}$/);
        expect(payload.slice(-8, -4)).toBe('6304');

        const crcActual = payload.slice(-4);
        const crcExpected = crc16CcittFalseHexLower(payload.slice(0, -4));
        expect(crcActual).toBe(crcExpected);

        // Parse top-level TLV using graphemes
        const top = parseTlv(payload);

        expect(findOne(top, '00').value).toBe('01'); // Payload Format Indicator
        expect(findOne(top, '01').value).toBe('12'); // hardcoded

        const t38 = findOne(top, '38');
        const t53 = findOne(top, '53');
        const t54 = findOne(top, '54');
        const t58 = findOne(top, '58');
        const t62 = findOne(top, '62');
        const t63 = findOne(top, '63');

        expect(t53.value).toBe('704'); // hardcoded
        expect(t54.value).toBe('50000');
        expect(t58.value).toBe('VN');
        expect(t63.value).toMatch(/^[0-9a-f]{4}$/);

        // Tag 38 is nested TLV: 00=GUI, 01=BeneficiaryTemplate
        const inside38 = parseTlv(t38.value);
        expect(findOne(inside38, '00').value).toBe('A000000727');

        const beneficiaryTemplate = findOne(inside38, '01');
        const insideBeneficiary = parseTlv(beneficiaryTemplate.value);

        expect(findOne(insideBeneficiary, '00').value).toBe(bank.bin); // bank BIN
        expect(findOne(insideBeneficiary, '01').value).toBe('123456789'); // account number
        expect(findOne(insideBeneficiary, '02').value).toBe('QRIBFTTA'); // service code

        // Tag 62 contains subtag 08 = note
        const inside62 = parseTlv(t62.value);
        expect(findOne(inside62, '08').value).toBe('Test Payment');
    });

    it('should ALWAYS include Tag 62 and include subtag 08 even when note is missing', () => {
        const {payload} = generateQrEmvPayload({
            bank: 'VCB',
            accountNumber: '123',
            amount: 1000,
            // note omitted
            // countryCode omitted (defaults)
        });

        const top = parseTlv(payload);

        const t62 = findOne(top, '62'); // must exist
        const inside62 = parseTlv(t62.value);

        const t08 = findOne(inside62, '08');
        expect(t08.value).toBe(''); // empty note becomes 0800
        expect(t08.len).toBe(0);

        // CRC still valid
        const crcActual = payload.slice(-4);
        const crcExpected = crc16CcittFalseHexLower(payload.slice(0, -4));
        expect(crcActual).toBe(crcExpected);
    });

    it('should compute TLV lengths as grapheme length for Vietnamese note', () => {
        const note = 'Xin chào Việt Nam'; // contains diacritics

        const {payload} = generateQrEmvPayload({
            bank: 'VCB',
            accountNumber: '123456',
            amount: 99000,
            note,
            countryCode: 'VN',
        });

        const top = parseTlv(payload);
        const t62 = findOne(top, '62');
        const inside62 = parseTlv(t62.value);
        const t08 = findOne(inside62, '08');

        expect(t08.value).toBe(note);

        // Assert the length field equals grapheme length (NOT UTF-8 byte length)
        const expectedGraphemeLen = graphemeLength(note);
        expect(t08.len).toBe(expectedGraphemeLen);

        // CRC must verify
        const crcActual = payload.slice(-4);
        const crcExpected = crc16CcittFalseHexLower(payload.slice(0, -4));
        expect(crcActual).toBe(crcExpected);
    });
});
