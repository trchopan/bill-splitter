import type {SharedBillPayload} from './types';

export function validateSharedBill(
    data: unknown
): {ok: true; value: SharedBillPayload} | {ok: false; errors: string[]} {
    const errs: string[] = [];

    if (!data || typeof data !== 'object')
        return {ok: false, errors: ['Payload is not an object.']};
    const d = data as any;

    if (d.v !== 1) errs.push('v must be 1');
    if (typeof d.billName !== 'string' || d.billName.trim().length === 0)
        errs.push('billName must be a non-empty string');

    if (!d.owner || typeof d.owner !== 'object') errs.push('owner is required');
    else {
        if (typeof d.owner.bank !== 'string' || d.owner.bank.trim().length === 0)
            errs.push('owner.bank is required');
        if (
            typeof d.owner.accountNumber !== 'string' ||
            d.owner.accountNumber.replace(/\s+/g, '').length === 0
        )
            errs.push('owner.accountNumber is required');
    }

    if (!Array.isArray(d.items) || d.items.length === 0)
        errs.push('items must be a non-empty array');
    else {
        for (const [idx, it] of d.items.entries()) {
            if (!it || typeof it !== 'object') {
                errs.push(`items[${idx}] is not an object`);
                continue;
            }
            if (typeof it.id !== 'string' || it.id.length === 0)
                errs.push(`items[${idx}].id is required`);
            if (typeof it.name !== 'string' || it.name.trim().length === 0)
                errs.push(`items[${idx}].name is required`);
            if (!Number.isInteger(it.qty) || it.qty < 1)
                errs.push(`items[${idx}].qty must be an integer >= 1`);
            if (!Number.isInteger(it.unitPrice) || it.unitPrice < 0)
                errs.push(`items[${idx}].unitPrice must be an integer >= 0`);
        }
    }

    if (d.extras != null) {
        if (typeof d.extras !== 'object') errs.push('extras must be an object');
        else {
            for (const k of ['tax', 'tip', 'discount'] as const) {
                if (d.extras[k] != null && (!Number.isInteger(d.extras[k]) || d.extras[k] < 0)) {
                    errs.push(`extras.${k} must be an integer >= 0`);
                }
            }
        }
    }

    if (errs.length) return {ok: false, errors: errs};
    return {ok: true, value: d as SharedBillPayload};
}
