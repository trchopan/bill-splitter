<script lang="ts">
    import type {PageData} from './$types';
    import QRCode from 'qrcode';
    import {generateQrEmvPayload} from '$lib/emvcode';
    import LZString from 'lz-string';
    import {onMount} from 'svelte';
    import {SvelteURLSearchParams} from 'svelte/reactivity';

    import {
        computeItemsSubtotal,
        computeExtrasNet,
        computePayerTotals,
        type SplitConfig,
    } from '$lib/bill/split';

    export let data: PageData;

    // shared bill payload from loader
    $: shared = data.ok ? data.shared : null;

    // --- Split configuration state ---
    // Try to start from loader-provided config, else defaults
    let config: SplitConfig = {
        mode: 'individual',
        payers: [],
        assignments: {},
    };

    // If loader provided a config, initialize local state on mount
    onMount(() => {
        let next: SplitConfig = {...config};

        if (data.config) {
            // basic merge
            next.mode = data.config.mode ?? next.mode;
            next.payers =
                Array.isArray(data.config.payers) && data.config.payers.length > 0
                    ? data.config.payers.slice()
                    : next.payers;

            // assignments may come from loader already as Record<string, string[]>
            // but keep safe
            const incoming = (data.config as any).assignments;
            if (incoming && typeof incoming === 'object') {
                const a: Record<string, string[]> = {};
                for (const [k, v] of Object.entries(incoming)) {
                    if (Array.isArray(v)) {
                        a[k] = v.filter(x => typeof x === 'string' && x.trim().length > 0);
                    } else if (typeof v === 'string' && v.trim().length > 0) {
                        // backward compatibility if any older config slipped through
                        a[k] = [v];
                    }
                }
                next.assignments = a;
            } else {
                next.assignments = {};
            }
        }

        // If no payers provided, provide a sensible default: "Alice", "Bob"
        if (!next.payers || next.payers.length === 0) {
            if (shared && shared.items && shared.items.length > 0) {
                next.payers = ['Alice', 'Bob'];
            }
        }

        // If no assignment yet and individual mode, auto-assign each item to first payer
        if (
            next.mode === 'individual' &&
            (!next.assignments || Object.keys(next.assignments).length === 0) &&
            shared
        ) {
            const a: Record<string, string[]> = {};
            for (const it of shared.items) {
                a[it.id] = [next.payers[0] ?? 'Friend'];
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
        newUrl = '';
    }

    function removePayer(idx: number) {
        const name = config.payers[idx];
        const newPayers = config.payers.filter((_, i) => i !== idx);

        // update assignments that referenced removed payer
        const newAssignments: Record<string, string[]> = {};
        if (config.assignments) {
            for (const k of Object.keys(config.assignments)) {
                const current = config.assignments[k] ?? [];
                const filtered = current.filter(p => p !== name);

                // If removing leaves none selected, fallback to first payer (or empty)
                newAssignments[k] =
                    filtered.length > 0 ? filtered : newPayers[0] ? [newPayers[0]] : [];
            }
        }

        config = {...config, payers: newPayers, assignments: newAssignments};
        newUrl = '';
    }

    function renamePayer(idx: number, newName: string) {
        const old = config.payers[idx];
        const newPayers = config.payers.slice();
        newPayers[idx] = newName;

        const newAssignments: Record<string, string[]> = {};
        if (config.assignments) {
            for (const k of Object.keys(config.assignments)) {
                const arr = config.assignments[k] ?? [];
                newAssignments[k] = arr.map(p => (p === old ? newName : p));
            }
        }

        config = {...config, payers: newPayers, assignments: newAssignments};
        newUrl = '';
    }

    function toggleItemPayer(itemId: string, payerName: string, checked: boolean) {
        const current = (config.assignments?.[itemId] ?? []).slice();

        let next: string[];
        if (checked) {
            next = current.includes(payerName) ? current : [...current, payerName];
        } else {
            next = current.filter(p => p !== payerName);
        }

        // Prevent empty selection in individual mode (recommended)
        if (config.mode === 'individual' && next.length === 0) {
            next = current.length > 0 ? current : config.payers[0] ? [config.payers[0]] : [];
        }

        const newAssignments = {...(config.assignments ?? {}), [itemId]: next};
        config = {...config, assignments: newAssignments};
        newUrl = '';
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
        const next: PayerQr[] = [];
        if (!shared) {
            payerQrs = next;
            return;
        }

        const totals = computePayerTotals(shared, config);

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

    let newUrl = '';

    function recomputeAndSave() {
        if (!shared) return;
        const params = new SvelteURLSearchParams(window.location.search);
        params.set('b', params.get('b') ?? '');
        params.set('c', makeConfigParam());
        newUrl = `${location.origin}${location.pathname}?${params.toString()}`;
    }

    // Auto-generate QRs when relevant state changes
    $: if (shared && config) {
        (async () => {
            await generateAllQrs();
        })();
    }
</script>

<svelte:head>
    <title>Bill Split - Select Items (Editable)</title>
</svelte:head>

<main class="container mx-auto w-full max-w-5xl px-4 pt-5 pb-10 sm:px-6">
    {#if !data.ok}
        <div class="alert alert-error shadow-lg">
            <div>
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-6 w-6 shrink-0 stroke-current"
                    fill="none"
                    viewBox="0 0 24 24"
                    ><path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                    /></svg
                >
                <div>
                    <h3 class="font-bold">Invalid bill link</h3>
                    <ul class="list-inside list-disc text-sm">
                        {#each data.errors as e (e)}
                            <li>{e}</li>
                        {/each}
                    </ul>
                    <div class="mt-1 text-xs">Ask the bill owner to generate a new link.</div>
                </div>
            </div>
        </div>
    {:else if shared}
        <!-- Header -->
        <header
            class="mb-5 flex flex-col gap-4 sm:mb-6 lg:flex-row lg:items-start lg:justify-between"
        >
            <div class="min-w-0">
                <h1 class="wrap-break-words text-2xl font-bold sm:text-3xl">{shared.billName}</h1>
                <div class="mt-2 max-w-2xl text-sm opacity-85">
                    Owner can assign items to multiple payers, or choose even split. The app
                    generates per-payer QR codes automatically as you edit. Click Recompute to
                    persist the configuration.
                </div>
            </div>

            <div class="card w-full border border-base-200 bg-base-100 p-4 shadow-sm lg:w-auto">
                <div class="text-sm opacity-85">
                    <div class="mb-1 font-semibold">Pay to:</div>
                    <div
                        class="wrap-break-words rounded bg-base-200 p-2 font-mono text-xs leading-relaxed"
                        data-testid="pay-to"
                    >
                        {shared.owner.bank} • {shared.owner.accountNumber}
                    </div>
                </div>
            </div>
        </header>

        <!-- Top section: config + totals (becomes 2-column on lg) -->
        <section class="mb-6 grid grid-cols-1 gap-4 lg:mb-8 lg:grid-cols-[1fr_360px] lg:gap-6">
            <div class="card border border-base-200 bg-base-100 shadow-xl">
                <div class="card-body p-4 sm:p-6">
                    <h2 class="card-title text-lg sm:text-xl">Split mode & payers</h2>

                    <!-- Radios: stack on mobile -->
                    <div class="my-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
                        <label class="label cursor-pointer justify-start gap-2">
                            <input
                                type="radio"
                                bind:group={config.mode}
                                value="individual"
                                class="radio radio-primary"
                            />
                            <span class="label-text font-medium">Individual</span>
                        </label>
                        <label class="label cursor-pointer justify-start gap-2">
                            <input
                                type="radio"
                                bind:group={config.mode}
                                value="even"
                                class="radio radio-primary"
                            />
                            <span class="label-text font-medium">Even Split</span>
                        </label>
                    </div>

                    <div class="rounded-lg border border-base-200 bg-base-200/50 p-4">
                        <div class="mb-3 text-sm font-semibold tracking-wide uppercase opacity-70">
                            Payers
                        </div>

                        <div class="space-y-2">
                            {#each config.payers as payer, idx (idx)}
                                <div class="flex items-center gap-2">
                                    <input
                                        value={payer}
                                        on:input={e =>
                                            renamePayer(
                                                idx,
                                                (e.currentTarget as HTMLInputElement).value
                                            )}
                                        class="input-bordered input input-sm min-w-0 flex-1"
                                    />
                                    <button
                                        class="btn btn-square text-error btn-ghost btn-sm"
                                        on:click={() => removePayer(idx)}
                                        title="Remove"
                                    >
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            class="h-5 w-5"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            ><path
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                stroke-width="2"
                                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                            /></svg
                                        >
                                    </button>
                                </div>
                            {/each}
                        </div>

                        <div class="divider my-2"></div>

                        <!-- Add payer: stacks on mobile -->
                        <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <input
                                placeholder="New payer name"
                                bind:value={newPayerName}
                                class="input-bordered input input-sm w-full flex-1"
                                on:keydown={e => e.key === 'Enter' && addPayer()}
                            />
                            <button
                                class="btn w-full btn-sm btn-secondary sm:w-auto"
                                on:click={addPayer}
                            >
                                Add
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="card h-fit border border-base-200 bg-base-100 shadow-xl">
                <div class="card-body p-4 sm:p-6">
                    <h2 class="card-title text-lg sm:text-xl">Quick totals</h2>

                    <div class="space-y-2 rounded-lg bg-base-200 p-4 text-sm">
                        <div class="flex justify-between gap-3">
                            <span class="opacity-80">Items subtotal:</span>
                            <span class="font-medium tabular-nums" data-testid="items-subtotal">
                                {computeItemsSubtotal(shared).toLocaleString()} VND
                            </span>
                        </div>
                        <div class="flex justify-between gap-3">
                            <span class="opacity-80">Extras net:</span>
                            <span class="font-medium tabular-nums" data-testid="extras-net">
                                {computeExtrasNet(shared).toLocaleString()} VND
                            </span>
                        </div>
                        <div class="divider my-1"></div>
                        <div
                            class="flex justify-between gap-3 text-base font-bold text-primary sm:text-lg"
                        >
                            <span>Grand total:</span>
                            <span class="tabular-nums" data-testid="grand-total">
                                {(
                                    computeItemsSubtotal(shared) + computeExtrasNet(shared)
                                ).toLocaleString()} VND
                            </span>
                        </div>
                    </div>

                    <!-- Optional hint on desktop -->
                    <div class="mt-3 hidden text-xs opacity-60 lg:block">
                        Totals update as you edit payers/assignments.
                    </div>
                </div>
            </div>
        </section>

        <!-- Assign items -->
        <section class="card mb-6 border border-base-200 bg-base-100 shadow-xl sm:mb-8">
            <div class="card-body p-4 sm:p-6">
                <h2 class="mb-4 card-title text-lg sm:text-xl">Assign items</h2>

                <!-- Mobile: card list -->
                <div class="space-y-3 md:hidden">
                    {#each shared.items as it (it.id)}
                        <div class="rounded-xl border border-base-200 bg-base-100 p-3 shadow-sm">
                            <div class="flex items-start justify-between gap-3">
                                <div class="min-w-0">
                                    <div class="wrap-break-words font-medium">{it.name}</div>
                                    <div class="mt-1 text-xs opacity-70">
                                        Unit: {it.unitPrice.toLocaleString()} • Qty: {it.qty}
                                    </div>
                                </div>
                                <div class="shrink-0 text-right">
                                    <div class="text-xs opacity-70">Line</div>
                                    <div class="font-semibold tabular-nums">
                                        {(it.qty * it.unitPrice).toLocaleString()}
                                    </div>
                                </div>
                            </div>

                            <div class="mt-3">
                                <div
                                    class="text-xs font-semibold tracking-wide uppercase opacity-70"
                                >
                                    Assigned to
                                </div>

                                {#if config.mode === 'individual'}
                                    <div class="mt-2 grid grid-cols-1 gap-1">
                                        {#each config.payers as p (p)}
                                            <label
                                                class="label cursor-pointer justify-between gap-3 rounded px-2 py-1 hover:bg-base-200"
                                            >
                                                <span class="label-text text-sm">{p}</span>
                                                <input
                                                    type="checkbox"
                                                    class="checkbox checkbox-sm checkbox-primary"
                                                    checked={(
                                                        config.assignments?.[it.id] ?? []
                                                    ).includes(p)}
                                                    on:change={e =>
                                                        toggleItemPayer(
                                                            it.id,
                                                            p,
                                                            (e.currentTarget as HTMLInputElement)
                                                                .checked
                                                        )}
                                                />
                                            </label>
                                        {/each}
                                    </div>
                                {:else}
                                    <div class="mt-2">
                                        <span class="badge badge-ghost">— (even split)</span>
                                    </div>
                                {/if}
                            </div>
                        </div>
                    {/each}
                </div>

                <!-- Desktop/tablet: table -->
                <div class="hidden overflow-x-auto md:block">
                    <table class="table w-full table-zebra table-sm">
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th class="text-right">Unit (VND)</th>
                                <th class="text-right">Qty</th>
                                <th class="min-w-55 text-right">Assigned to</th>
                                <th class="text-right">Line (VND)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each shared.items as it (it.id)}
                                <tr>
                                    <td class="font-medium">{it.name}</td>
                                    <td class="text-right text-xs opacity-70"
                                        >{it.unitPrice.toLocaleString()}</td
                                    >
                                    <td class="text-right">{it.qty}</td>
                                    <td class="text-right">
                                        {#if config.mode === 'individual'}
                                            <div class="flex flex-col items-end gap-1">
                                                {#each config.payers as p (p)}
                                                    <label
                                                        class="label cursor-pointer gap-2 rounded px-1 py-0 hover:bg-base-200"
                                                    >
                                                        <span class="label-text text-xs">{p}</span>
                                                        <input
                                                            type="checkbox"
                                                            class="checkbox checkbox-xs checkbox-primary"
                                                            checked={(
                                                                config.assignments?.[it.id] ?? []
                                                            ).includes(p)}
                                                            on:change={e =>
                                                                toggleItemPayer(
                                                                    it.id,
                                                                    p,
                                                                    (
                                                                        e.currentTarget as HTMLInputElement
                                                                    ).checked
                                                                )}
                                                        />
                                                    </label>
                                                {/each}
                                            </div>
                                        {:else}
                                            <span class="badge badge-ghost text-xs"
                                                >— (even split)</span
                                            >
                                        {/if}
                                    </td>
                                    <td class="text-right font-medium tabular-nums">
                                        {(it.qty * it.unitPrice).toLocaleString()}
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>

                <!-- Recompute + link (mobile stacks, desktop inline) -->
                <div class="mt-6">
                    <div class="flex flex-col gap-4">
                        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                            <button
                                class="btn w-full btn-primary sm:w-auto"
                                on:click={recomputeAndSave}
                            >
                                Recompute split (new URL)
                            </button>
                            <span class="text-sm opacity-70">
                                Updates the link to share with friends.
                            </span>
                        </div>

                        {#if newUrl}
                            <div
                                class="flex flex-col gap-2 rounded-lg border border-base-200 p-3 sm:flex-row sm:items-center sm:gap-2"
                            >
                                <h3 class="text-sm font-bold whitespace-nowrap">
                                    New link generated:
                                </h3>

                                <input
                                    readonly
                                    bind:value={newUrl}
                                    class="input-bordered input input-sm w-full bg-base-100"
                                />

                                <div class="flex gap-2">
                                    <button
                                        class="btn flex-1 btn-sm sm:flex-none"
                                        on:click={() => copyToClipboard(newUrl)}
                                    >
                                        Copy Link
                                    </button>
                                    <a
                                        href={newUrl}
                                        class="btn flex-1 btn-sm btn-neutral sm:flex-none"
                                    >
                                        Reload
                                    </a>
                                </div>
                            </div>

                            <footer class="text-center text-xs opacity-60">
                                This is a serverless link. The recomputed link (with config)
                                persists how the items are assigned.
                            </footer>
                        {/if}
                    </div>
                </div>
            </div>
        </section>

        <!-- QR codes -->
        <section class="card mb-16 border border-base-200 bg-base-100 shadow-xl sm:mb-12">
            <div class="card-body p-4 sm:p-6">
                <h2 class="card-title text-lg sm:text-xl">Per-payer QR codes</h2>

                {#if payerQrs.length === 0}
                    <div
                        class="mt-3 flex items-center justify-center rounded-lg border-2 border-dashed border-base-300 p-8 text-base-content/50"
                    >
                        Generating QRs...
                    </div>
                {/if}

                <div class="mt-3 space-y-3">
                    {#each payerQrs as pq (pq.payer)}
                        <div
                            class="collapse-arrow collapse rounded-box border border-base-200 bg-base-100"
                        >
                            <input type="checkbox" />
                            <div
                                class="collapse-title flex flex-col gap-2 font-medium sm:flex-row sm:items-center sm:justify-between"
                            >
                                <div class="flex min-w-0 items-center gap-2">
                                    <span class="truncate text-base font-bold sm:text-lg"
                                        >{pq.payer}</span
                                    >
                                    <span
                                        class="badge badge-outline badge-md tabular-nums sm:badge-lg"
                                        data-testid={`payer-amount-${pq.payer}`}
                                    >
                                        {pq.amount.toLocaleString()} VND
                                    </span>
                                </div>
                                <div class="text-xs font-normal opacity-50 sm:mr-2">
                                    Click to view QR
                                </div>
                            </div>

                            <div class="collapse-content">
                                <div
                                    class="flex flex-col items-center gap-4 border-t border-base-200 p-2 pt-4 md:flex-row md:items-start md:gap-6"
                                >
                                    <div
                                        class="shrink-0 rounded-lg border border-base-200 bg-white p-2 shadow-sm"
                                    >
                                        {#if pq.qrDataUrl}
                                            <img
                                                src={pq.qrDataUrl}
                                                alt="QR"
                                                class="block h-44 w-44 sm:h-48 sm:w-48"
                                            />
                                        {:else}
                                            <div
                                                class="flex h-44 w-44 items-center justify-center bg-base-100 text-xs text-error sm:h-48 sm:w-48"
                                            >
                                                {pq.error ?? 'No QR'}
                                            </div>
                                        {/if}
                                    </div>

                                    <div class="w-full flex-1 space-y-3">
                                        <div>
                                            <div class="text-sm opacity-70">Payment for</div>
                                            <div class="text-lg font-bold wrap-break-word">
                                                {pq.payer}
                                            </div>
                                            <div class="font-mono text-lg tabular-nums sm:text-xl">
                                                {pq.amount.toLocaleString()} VND
                                            </div>
                                        </div>

                                        <!-- Actions: wrap naturally, full-width buttons on mobile -->
                                        <div
                                            class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-2"
                                        >
                                            {#if pq.emvPayload}
                                                <button
                                                    class="btn w-full btn-sm sm:w-auto"
                                                    on:click={() => copyToClipboard(pq.emvPayload!)}
                                                >
                                                    Copy Payload
                                                </button>
                                            {/if}
                                            {#if pq.qrDataUrl}
                                                <button
                                                    class="btn w-full btn-outline btn-sm sm:w-auto"
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
                                                        class="btn w-full btn-sm btn-neutral sm:w-auto"
                                                    >
                                                        Open QR page
                                                    </a>
                                                    <button
                                                        class="btn w-full btn-ghost btn-sm sm:w-auto"
                                                        on:click={() =>
                                                            copyToClipboard(
                                                                `${location.origin}/qr?d=${d}`
                                                            )}
                                                    >
                                                        Copy QR link
                                                    </button>
                                                {/await}
                                            {/if}
                                        </div>

                                        {#if pq.emvPayload}
                                            <div
                                                class="collapse-plus collapse rounded-lg bg-base-200 text-xs"
                                            >
                                                <input type="checkbox" />
                                                <div class="collapse-title min-h-0 px-4 py-2">
                                                    Debug: EMV payload
                                                </div>
                                                <div class="collapse-content">
                                                    <pre
                                                        class="pt-2 font-mono break-all whitespace-pre-wrap opacity-70">{pq.emvPayload}</pre>
                                                </div>
                                            </div>
                                        {/if}
                                    </div>
                                </div>
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        </section>
    {/if}
</main>
