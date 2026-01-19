import {describe, it, expect} from 'vitest';
import {validateAiBill} from './validate';

describe('bill/validate', () => {
    it('should validate correct input', () => {
        const input = {
            billName: 'Test Bill',
            items: [
                {name: 'Item 1', qty: 1, unitPrice: 100},
                {name: 'Item 2', qty: 2, unitPrice: 200},
            ],
            extras: {
                tax: 10,
                tip: 5,
            },
        };
        const result = validateAiBill(input);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.billName).toBe('Test Bill');
        }
    });

    it('should allow minimal input', () => {
        const input = {
            billName: 'Minimal',
            items: [{name: 'I', qty: 1, unitPrice: 1}],
        };
        const result = validateAiBill(input);
        expect(result.ok).toBe(true);
    });

    it('should fail if missing required fields', () => {
        const input = {
            // missing billName
            items: [],
        };
        const result = validateAiBill(input);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors.some(e => e.includes("must have required property 'billName'"))).toBe(
                true
            );
        }
    });

    it('should fail if items is not an array', () => {
        const input = {
            billName: 'Bad Items',
            items: 'not-an-array',
        };
        const result = validateAiBill(input);
        expect(result.ok).toBe(false);
    });

    it('should fail if item is missing fields', () => {
        const input = {
            billName: 'Bad Item',
            items: [{name: 'Incomplete'}], // missing qty, unitPrice
        };
        const result = validateAiBill(input);
        expect(result.ok).toBe(false);
    });
});
