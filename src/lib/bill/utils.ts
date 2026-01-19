import type {AiBillInput, SharedBillPayload} from './types';

export function randomId(len = 10): string {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let out = '';
    crypto.getRandomValues(new Uint8Array(len)).forEach(b => {
        out += chars[b % chars.length];
    });
    return out;
}

export function toIntVnd(value: unknown): number {
    // Accept numbers or numeric strings like "25000"
    if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
    if (typeof value === 'string' && value.trim() !== '') {
        const n = Number(value.replace(/,/g, '').trim());
        if (Number.isFinite(n)) return Math.round(n);
    }
    return 0;
}

export function base64UrlEncodeUtf8(str: string): string {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlDecodeUtf8(b64url: string): string {
    const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64url.length + 3) % 4);
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

export function computeItemsTotal(items: Array<{qty: number; unitPrice: number}>): number {
    return items.reduce((sum, it) => sum + Math.round(it.qty) * Math.round(it.unitPrice), 0);
}

export function normalizeAiBill(ai: AiBillInput): AiBillInput {
    return {
        billName: String(ai.billName ?? '').trim() || 'Bill',
        items: (ai.items ?? []).map(it => ({
            name: String(it.name ?? '').trim(),
            qty: Math.max(1, Math.round(toIntVnd(it.qty))), // qty should already be integer, but keep safe
            unitPrice: Math.max(0, toIntVnd(it.unitPrice)),
        })),
        extras: ai.extras
            ? {
                  tax: ai.extras.tax != null ? Math.max(0, toIntVnd(ai.extras.tax)) : undefined,
                  tip: ai.extras.tip != null ? Math.max(0, toIntVnd(ai.extras.tip)) : undefined,
                  discount:
                      ai.extras.discount != null
                          ? Math.max(0, toIntVnd(ai.extras.discount))
                          : undefined,
              }
            : undefined,
    };
}

export function buildSharedBillPayload(args: {
    ai: AiBillInput;
    ownerBank: string;
    ownerAccountNumber: string;
}): SharedBillPayload {
    const aiNorm = normalizeAiBill(args.ai);

    return {
        v: 1,
        billName: aiNorm.billName,
        countryCode: 'VN',
        currencyNumeric: '704',
        owner: {
            bank: args.ownerBank.trim(),
            accountNumber: args.ownerAccountNumber.replace(/\s+/g, ''),
        },
        items: aiNorm.items.map(it => ({
            id: randomId(10),
            name: it.name,
            qty: it.qty,
            unitPrice: it.unitPrice,
        })),
        extras: aiNorm.extras,
    };
}
