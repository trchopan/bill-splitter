<script lang="ts">
    import type {PageData} from './$types';
    import QRCode from 'qrcode';
    import {generateQrEmvPayload} from '$lib/emvcode';
    import LZString from 'lz-string';
    import {onMount} from 'svelte';
    import {SvelteURLSearchParams} from 'svelte/reactivity';

    export let data: PageData;

    // shared bill payload from loader
    $: shared = data.ok ? data.shared : null;

    // --- Split configuration state ---
    type SplitMode = 'individual' | 'even';
    type SplitConfig = {
        mode: SplitMode;
        payers: string[]; // order matters
        assignments?: Record<string, string>; // itemId -> payerName (only for individual)
    };

    // Try to start from loader-provided config, else defaults
    let config: SplitConfig = {
        mode: 'individual',
        payers: [],
        assignments: {},
    };

    // If loader provided a config, initialize local state on mount
    onMount(() => {
        let next = {...config};
        if (data.config) {
            // basic merge
            next.mode = data.config.mode ?? next.mode;
            next.payers =
                Array.isArray(data.config.payers) && data.config.payers.length > 0
                    ? data.config.payers.slice()
                    : next.payers;
            next.assignments = data.config.assignments ? {...data.config.assignments} : {};
        }

        // If no payers provided, provide a sensible default: "Friend 1", "Friend 2" up to number of items
        if (!next.payers || next.payers.length === 0) {
            // default: 2 payers if there are items, else empty
            if (shared && shared.items && shared.items.length > 0) {
                next.payers = ['Alice', 'Bob'];
            }
        }

        // If no assignment yet and individual mode, try to auto-assign each item to Friend 1
        if (
            next.mode === 'individual' &&
            (!next.assignments || Object.keys(next.assignments).length === 0) &&
            shared
        ) {
            const a: Record<string, string> = {};
            for (const it of shared.items) {
                a[it.id] = next.payers[0] ?? 'Friend';
            }
            next.assignments = a;
        }

        config = next; // reassign once to trigger reactivity / auto-generation
    });

    // UI helpers
    let newPayerName = '';

    function addPayer() {
        const name = newPayerName.trim();
        if (!name) return;
        config = {...config, payers: [...config.payers, name]};
        newPayerName = '';
    }

    function removePayer(idx: number) {
        const name = config.payers[idx];
        const newPayers = config.payers.filter((_, i) => i !== idx);
        // update assignments that referenced removed payer
        const newAssignments: Record<string, string> = {};
        if (config.assignments) {
            for (const k of Object.keys(config.assignments)) {
                newAssignments[k] =
                    config.assignments[k] === name ? (newPayers[0] ?? '') : config.assignments[k];
            }
        }
        config = {...config, payers: newPayers, assignments: newAssignments};
    }

    function renamePayer(idx: number, newName: string) {
        const old = config.payers[idx];
        // create a new array and replace config immutably so Svelte picks up the change
        const newPayers = config.payers.slice();
        newPayers[idx] = newName;

        // update assignments immutably too
        const newAssignments: Record<string, string> = {};
        if (config.assignments) {
            for (const k of Object.keys(config.assignments)) {
                newAssignments[k] = config.assignments[k] === old ? newName : config.assignments[k];
            }
        }

        config = {...config, payers: newPayers, assignments: newAssignments};
    }

    function assignItemToPayer(itemId: string, payerName: string) {
        const newAssignments = {...(config.assignments ?? {}), [itemId]: payerName};
        config = {...config, assignments: newAssignments};
    }

    // --- Computations ---
    function computeItemsSubtotal(): number {
        if (!shared) return 0;
        return shared.items.reduce((s: number, it: any) => s + it.qty * it.unitPrice, 0);
    }

    function computeExtrasNet(): number {
        if (!shared || !shared.extras) return 0;
        return (shared.extras.tax ?? 0) + (shared.extras.tip ?? 0) - (shared.extras.discount ?? 0);
    }

    // Per-payer item subtotal (individual mode) or equal split (even mode)
    function computePayerSubtotals(): Record<string, number> {
        const result: Record<string, number> = {};
        for (const p of config.payers) result[p] = 0;

        if (!shared) return result;

        if (config.mode === 'individual') {
            for (const it of shared.items) {
                const payer =
                    (config.assignments && config.assignments[it.id]) ||
                    config.payers[0] ||
                    'Friend';
                if (!result[payer]) result[payer] = 0;
                result[payer] += it.qty * it.unitPrice;
            }
        } else {
            // even split: subtotal is divided equally across payers (we will compute final rounding later)
            const subtotal = computeItemsSubtotal();
            const count = Math.max(1, config.payers.length);
            const base = Math.floor(subtotal / count);
            let remainder = subtotal - base * count;
            // distribute remainder 1 VND to first payers
            for (let i = 0; i < config.payers.length; i++) {
                const p = config.payers[i];
                result[p] = base + (remainder > 0 ? 1 : 0);
                remainder--;
            }
        }

        return result;
    }

    // Each payer's extras share is proportional to their subtotal
    function computePayerTotals(): Record<string, number> {
        const itemsSubtotal = computeItemsSubtotal();
        const extrasNet = computeExtrasNet();
        const subtotals = computePayerSubtotals();
        const totals: Record<string, number> = {};
        if (itemsSubtotal === 0) {
            // no items -> split extras evenly if any
            const count = Math.max(1, config.payers.length);
            const baseExtra = Math.floor(extrasNet / count);
            let rem = extrasNet - baseExtra * count;
            for (let i = 0; i < config.payers.length; i++) {
                totals[config.payers[i]] = baseExtra + (rem > 0 ? 1 : 0);
                rem--;
            }
            return totals;
        }

        // allocate proportional share of extras
        for (const p of config.payers) {
            const sub = subtotals[p] ?? 0;
            const extrasShare = Math.round((sub / itemsSubtotal) * extrasNet);
            const total = sub + extrasShare;
            totals[p] = Math.max(0, Math.round(total));
        }

        // Fix rounding differences to match grand total (itemsSubtotal + extrasNet)
        const grand = itemsSubtotal + extrasNet;
        const diff = grand - Object.values(totals).reduce((a, b) => a + b, 0);
        if (diff !== 0 && config.payers.length > 0) {
            totals[config.payers[0]] = (totals[config.payers[0]] ?? 0) + diff;
        }

        return totals;
    }

    // --- QR generation per payer ---
    type PayerQr = {
        payer: string;
        amount: number;
        emvPayload?: string;
        qrDataUrl?: string;
        bankLabel?: string;
        error?: string | null;
    };

    let payerQrs: PayerQr[] = [];

    async function generateAllQrs() {
        // Recreate the array to ensure reactivity if changed
        const next: PayerQr[] = [];
        if (!shared) {
            payerQrs = next;
            return;
        }
        const totals = computePayerTotals();
        for (const payer of config.payers) {
            const amount = totals[payer] ?? 0;
            if (amount <= 0) {
                next.push({payer, amount, error: 'Amount is 0'});
                continue;
            }
            try {
                const {payload, bank} = generateQrEmvPayload({
                    bank: shared.owner.bank,
                    accountNumber: shared.owner.accountNumber,
                    amount,
                    note: `${shared.billName} — ${payer}`,
                    countryCode: shared.countryCode ?? 'VN',
                    currencyNumeric: shared.currencyNumeric ?? '704',
                    pointOfInitiationMethod: '12',
                });
                const qrDataUrl = await QRCode.toDataURL(payload, {
                    errorCorrectionLevel: 'M',
                    margin: 2,
                    scale: 6,
                });

                next.push({
                    payer,
                    amount,
                    emvPayload: payload,
                    qrDataUrl,
                    bankLabel: `${bank.shortName} (${bank.code})`,
                    error: null,
                });
            } catch (e: any) {
                next.push({payer, amount, error: e?.message ?? 'Failed to build QR'});
            }
        }
        payerQrs = next;
    }

    function copyToClipboard(text: string) {
        try {
            navigator.clipboard.writeText(text);
        } catch {
            // ignore
        }
    }

    function downloadPng(dataUrl: string, filename: string) {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = filename;
        a.click();
    }

    // --- Persist config into URL (Recompute split) ---
    function makeConfigParam(): string {
        const obj: any = {
            mode: config.mode,
            payers: config.payers,
        };
        if (config.mode === 'individual') obj.assignments = config.assignments ?? {};
        return LZString.compressToEncodedURIComponent(JSON.stringify(obj));
    }

    function recomputeAndSave() {
        if (!shared) return;
        const params = new SvelteURLSearchParams(window.location.search);
        params.set('b', params.get('b') ?? '');
        params.set('c', makeConfigParam());
        // Build new URL and navigate (preserve origin + pathname)
        const newUrl = `${location.pathname}?${params.toString()}`;
        // Navigate to new URL to update page state for others; keep it simple via assign
        location.assign(newUrl);
    }

    // Auto-generate QRs when relevant state changes
    // NOTE: we reference `config` and `shared` so this reactive block runs after those change.
    $: if (shared && config) {
        // fire-and-forget async generation; allow the UI to update immediately
        (async () => {
            await generateAllQrs();
        })();
    }
