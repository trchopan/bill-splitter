import LZString from 'lz-string';

export type SplitMode = 'individual' | 'even';

export type SplitConfig = {
    mode: SplitMode;
    payers: string[]; // list of payer names in display order
    assignments?: Record<string, string[]>; // itemId -> payerNames[]
};

export function encodeConfigParam(config: SplitConfig): string {
    const obj: any = {
        mode: config.mode,
        payers: config.payers,
    };
    if (config.mode === 'individual') obj.assignments = config.assignments ?? {};
    return LZString.compressToEncodedURIComponent(JSON.stringify(obj));
}

/**
 * Safe parser for `c` query parameter.
 * - Returns null on any invalid input.
 * - Normalizes:
 *   - mode defaults to 'individual' unless explicitly 'even'
 *   - payers: keeps only non-empty strings
 *   - assignments: keeps only string[] entries with non-empty strings
 */
export function safeParseConfig(encoded?: string | null): SplitConfig | null {
    if (!encoded) return null;
    try {
        const json = LZString.decompressFromEncodedURIComponent(encoded);
        if (!json) return null;
        const obj: any = JSON.parse(json);
        if (!obj || typeof obj !== 'object') return null;

        const mode: SplitMode = obj.mode === 'even' ? 'even' : 'individual';

        const payers = Array.isArray(obj.payers)
            ? obj.payers.filter((p: any) => typeof p === 'string' && p.trim().length > 0)
            : [];

        let assignments: Record<string, string[]> | undefined = undefined;
        if (obj.assignments && typeof obj.assignments === 'object') {
            const a: Record<string, string[]> = {};
            for (const [itemId, val] of Object.entries(obj.assignments)) {
                if (Array.isArray(val)) {
                    a[itemId] = val.filter(
                        (x: any) => typeof x === 'string' && x.trim().length > 0
                    );
                } else {
                    // ignore non-arrays (keeps parser strict and safe)
                    a[itemId] = [];
                }
            }
            assignments = a;
        }

        return {mode, payers, assignments};
    } catch {
        return null;
    }
}
