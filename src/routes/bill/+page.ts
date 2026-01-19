import type {PageLoad} from './$types';
import {validateSharedBill} from '$lib/bill/shared-validate';
import {decodeFromUrl} from '$lib/bill/codec';

export const load: PageLoad = ({url}) => {
    const b = url.searchParams.get('b');
    if (!b) {
        return {ok: false as const, errors: ['Missing query parameter: b'], shared: null};
    }

    let shared: any;
    try {
        shared = decodeFromUrl(b);
    } catch (e: any) {
        return {ok: false as const, errors: ['Invalid bill payload: ' + e.message], shared: null};
    }

    const res = validateSharedBill(shared);
    if (!res.ok) return {ok: false as const, errors: res.errors, shared: null};

    return {ok: true as const, errors: [] as string[], shared: res.value};
};
