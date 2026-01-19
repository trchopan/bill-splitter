import {describe, it, expect} from 'vitest';
import {
    resolveBankBin,
    crc16CcittFalseHex,
    generateQrEmvPayload,
    type BankInput,
} from './EMVCodeUtil';

describe('emvcode/EMVCodeUtil', () => {
    describe('resolveBankBin', () => {
        it('should resolve by shortName', () => {
            const bank = resolveBankBin('Vietcombank');
            expect(bank.bin).toBe('970436');
            expect(bank.code).toBe('VCB');
        });

        it('should resolve by code', () => {
            const bank = resolveBankBin('VCB');
            expect(bank.bin).toBe('970436');
        });

        it('should resolve case insensitive', () => {
            const bank = resolveBankBin('vcb');
            expect(bank.bin).toBe('970436');
        });

        it('should resolve by fuzzy name match', () => {
            const bank = resolveBankBin('Ngoai Thuong');
            expect(bank.bin).toBe('970436');
        });

        it('should throw error for unknown bank', () => {
            expect(() => resolveBankBin('UnknownBank123')).toThrow(/Unknown bank/);
        });
    });

    describe('crc16CcittFalseHex', () => {
        it('should compute correct CRC', () => {
            // Example from standard or known calculation
            // "123456789" -> CRC-16/CCITT-FALSE is 0x29B1
            expect(crc16CcittFalseHex('123456789')).toBe('29B1');
        });
    });

    describe('generateQrEmvPayload', () => {
        it('should generate a valid payload string', () => {
            const input: BankInput = {
                bank: 'VCB',
                accountNumber: '123456789',
                amount: 50000,
                note: 'Test Payment',
            };
            const {payload, bank} = generateQrEmvPayload(input);

            expect(bank.code).toBe('VCB');
            expect(payload).toBeDefined();
            // Basic structure checks
            expect(payload.startsWith('000201')).toBe(true); // Format Indicator
            expect(payload.includes('010212')).toBe(true); // POI Method dynamic
            // Check for amount tag 54
            // Length of "50000" is 5. So "540550000"
            expect(payload.includes('540550000')).toBe(true);
            // Check for note tag 62.
            // Subtag 08. "Test Payment" length 12 -> "0812Test Payment"
            // Total length 16 -> "62160812Test Payment"
            expect(payload.includes('62160812Test Payment')).toBe(true);
            // Check CRC tag 63 at the end
            expect(payload.slice(-4)).toMatch(/^[0-9A-F]{4}$/);
        });

        it('should handle missing note', () => {
            const input: BankInput = {
                bank: 'VCB',
                accountNumber: '123',
                amount: 1000,
            };
            const {payload} = generateQrEmvPayload(input);
            expect(payload).not.toContain('62'); // No additional data tag
        });

        it('should throw if amount is invalid', () => {
            expect(() =>
                generateQrEmvPayload({
                    bank: 'VCB',
                    accountNumber: '123',
                    amount: '100.5', // Must be integer
                })
            ).toThrow(/amount must be an integer/);
        });
    });
});
