export type SplitMode = 'individual' | 'even';

export type SplitConfig = {
    mode: SplitMode;
    payers: string[]; // display order matters
    assignments?: Record<string, string[]>; // itemId -> payerNames[] (only for individual)
};

export type SharedBill = {
    items: Array<{id: string; name: string; qty: number; unitPrice: number}>;
    extras?: {tax?: number; tip?: number; discount?: number};
};

export function computeItemsSubtotal(shared: SharedBill | null): number {
    if (!shared) return 0;
    return shared.items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
}

export function computeExtrasNet(shared: SharedBill | null): number {
    if (!shared || !shared.extras) return 0;
    return (shared.extras.tax ?? 0) + (shared.extras.tip ?? 0) - (shared.extras.discount ?? 0);
}

/**
 * Split an integer line total among payers as integers.
 * Remainder is given to the earliest payer in payer order.
 */
export function splitEvenly(lineTotal: number, payers: string[]): Record<string, number> {
    const out: Record<string, number> = {};
    const k = Math.max(1, payers.length);

    const base = Math.floor(lineTotal / k);
    let rem = lineTotal - base * k;

    for (const p of payers) {
        out[p] = base + (rem > 0 ? 1 : 0);
        rem--;
    }
    return out;
}

/**
 * Returns per-payer subtotal (items only) as integers.
 *
 * - individual: each item can be assigned to 1+ payers, and the item line total is split evenly
 * - even: total items subtotal is split evenly across all payers
 *
 * If an item has no valid payer assignment, it falls back to the first payer (if any).
 */
export function computePayerSubtotals(
    shared: SharedBill | null,
    config: SplitConfig
): Record<string, number> {
    const result: Record<string, number> = {};
    for (const p of config.payers) result[p] = 0;

    if (!shared) return result;

    if (config.mode === 'individual') {
        for (const it of shared.items) {
            const assignedRaw =
                config.assignments?.[it.id] && config.assignments?.[it.id]!.length > 0
                    ? config.assignments![it.id]!
                    : config.payers[0]
                      ? [config.payers[0]]
                      : [];

            // keep only payers that still exist
            const assigned = assignedRaw.filter(p => config.payers.includes(p));
            const finalAssigned =
                assigned.length > 0 ? assigned : config.payers[0] ? [config.payers[0]] : [];

            const lineTotal = it.qty * it.unitPrice;
            const shares = splitEvenly(lineTotal, finalAssigned);

            for (const [payer, amt] of Object.entries(shares)) {
                if (result[payer] == null) result[payer] = 0;
                result[payer] += amt;
            }
        }
    } else {
        const subtotal = computeItemsSubtotal(shared);
        const count = Math.max(1, config.payers.length);
        const base = Math.floor(subtotal / count);
        let remainder = subtotal - base * count;

        for (let i = 0; i < config.payers.length; i++) {
            const p = config.payers[i];
            result[p] = base + (remainder > 0 ? 1 : 0);
            remainder--;
        }
    }

    return result;
}

/**
 * Returns per-payer grand totals (items + proportional extras).
 *
 * Policy:
 * - extrasNet is allocated proportionally to payer subtotal, rounded to integers.
 * - Any rounding diff to make totals sum exactly to grand total is applied to the first payer.
 * - If itemsSubtotal is 0, extras are split evenly across payers.
 */
export function computePayerTotals(
    shared: SharedBill | null,
    config: SplitConfig
): Record<string, number> {
    const subtotals = computePayerSubtotals(shared, config);
    const totals: Record<string, number> = {};
    for (const p of config.payers) totals[p] = 0;

    const itemsSubtotal = computeItemsSubtotal(shared);
    const extrasNet = computeExtrasNet(shared);

    if (config.payers.length === 0) return totals;

    if (itemsSubtotal === 0) {
        // no items -> split extras evenly
        const count = Math.max(1, config.payers.length);
        const base = Math.floor(extrasNet / count);
        let rem = extrasNet - base * count;

        for (let i = 0; i < config.payers.length; i++) {
            totals[config.payers[i]] = base + (rem > 0 ? 1 : 0);
            rem--;
        }
        return totals;
    }

    // proportional allocation of extras
    for (const p of config.payers) {
        const sub = subtotals[p] ?? 0;
        const extrasShare = Math.round((sub / itemsSubtotal) * extrasNet);
        const total = sub + extrasShare;
        totals[p] = Math.max(0, Math.round(total));
    }

    // fix rounding differences to match grand total
    const grand = itemsSubtotal + extrasNet;
    const sumTotals = Object.values(totals).reduce((a, b) => a + b, 0);
    const diff = grand - sumTotals;
    if (diff !== 0) {
        totals[config.payers[0]] = (totals[config.payers[0]] ?? 0) + diff;
    }

    return totals;
}
