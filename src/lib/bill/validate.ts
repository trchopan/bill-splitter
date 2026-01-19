import Ajv from 'ajv/dist/2020';
import {receiptBillSchema} from './schema';
import type {AiBillInput} from './types';

const ajv = new Ajv({allErrors: true, allowUnionTypes: true});

const validateFn = ajv.compile(receiptBillSchema);

export function validateAiBill(
    data: unknown
): {ok: true; value: AiBillInput} | {ok: false; errors: string[]} {
    const ok = validateFn(data);
    if (ok) return {ok: true, value: data as AiBillInput};

    const errors = validateFn.errors?.map(e => {
        const path = e.instancePath || '(root)';
        return `${path} ${e.message ?? 'is invalid'}`;
    }) ?? ['Invalid JSON'];

    return {ok: false, errors};
}
