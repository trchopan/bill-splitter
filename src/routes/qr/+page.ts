import type {PageLoad} from './$types';
import LZString from 'lz-string';

export const load: PageLoad = ({url}) => {
    const d = url.searchParams.get('d');
    if (!d) {
        return {
            ok: false as const,
            errors: ['Missing query parameter: d'],
            payload: null as string | null,
        };
    }

    let payload: string | null = null;
    try {
        payload = LZString.decompressFromEncodedURIComponent(d);
    } catch {
        // ignore
    }

    if (!payload) {
        return {ok: false as const, errors: ['Invalid compressed payload in d'], payload: null};
    }

    // Very light sanity checks (don’t overdo edge cases in v1)
    if (payload.length < 10) {
        return {ok: false as const, errors: ['Decoded payload is too short'], payload: null};
    }

    // EMV payload usually starts with "0002" + "01", but we won't enforce strictly.
    return {ok: true as const, errors: [] as string[], payload};
};
