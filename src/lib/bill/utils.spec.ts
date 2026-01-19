import {describe, it, expect} from 'vitest';
import {
    toIntVnd,
    base64UrlEncodeUtf8,
    base64UrlDecodeUtf8,
    computeItemsTotal,
    normalizeAiBill,
    buildSharedBillPayload,
    randomId,
} from './utils';
import type {AiBillInput} from './types';

describe('bill/utils', () => {
    describe('toIntVnd', () => {
        it('should return number as is if integer', () => {
            expect(toIntVnd(100)).toBe(100);
        });

        it('should round float numbers', () => {
            expect(toIntVnd(100.6)).toBe(101);
            expect(toIntVnd(100.2)).toBe(100);
        });

        it('should parse string with commas', () => {
            expect(toIntVnd('1,000')).toBe(1000);
            expect(toIntVnd('25,000,000')).toBe(25000000);
        });

        it('should handle whitespace', () => {
            expect(toIntVnd('  500  ')).toBe(500);
        });

        it('should return 0 for invalid inputs', () => {
            expect(toIntVnd('abc')).toBe(0);
            expect(toIntVnd('')).toBe(0);
            expect(toIntVnd(null)).toBe(0);
            expect(toIntVnd(undefined)).toBe(0);
        });
    });

    describe('base64UrlEncode/Decode', () => {
        it('should encode and decode simple ascii', () => {
            const original = 'Hello World';
            const encoded = base64UrlEncodeUtf8(original);
            expect(base64UrlDecodeUtf8(encoded)).toBe(original);
        });

        it('should encode and decode utf8 (Vietnamese)', () => {
            const original = 'Xin chào Việt Nam';
            const encoded = base64UrlEncodeUtf8(original);
            expect(base64UrlDecodeUtf8(encoded)).toBe(original);
        });

        it('should be URL safe (no +, /, =)', () => {
            const input = '???>>>'; // triggers + and / in standard base64
            const encoded = base64UrlEncodeUtf8(input);
            expect(encoded).not.toContain('+');
            expect(encoded).not.toContain('/');
            expect(encoded).not.toContain('=');
        });
    });

    describe('computeItemsTotal', () => {
        it('should sum quantity * unitPrice', () => {
            const items = [
                {qty: 2, unitPrice: 100},
                {qty: 1, unitPrice: 50},
            ];
            expect(computeItemsTotal(items)).toBe(250);
        });

        it('should round inputs before summing', () => {
            const items = [
                {qty: 1.5, unitPrice: 100}, // rounds to 2 * 100 = 200
            ];
            expect(computeItemsTotal(items)).toBe(200);
        });
    });

    describe('normalizeAiBill', () => {
        it('should normalize valid input', () => {
            const input: AiBillInput = {
                billName: '  Lunch  ',
                items: [{name: ' Pho ', qty: 2, unitPrice: 50000}],
                extras: {tax: 10000},
            };
            const result = normalizeAiBill(input);
            expect(result.billName).toBe('Lunch');
            expect(result.items[0].name).toBe('Pho');
            expect(result.items[0].qty).toBe(2);
            expect(result.items[0].unitPrice).toBe(50000);
            expect(result.extras?.tax).toBe(10000);
        });

        it('should handle string numbers in items', () => {
            const input = {
                billName: 'Test',
                items: [{name: 'Item', qty: '2', unitPrice: '10,000'}],
            } as any;
            const result = normalizeAiBill(input);
            expect(result.items[0].qty).toBe(2);
            expect(result.items[0].unitPrice).toBe(10000);
        });

        it('should provide default bill name if empty', () => {
            const result = normalizeAiBill({billName: '', items: []});
            expect(result.billName).toBe('Bill');
        });

        it('should handle undefined extras', () => {
            const result = normalizeAiBill({billName: 'B', items: []});
            expect(result.extras).toBeUndefined();
        });
    });

    describe('buildSharedBillPayload', () => {
        it('should structure the payload correctly', () => {
            const ai: AiBillInput = {
                billName: 'Dinner',
                items: [{name: 'Rice', qty: 1, unitPrice: 5000}],
            };
            const payload = buildSharedBillPayload({
                ai,
                ownerBank: 'VCB',
                ownerAccountNumber: '123456',
            });

            expect(payload.v).toBe(1);
            expect(payload.billName).toBe('Dinner');
            expect(payload.owner.bank).toBe('VCB');
            expect(payload.owner.accountNumber).toBe('123456');
            expect(payload.items).toHaveLength(1);
            expect(payload.items[0].id).toBeDefined();
            expect(payload.items[0].name).toBe('Rice');
        });

        it('should remove spaces from account number', () => {
            const payload = buildSharedBillPayload({
                ai: {billName: 'A', items: []},
                ownerBank: 'B',
                ownerAccountNumber: '123 456',
            });
            expect(payload.owner.accountNumber).toBe('123456');
        });
    });

    describe('randomId', () => {
        it('should generate string of requested length', () => {
            expect(randomId(10)).toHaveLength(10);
            expect(randomId(5)).toHaveLength(5);
        });

        it('should generate different ids', () => {
            expect(randomId()).not.toBe(randomId());
        });
    });
});
