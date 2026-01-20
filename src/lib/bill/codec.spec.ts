import {describe, it, expect} from 'vitest';
import {encodeForUrl, decodeFromUrl} from './codec';
import type {SharedBillPayload} from './types';

describe('bill/codec', () => {
    it('should round-trip encode/decode a realistic payload', () => {
        const payload: SharedBillPayload = {
            v: 1,
            billName: "Pizza 4P's",
            countryCode: 'VN',
            currencyNumeric: '704',
            owner: {bank: 'VCB', accountNumber: '0511000420488'},
            items: [
                {id: 'i1', name: 'Margherita Pizza', qty: 1, unitPrice: 189000},
                {id: 'i2', name: 'Coke', qty: 3, unitPrice: 25000},
            ],
            extras: {tax: 0, tip: 50000, discount: 20000},
        };

        const token = encodeForUrl(payload);

        // URL-safe: no + / =
        expect(token).not.toContain('+');
        expect(token).not.toContain('/');
        expect(token).not.toContain('=');

        const decoded = decodeFromUrl(token);
        expect(decoded).toEqual(payload);
    });

    it('should throw on invalid or corrupted tokens', () => {
        const payload: SharedBillPayload = {
            v: 1,
            billName: 'Test',
            countryCode: 'VN',
            currencyNumeric: '704',
            owner: {bank: 'VCB', accountNumber: '123'},
            items: [{id: 'x', name: 'Item', qty: 1, unitPrice: 1}],
        };

        const token = encodeForUrl(payload);

        // 1) invalid base64url characters => atob() should throw
        expect(() => decodeFromUrl('***NOT_BASE64URL***')).toThrow();

        // 2) truncate (almost guaranteed to break inflate/msgpack)
        expect(() => decodeFromUrl(token.slice(0, Math.max(1, token.length - 5)))).toThrow();

        // 3) wrong-but-valid base64url string (might or might not throw depending on bytes),
        // so we only assert it does NOT equal the original if it doesn't throw.
        const mutated = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
        try {
            const decoded = decodeFromUrl(mutated);
            expect(decoded).not.toEqual(payload);
        } catch {
            // also acceptable: many mutations will throw
        }
    });

    it('should throw on unsupported schema version', () => {
        const payloadV2 = {
            v: 2, // invalid / unsupported
            billName: 'Future Bill',
            countryCode: 'VN',
            currencyNumeric: '704',
            owner: {bank: 'VCB', accountNumber: '123'},
            items: [{id: 'x', name: 'Item', qty: 1, unitPrice: 1}],
        } as any;

        const token = encodeForUrl(payloadV2);
        expect(() => decodeFromUrl(token)).toThrow(/Unsupported schema version/i);
    });
});
