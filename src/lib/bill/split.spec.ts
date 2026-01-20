import {describe, it, expect} from 'vitest';
import {
    splitEvenly,
    computeItemsSubtotal,
    computeExtrasNet,
    computePayerSubtotals,
    computePayerTotals,
    type SplitConfig,
} from './split';

describe('bill/split', () => {
    it('splitEvenly should distribute remainder to first payer(s)', () => {
        const shares = splitEvenly(1001, ['Alice', 'Bob']);
        expect(shares).toEqual({Alice: 501, Bob: 500});

        const shares3 = splitEvenly(10, ['A', 'B', 'C']);
        // base=3 rem=1 => A=4, B=3, C=3
        expect(shares3).toEqual({A: 4, B: 3, C: 3});
    });

    it('computeItemsSubtotal should sum qty * unitPrice', () => {
        const shared = {
            items: [
                {id: 'a', name: 'A', qty: 2, unitPrice: 100},
                {id: 'b', name: 'B', qty: 1, unitPrice: 50},
            ],
        };
        expect(computeItemsSubtotal(shared)).toBe(250);
    });

    it('computeExtrasNet should compute tax + tip - discount', () => {
        const shared = {items: [], extras: {tax: 10, tip: 5, discount: 3}};
        expect(computeExtrasNet(shared)).toBe(12);
    });

    it('computePayerSubtotals (individual) should split items among assigned payers', () => {
        const shared = {
            items: [
                {id: 'pizza', name: 'Pizza', qty: 1, unitPrice: 1000}, // 1000
                {id: 'coke', name: 'Coke', qty: 3, unitPrice: 500}, // 1500
            ],
            extras: {tax: 0, tip: 0, discount: 0},
        };

        const config: SplitConfig = {
            mode: 'individual',
            payers: ['Alice', 'Bob'],
            assignments: {
                // pizza shared => 500/500
                pizza: ['Alice', 'Bob'],
                // coke only Alice => 1500
                coke: ['Alice'],
            },
        };

        const subtotals = computePayerSubtotals(shared, config);
        expect(subtotals).toEqual({Alice: 2000, Bob: 500});
    });

    it('computePayerSubtotals (individual) should fallback to first payer when assignment is empty/invalid', () => {
        const shared = {
            items: [{id: 'x', name: 'X', qty: 1, unitPrice: 999}],
            extras: {tax: 0, tip: 0, discount: 0},
        };

        const config: SplitConfig = {
            mode: 'individual',
            payers: ['Alice', 'Bob'],
            assignments: {
                x: [], // empty assignment -> fallback to Alice
            },
        };

        expect(computePayerSubtotals(shared, config)).toEqual({Alice: 999, Bob: 0});
    });

    it('computePayerSubtotals (even) should split subtotal evenly', () => {
        const shared = {
            items: [
                {id: 'a', name: 'A', qty: 1, unitPrice: 1001}, // 1001
            ],
            extras: {tax: 0, tip: 0, discount: 0},
        };

        const config: SplitConfig = {mode: 'even', payers: ['Alice', 'Bob']};

        // 1001 => 501 + 500
        expect(computePayerSubtotals(shared, config)).toEqual({Alice: 501, Bob: 500});
    });

    it('computePayerTotals should allocate extras proportionally and fix rounding diff', () => {
        const shared = {
            items: [
                {id: 'a', name: 'A', qty: 1, unitPrice: 1000}, // 1000
                {id: 'b', name: 'B', qty: 1, unitPrice: 1000}, // 1000
            ],
            extras: {tax: 1, tip: 0, discount: 0}, // extrasNet = 1, grand = 2001
        };

        const config: SplitConfig = {
            mode: 'individual',
            payers: ['Alice', 'Bob'],
            assignments: {
                a: ['Alice'],
                b: ['Bob'],
            },
        };

        const totals = computePayerTotals(shared, config);

        // With extrasNet=1 and equal subtotals:
        // each share = round(0.5) = 1 => initial totals 1001/1001 (sum 2002)
        // diff fix applies -1 to first payer => Alice=1000, Bob=1001
        expect(totals.Alice + totals.Bob).toBe(2001);
        expect(totals).toEqual({Alice: 1000, Bob: 1001});
    });

    it('computePayerTotals should split extras evenly if itemsSubtotal is 0', () => {
        const shared = {
            items: [],
            extras: {tax: 0, tip: 5, discount: 0}, // extrasNet=5
        };
        const config: SplitConfig = {mode: 'even', payers: ['A', 'B']};

        // 5 => 3 + 2 (remainder to first)
        expect(computePayerTotals(shared, config)).toEqual({A: 3, B: 2});
    });
});
