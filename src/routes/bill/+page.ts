import type {PageLoad} from './$types';
import {validateSharedBill} from '$lib/bill/shared-validate';
import {decodeFromUrl} from '$lib/bill/codec';
import LZString from 'lz-string';

export type SplitMode = 'individual' | 'even';

export type SplitConfig = {
    mode: SplitMode;
    payers: string[]; // list of payer names in display order
    assignments?: Record<string, string[]>; // itemId -> payerNames[]
};

function safeParseConfig(encoded?: string | null): SplitConfig | null {
    if (!encoded) return null;
    try {
        const json = LZString.decompressFromEncodedURIComponent(encoded);
        if (!json) return null;
        const obj: SplitConfig = JSON.parse(json);
        if (!obj || typeof obj !== 'object') return null;

        const mode = obj.mode === 'even' ? 'even' : 'individual';

        const payers = Array.isArray(obj.payers)
            ? obj.payers.filter((p: any) => typeof p === 'string' && p.trim().length > 0)
            : [];

        let assignments: Record<string, string[]> | undefined = undefined;
        if (obj.assignments && typeof obj.assignments === 'object') {
            const a: Record<string, string[]> = {};
            for (const [itemId, val] of Object.entries(obj.assignments)) {
                a[itemId] = val.filter(x => typeof x === 'string' && x.trim().length > 0);
            }
            assignments = a;
        }

        return {mode, payers, assignments};
    } catch {
        return null;
    }
}

export const load: PageLoad = ({url}) => {
    const b = url.searchParams.get('b');
    if (!b) {
        return {
            ok: false as const,
            errors: ['Missing query parameter: b'],
            shared: null,
            config: null,
        };
    }

    let shared: any;
    try {
        shared = decodeFromUrl(b);
    } catch (e: any) {
        return {
            ok: false as const,
            errors: ['Invalid bill payload: ' + e.message],
            shared: null,
            config: null,
        };
    }

    const res = validateSharedBill(shared);
    if (!res.ok) return {ok: false as const, errors: res.errors, shared: null, config: null};

    const c = url.searchParams.get('c');
    const config = safeParseConfig(c);

    return {ok: true as const, errors: [] as string[], shared: res.value, config};
};