</script>

<svelte:head>
    <title>Bill Split - Select Items (Editable)</title>
</svelte:head>

<main style="max-width:980px; margin:0 auto; padding:24px;">
    {#if !data.ok}
        <h1>Invalid bill link</h1>
        <ul>
            {#each data.errors as e (e)}
                <li>{e}</li>
            {/each}
        </ul>
        <p>Ask the bill owner to generate a new link.</p>
    {:else if shared}
        <header
            style="display:flex; justify-content:space-between; gap:16px; align-items:flex-start;"
        >
            <div>
                <h1 style="margin:0;">{shared.billName}</h1>
                <div style="opacity:0.85; margin-top:6px;">
                    Owner can assign items to payers, or choose even split. The app generates
                    per-payer QR codes automatically as you edit. Click Recompute to persist the
                    configuration.
                </div>
            </div>
            <div style="text-align:right; opacity:0.85;">
                <div>
                    <strong>Pay to:</strong>
                    {shared.owner.bank} • {shared.owner.accountNumber}
                </div>
            </div>
        </header>

        <section style="margin-top:18px; display:grid; grid-template-columns: 1fr 320px; gap:16px;">
            <div>
                <h2>Split mode & payers</h2>

                <div style="display:flex; gap:12px; align-items:center; margin-top:8px;">
                    <label>
                        <input type="radio" bind:group={config.mode} value="individual" /> Individual
                    </label>
                    <label><input type="radio" bind:group={config.mode} value="even" /> Even</label>
                </div>

                <div
                    style="margin-top:12px; padding:10px; border:1px solid #eee; border-radius:8px;"
                >
                    <div style="font-weight:600; margin-bottom:6px;">Payers</div>

                    {#each config.payers as payer, idx (idx)}
                        <div style="display:flex; gap:8px; align-items:center; margin-bottom:6px;">
                            <input
                                value={payer}
                                on:input={e =>
                                    renamePayer(idx, (e.currentTarget as HTMLInputElement).value)}
                                style="flex:1; padding:6px;"
                            />
                            <button on:click={() => removePayer(idx)} style="padding:6px;"
                                >Remove</button
                            >
                        </div>
                    {/each}

                    <div style="display:flex; gap:8px; margin-top:8px;">
                        <input
                            placeholder="New payer name"
                            bind:value={newPayerName}
                            style="flex:1; padding:6px;"
                        />
                        <button on:click={addPayer}>Add</button>
                    </div>
                </div>
            </div>

            <div>
                <h2>Quick totals</h2>
                <div style="padding:10px; border:1px solid #eee; border-radius:8px;">
                    <div>
                        <strong>Items subtotal:</strong>
                        {computeItemsSubtotal().toLocaleString()} VND
                    </div>
                    <div>
                        <strong>Extras net:</strong>
                        {computeExtrasNet().toLocaleString()} VND
                    </div>
                    <div style="margin-top:8px; font-size:18px;">
                        <strong>Grand total:</strong>
                        {(computeItemsSubtotal() + computeExtrasNet()).toLocaleString()} VND
                    </div>
                </div>

                <div
                    style="margin-top:12px; padding:10px; border:1px solid #eee; border-radius:8px;"
                >
                    <div style="font-weight:600; margin-bottom:6px;">
                        Preview per-payer subtotal
                    </div>
                    {#each Object.entries(computePayerSubtotals()) as [payer, subtotal] (payer)}
                        <div
                            style="display:flex; justify-content:space-between; margin-bottom:4px;"
                        >
                            <div>{payer}</div>
                            <div>{subtotal.toLocaleString()} VND</div>
                        </div>
                    {/each}
                    <hr />
                    <div style="font-weight:600; margin-top:6px;">
                        Final per-payer total (includes extras share)
                    </div>
                    {#each Object.entries(computePayerTotals()) as [payer, total] (payer)}
                        <div
                            style="display:flex; justify-content:space-between; margin-bottom:4px;"
                        >
                            <div>{payer}</div>
                            <div>{total.toLocaleString()} VND</div>
                        </div>
                    {/each}
                </div>
            </div>
        </section>

        <section style="margin-top:18px;">
            <h2>Assign items</h2>
            <div style="overflow-x:auto;">
                <table style="width:100%; border-collapse:collapse;">
                    <thead>
                        <tr>
                            <th style="text-align:left; border-bottom:1px solid #ddd; padding:8px;">
                                Item
                            </th>
                            <th
                                style="text-align:right; border-bottom:1px solid #ddd; padding:8px;"
                            >
                                Unit (VND)
                            </th>
                            <th
                                style="text-align:right; border-bottom:1px solid #ddd; padding:8px;"
                            >
                                Available
                            </th>
                            <th
                                style="text-align:right; border-bottom:1px solid #ddd; padding:8px;"
                            >
                                Assigned to
                            </th>
                            <th
                                style="text-align:right; border-bottom:1px solid #ddd; padding:8px;"
                            >
                                Line (VND)
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each shared.items as it (it.id)}
                            <tr>
                                <td style="padding:8px; border-bottom:1px solid #f0f0f0;"
                                    >{it.name}</td
                                >
                                <td
                                    style="padding:8px; border-bottom:1px solid #f0f0f0; text-align:right;"
                                    >{it.unitPrice.toLocaleString()}</td
                                >
                                <td
                                    style="padding:8px; border-bottom:1px solid #f0f0f0; text-align:right;"
                                    >{it.qty}</td
                                >
                                <td
                                    style="padding:8px; border-bottom:1px solid #f0f0f0; text-align:right;"
                                >
                                    {#if config.mode === 'individual'}
                                        <select
                                            on:change={e =>
                                                assignItemToPayer(
                                                    it.id,
                                                    (e.currentTarget as HTMLSelectElement).value
                                                )}
                                            value={config.assignments?.[it.id]}
                                        >
                                            {#each config.payers as p (p)}
                                                <option
                                                    value={p}
                                                    selected={config.assignments?.[it.id] === p}
                                                >
                                                    {p}
                                                </option>
                                            {/each}
                                        </select>
                                    {:else}
                                        <span>— (even split)</span>
                                    {/if}
                                </td>
                                <td
                                    style="padding:8px; border-bottom:1px solid #f0f0f0; text-align:right;"
                                >
                                    {(it.qty * it.unitPrice).toLocaleString()}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>

            <div style="margin-top:12px;">
                <button on:click={recomputeAndSave} style="padding:8px 12px;">
                    Recompute split (save to URL)
                </button>
                <span style="opacity:0.8; margin-left:8px;">
                    This will update the link to share to your friends.
                </span>
            </div>
        </section>

        <section style="margin-top:18px;">
            <h2>Per-payer QR codes</h2>

            {#if payerQrs.length === 0}
                <div style="padding:10px; border:1px dashed #ddd; border-radius:8px;">
                    Generating QRs... (QRs are hidden by default — click a payer to expand)
                </div>
            {/if}

            {#each payerQrs as pq (pq.payer)}
                <details
                    style="margin-top:12px; border:1px solid #eee; border-radius:8px; padding:0;"
                >
                    <summary
                        style="list-style:none; cursor:pointer; padding:12px; display:flex; justify-content:space-between; align-items:center;"
                    >
                        <div style="display:flex; gap:8px; align-items:center;">
                            <strong>{pq.payer}</strong>
                            <span style="opacity:0.8;">• {pq.amount.toLocaleString()} VND</span>
                        </div>
                        <div style="font-size:13px; opacity:0.8;">Click to view QR</div>
                    </summary>

                    <div style="padding:12px; display:flex; gap:12px; align-items:center;">
                        <div style="width:220px;">
                            {#if pq.qrDataUrl}
                                <img
                                    src={pq.qrDataUrl}
                                    alt="QR"
                                    style="width:200px; height:200px; display:block;"
                                />
                            {:else}
                                <div
                                    style="width:200px; height:200px; display:flex; align-items:center; justify-content:center; background:#fafafa; border:1px dashed #ddd;"
                                >
                                    {pq.error ?? 'No QR'}
                                </div>
                            {/if}
                        </div>

                        <div style="flex:1;">
                            <div style="margin-bottom:6px;"><strong>{pq.payer}</strong></div>
                            <div style="margin-bottom:6px;">
                                Amount: {pq.amount.toLocaleString()} VND
                            </div>
                            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                                {#if pq.emvPayload}
                                    <button on:click={() => copyToClipboard(pq.emvPayload!)}>
                                        Copy EMV payload
                                    </button>
                                {/if}
                                {#if pq.qrDataUrl}
                                    <button
                                        on:click={() =>
                                            downloadPng(
                                                pq.qrDataUrl!,
                                                `qr-${pq.payer.replace(/\s+/g, '-')}-${pq.amount}.png`
                                            )}
                                    >
                                        Download PNG
                                    </button>
                                {/if}
                                {#if pq.emvPayload}
                                    {#await Promise.resolve(LZString.compressToEncodedURIComponent(pq.emvPayload)) then d}
                                        <a
                                            href={`/qr?d=${d}`}
                                            style="padding:8px 12px; border:1px solid #ccc; border-radius:6px; text-decoration:none;"
                                            >Open QR page</a
                                        >
                                        <button
                                            on:click={() =>
                                                copyToClipboard(`${location.origin}/qr?d=${d}`)}
                                            >Copy QR-only link</button
                                        >
                                    {/await}
                                {/if}
                            </div>

                            {#if pq.emvPayload}
                                <details style="margin-top:8px;">
                                    <summary>Debug: EMV payload</summary>
                                    <pre
                                        style="white-space:pre-wrap; word-break:break-all; margin-top:6px;">{pq.emvPayload}</pre>
                                </details>
                            {/if}
                        </div>
                    </div>
                </details>
            {/each}
        </section>

        <footer style="margin-top:18px; opacity:0.75; font-size:13px;">
            This is a serverless link. The recomputed link (with config) persists how the owner
            assigned items.
        </footer>
    {/if}
</main>

<style>
    button {
        padding: 8px 12px;
        border: 1px solid #ccc;
        background: #fff;
        cursor: pointer;
        border-radius: 6px;
    }
    button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    select,
    input {
        border: 1px solid #ccc;
        border-radius: 6px;
        padding: 6px;
    }

    /* Improve details/summary appearance */
    details summary::-webkit-details-marker {
        display: none;
    }
    details summary {
        outline: none;
    }
    details[open] summary {
        background: #fafafa;
        border-bottom: 1px solid #eee;
    }
</style>
