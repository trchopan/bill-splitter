import type {PageLoad} from './$types';
import {base64UrlDecodeUtf8} from '$lib/bill/utils';
import {validateSharedBill} from '$lib/bill/shared-validate';

export const load: PageLoad = ({url}) => {
    const b = url.searchParams.get('b');
    if (!b) {
        return {ok: false as const, errors: ['Missing query parameter: b'], shared: null};
    }

    let decoded: string;
    try {
        decoded = base64UrlDecodeUtf8(b);
    } catch {
        return {ok: false as const, errors: ['Invalid base64url payload in b'], shared: null};
    }

    let obj: unknown;
    try {
        obj = JSON.parse(decoded);
    } catch {
        return {ok: false as const, errors: ['Decoded payload is not valid JSON'], shared: null};
    }

    const res = validateSharedBill(obj);
    if (!res.ok) return {ok: false as const, errors: res.errors, shared: null};

    return {ok: true as const, errors: [] as string[], shared: res.value};
};
