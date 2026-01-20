import {describe, it, expect} from 'vitest';
import {encodeConfigParam, safeParseConfig, type SplitConfig} from './config';

describe('bill/config (c param)', () => {
    it('safeParseConfig should return null for missing/invalid inputs', () => {
        expect(safeParseConfig(null)).toBeNull();
        expect(safeParseConfig(undefined)).toBeNull();
        expect(safeParseConfig('')).toBeNull();

        // not a valid compressed string (or decompresses to null)
        expect(safeParseConfig('***NOT_LZ***')).toBeNull();
    });

    it('should parse and normalize a valid individual config', () => {
        const config: SplitConfig = {
            mode: 'individual',
            payers: ['Alice', 'Bob'],
            assignments: {
                pizza: ['Alice', 'Bob'],
                coke: ['Alice'],
            },
        };

        const encoded = encodeConfigParam(config);
        const parsed = safeParseConfig(encoded);

        expect(parsed).toEqual(config);
    });

    it('should parse even mode and ignore assignments when absent', () => {
        const config: SplitConfig = {
            mode: 'even',
            payers: ['A', 'B', 'C'],
        };

        const encoded = encodeConfigParam(config);
        const parsed = safeParseConfig(encoded);

        expect(parsed).toEqual({
            mode: 'even',
            payers: ['A', 'B', 'C'],
            assignments: undefined,
        });
    });

    it('should sanitize payers and assignments', () => {
        // Build a config object with junk (use individual so assignments are included)
        const raw: any = {
            mode: 'individual',
            payers: ['  Alice  ', '', 123, 'Bob', '   '],
            assignments: {
                a: ['Alice', '', '  ', 5, 'Bob'],
                b: 'not-an-array',
            },
        };

        const encoded = encodeConfigParam(raw as SplitConfig);
        const parsed = safeParseConfig(encoded);

        expect(parsed?.mode).toBe('individual');

        // payers keep only non-empty strings (and do NOT trim content in current policy)
        expect(parsed?.payers).toEqual(['  Alice  ', 'Bob']);

        // assignments keeps only arrays of strings; trims empties
        expect(parsed?.assignments?.a).toEqual(['Alice', 'Bob']);

        // non-array assignment becomes []
        expect(parsed?.assignments?.b).toEqual([]);
    });
});
