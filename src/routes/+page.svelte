<script lang="ts">
    import type {AiBillInput} from '$lib/bill/types';
    import {validateAiBill} from '$lib/bill/validate';
    import {buildSharedBillPayload, computeItemsTotal, toIntVnd} from '$lib/bill/utils';
    import {encodeForUrl} from '$lib/bill/codec';
    import {BANKS} from '$lib/emvcode/EMVCodeUtil';
    import type {PageData} from './$types';

    export let data: PageData;

    let didApplyPreset = false;

    // --- Create UI mode: Parse vs Edit ---
    type CreateMode = 'parse' | 'edit';
    let mode: CreateMode = 'parse';

    let rawJson = `{
  "billName": "Pizza 4P's",
  "items": [
    { "name": "Margherita Pizza", "qty": 1, "unitPrice": 189000 },
    { "name": "4 Cheese Pizza", "qty": 1, "unitPrice": 235000 },
    { "name": "Seafood Pizza", "qty": 1, "unitPrice": 260000 },
    { "name": "Caesar Salad", "qty": 1, "unitPrice": 85000 },
    { "name": "Coke", "qty": 3, "unitPrice": 25000 },
    { "name": "Tiramisu", "qty": 2, "unitPrice": 60000 }
  ],
  "extras": { "tip": 50000, "discount": 20000 }
}`;

    let parsed: AiBillInput | null = null;
    let validationErrors: string[] = [];

    // Owner inputs
    let ownerBank: string = '';
    let ownerAccountNumber = '';
    let highlightOwnerInfo = false;

    // Apply presets exactly once on initial load
    if (!didApplyPreset) {
        if (data?.preset?.bank) ownerBank = data.preset.bank;
        if (data?.preset?.acct) ownerAccountNumber = data.preset.acct;
        didApplyPreset = true;
    }

    function switchMode(next: CreateMode) {
        mode = next;

        // When going back to Parse, show current edited JSON
        if (next === 'parse' && parsed) {
            rawJson = JSON.stringify(parsed, null, 2);
        }
    }

    $: hasOwnerInfo =
        ownerBank.trim().length > 0 && ownerAccountNumber.replace(/\s+/g, '').length > 0;

    $: if (hasOwnerInfo) {
        highlightOwnerInfo = false;
    }

    $: bookmarkUrl =
        `${location.origin}/?` +
        `bank=${encodeURIComponent(ownerBank.trim())}&` +
        `accountNumber=${encodeURIComponent(ownerAccountNumber.replace(/\s+/g, ''))}`;

    function onParse() {
        validationErrors = [];
        parsed = null;

        let obj: unknown;
        try {
            obj = JSON.parse(rawJson);
        } catch {
            validationErrors = ['Invalid JSON: unable to parse.'];
            return;
        }

        const res = validateAiBill(obj);
        if (!res.ok) {
            validationErrors = res.errors;
            return;
        }

        parsed = res.value;

        // Normalize extras for a stable UI
        if (!parsed.extras) parsed.extras = {tax: 0, tip: 0, discount: 0};

        mode = 'edit';
    }

    function openBillPage() {
        if (!parsed) return;

        validationErrors = [];

        if (!hasOwnerInfo) {
            validationErrors = ['Please fill in bank and account number before continuing.'];
            highlightOwnerInfo = true;
            return;
        }

        if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
            validationErrors = ['Please add at least 1 item before continuing.'];
            return;
        }

        // Optional light guard: item names shouldn't be empty
        const badIdx = parsed.items.findIndex(it => String(it.name ?? '').trim().length === 0);
        if (badIdx >= 0) {
            validationErrors = [`Item ${badIdx + 1} name is empty.`];
            return;
        }

        const sharedPayload = buildSharedBillPayload({
            ai: parsed,
            ownerBank,
            ownerAccountNumber,
        });

        const encoded = encodeForUrl(sharedPayload);
        const url = `/bill?b=${encoded}`;

        // Navigate immediately
        window.location.assign(url);
    }

    function formatVnd(n: number): string {
        return `${Math.round(n)}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    $: itemsTotal = parsed
        ? computeItemsTotal(parsed.items.map(i => ({qty: i.qty, unitPrice: i.unitPrice})))
        : 0;

    $: extrasNet = parsed?.extras
        ? toIntVnd(parsed.extras.tax) +
          toIntVnd(parsed.extras.tip) -
          toIntVnd(parsed.extras.discount)
        : 0;

    $: computedBillTotal = itemsTotal + extrasNet;

    // --- Edit helpers ---
    function setBillName(v: string) {
        if (!parsed) return;
        parsed = {...parsed, billName: v};
    }

    function setItemName(idx: number, v: string) {
        if (!parsed) return;
        const items = parsed.items.slice();
        items[idx] = {...items[idx], name: v};
        parsed = {...parsed, items};
    }

    function setItemQty(idx: number, v: string) {
        if (!parsed) return;
        const items = parsed.items.slice();
        const qty = Math.max(1, Math.round(toIntVnd(v)));
        items[idx] = {...items[idx], qty};
        parsed = {...parsed, items};
    }

    function setItemUnitPrice(idx: number, v: string) {
        if (!parsed) return;
        const items = parsed.items.slice();
        const unitPrice = Math.max(0, toIntVnd(v));
        items[idx] = {...items[idx], unitPrice};
        parsed = {...parsed, items};
    }

    function addItem() {
        if (!parsed) return;
        parsed = {
            ...parsed,
            items: [...parsed.items, {name: '', qty: 1, unitPrice: 0}],
        };
    }

    function removeItem(idx: number) {
        if (!parsed) return;
        parsed = {...parsed, items: parsed.items.filter((_, i) => i !== idx)};
    }

    function setExtra(key: 'tax' | 'tip' | 'discount', v: string) {
        if (!parsed) return;
        const next = Math.max(0, toIntVnd(v));
        parsed = {
            ...parsed,
            extras: {
                ...(parsed.extras ?? {tax: 0, tip: 0, discount: 0}),
                [key]: next,
            },
        };
    }

    const AI_PROMPT = `You are a data extraction assistant. Extract a restaurant or retail receipt from the attached image(s) into a STRICT JSON object that matches the required format below.

CRITICAL OUTPUT RULES:
- Output MUST be valid JSON ONLY (no markdown, no backticks, no explanation, no extra text).
- Currency is VND. ALL money values MUST be integers in VND (no decimals, no commas).
- Quantity MUST be an integer >= 1 for each item.
- Do NOT include subtotal or total fields; the app will compute totals automatically.
- Remove non-purchase lines (store address, cashier, table number, thank you text, etc.).
- Item names should be concise and readable; keep the original language if present.
- If the receipt lists the same item multiple times, merge them ONLY if it is clearly the same item.

PRICE HANDLING RULES:
- If the receipt shows line total but not unit price:
  unitPrice = round(lineTotal / qty)
- If the receipt shows unit price but not line total:
  lineTotal = qty * unitPrice
- If values are unclear, make the best reasonable guess from the receipt.
- Do NOT invent items that are not present.

REQUIRED JSON FORMAT (output exactly this structure):
{
  "billName": "<merchant name if visible, otherwise 'Bill'>",
  "items": [
    { "name": "<item name>", "qty": <integer>, "unitPrice": <integer VND> }
  ],
  "extras": {
    "tax": <integer VND optional>,
    "tip": <integer VND optional>,
    "discount": <integer VND optional>
  }
}

EXTRAS RULES:
- Put VAT or tax into "tax".
- Put service charge or tip into "tip".
- Put discounts or promotions into "discount" as a POSITIVE integer.
- Omit any extras field if it does not appear on the receipt.

FINAL CHECK BEFORE OUTPUT:
- JSON parses without errors.
- All numbers are integers.
- No trailing commas.
- No additional fields beyond the required format.

Now extract the receipt into the JSON format exactly.`;

    async function copyText(text: string) {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            // ignore in v1
        }
    }
</script>

<svelte:head>
    <title>Bill Split - Create</title>
</svelte:head>

<main class="container mx-auto w-full max-w-4xl px-4 pt-5 pb-10 sm:px-6">
    <!-- Header -->
    <div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <h1 class="text-2xl font-bold sm:text-3xl">Create a Bill (Owner)</h1>

        <!-- Tabs: stack on mobile, inline on desktop -->
        <div class="tabs-boxed tabs w-full sm:w-auto">
            <button
                class="tab flex-1 sm:flex-none"
                class:tab-active={mode === 'parse'}
                on:click={() => switchMode('parse')}
            >
                Parse JSON
            </button>

            <button
                class="tab flex-1 sm:flex-none"
                class:tab-active={mode === 'edit'}
                disabled={!parsed}
                on:click={() => switchMode('edit')}
                title={!parsed ? 'Parse valid JSON first' : ''}
            >
                Edit
            </button>
        </div>
    </div>

    <!-- 1) Owner Payment Information -->
    <div
        class="card mb-4 border border-base-200 bg-base-100 shadow-xl"
        class:border-base-200={!highlightOwnerInfo}
        class:border-error={highlightOwnerInfo}
        class:ring-2={highlightOwnerInfo}
        class:ring-error={highlightOwnerInfo}
    >
        <div class="card-body p-4 sm:p-6">
            <h2 class="card-title text-lg sm:text-xl">1) Owner Payment Information</h2>

            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div class="form-control w-full">
                    <div class="label">
                        <span class="label-text font-semibold">Bank</span>
                    </div>
                    <select bind:value={ownerBank} class="select-bordered select w-full">
                        <option value="" disabled selected> Select a bank </option>

                        {#each BANKS as bank (bank)}
                            <option value={bank.code}>
                                {bank.shortName} ({bank.code})
                            </option>
                        {/each}
                    </select>
                    {#if ownerBank}
                        <div class="label">
                            <span class="label-text-alt opacity-80"
                                >{BANKS.find(b => b.code === ownerBank)?.name}</span
                            >
                        </div>
                    {/if}
                </div>

                <div class="form-control w-full">
                    <div class="label">
                        <span class="label-text font-semibold">Account number</span>
                    </div>
                    <input
                        bind:value={ownerAccountNumber}
                        placeholder="digits only"
                        class="input-bordered input w-full"
                    />
                </div>
            </div>

            {#if hasOwnerInfo}
                <div class="collapse-arrow collapse mt-4 rounded-box bg-base-200">
                    <input type="checkbox" />
                    <div class="collapse-title font-semibold">Bookmark this setup</div>
                    <div class="collapse-content">
                        <p class="mb-2 text-sm opacity-80">
                            Save this link so next time your bank info is pre-filled.
                        </p>
                        {#key ownerBank + ownerAccountNumber}
                            <input
                                readonly
                                value={bookmarkUrl}
                                class="input-bordered input input-sm mb-3 w-full"
                            />
                        {/key}
                        <button
                            class="btn w-full btn-outline btn-sm sm:w-auto"
                            on:click={() => navigator.clipboard.writeText(bookmarkUrl)}
                        >
                            Copy bookmark link
                        </button>
                    </div>
                </div>
            {/if}
        </div>
    </div>

    <!-- Parse mode -->
    {#if mode === 'parse'}
        <div class="card mb-4 border border-base-200 bg-base-100 shadow-xl">
            <div class="card-body p-4 sm:p-6">
                <h2 class="card-title text-lg sm:text-xl">2) Extract Bill Data (AI)</h2>

                <p class="text-sm opacity-85">
                    Upload your receipt image to your AI (ChatGPT / Claude / etc.), paste this
                    prompt, and make sure the AI outputs <strong>JSON only</strong>. Then paste the
                    result below.
                </p>

                <div
                    class="mt-3 flex flex-col gap-2 sm:mt-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3"
                >
                    <button
                        class="btn w-full btn-sm btn-secondary sm:w-auto"
                        on:click={() => copyText(AI_PROMPT)}>Copy AI prompt</button
                    >
                    <span class="badge w-fit badge-ghost">Multimodal • Image → JSON</span>
                </div>

                <div class="collapse-arrow collapse mt-4 rounded-box bg-base-200">
                    <input type="checkbox" />
                    <div class="collapse-title font-semibold">Show prompt</div>
                    <div class="collapse-content">
                        <pre
                            class="overflow-x-auto rounded-lg bg-base-300 p-3
									text-xs whitespace-pre-wrap">{AI_PROMPT}</pre>
                    </div>
                </div>

                <div class="divider"></div>

                <p class="mb-2 text-base font-semibold sm:text-lg">Paste AI JSON below:</p>

                <textarea
                    bind:value={rawJson}
                    rows="14"
                    class="textarea-bordered textarea w-full font-mono text-sm"
                ></textarea>

                <div class="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <button class="btn w-full btn-primary sm:w-auto" on:click={onParse}>
                        Parse & Validate
                    </button>
                    {#if parsed}
                        <span class="badge w-fit gap-2 badge-success">Valid ✅</span>
                    {/if}
                </div>

                {#if validationErrors.length > 0}
                    <div class="mt-4 alert alert-error">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-6 w-6 shrink-0 stroke-current"
                            fill="none"
                            viewBox="0 0 24 24"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                        </svg>
                        <div>
                            <h3 class="font-bold">Fix these issues:</h3>
                            <ul class="list-inside list-disc text-sm">
                                {#each validationErrors as err (err)}
                                    <li>{err}</li>
                                {/each}
                            </ul>
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    {/if}

    <!-- Edit mode -->
    {#if mode === 'edit' && parsed}
        <div class="card border border-base-200 bg-base-100 shadow-xl">
            <div class="card-body p-4 sm:p-6">
                <h2 class="card-title text-lg sm:text-xl">2) Edit Bill</h2>
                <p class="text-sm opacity-80">
                    Adjust bill name, items, quantities, prices, and extras. Totals update
                    instantly.
                </p>

                <!-- Top section: stacks on mobile, side-by-side on md -->
                <div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div class="form-control w-full">
                        <div class="label">
                            <span class="label-text font-semibold"
                                >Bill name (transaction note)</span
                            >
                        </div>
                        <input
                            value={parsed.billName}
                            class="input-bordered input w-full"
                            on:input={e => setBillName((e.currentTarget as HTMLInputElement).value)}
                        />
                    </div>

                    <div class="rounded-lg bg-base-200 p-3 text-sm">
                        <div class="flex justify-between gap-3">
                            <span class="opacity-80">Items total:</span>
                            <span class="font-medium tabular-nums">{formatVnd(itemsTotal)} VND</span
                            >
                        </div>
                        <div class="flex justify-between gap-3">
                            <span class="opacity-80">Extras net:</span>
                            <span class="font-medium tabular-nums">{formatVnd(extrasNet)} VND</span>
                        </div>
                        <div
                            class="mt-2 flex justify-between gap-3 border-t border-base-content/20 pt-2"
                        >
                            <span class="font-bold">Computed total:</span>
                            <span class="font-bold text-primary tabular-nums"
                                >{formatVnd(computedBillTotal)} VND</span
                            >
                        </div>
                    </div>
                </div>

                <div class="divider my-5"></div>

                <!-- Extras: 1 col on mobile, 3 cols on md -->
                <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">Tax</legend>
                        <input
                            class="input-bordered input w-full"
                            inputmode="numeric"
                            value={String(parsed.extras?.tax ?? 0)}
                            on:input={e =>
                                setExtra('tax', (e.currentTarget as HTMLInputElement).value)}
                        />
                    </fieldset>

                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">Tip</legend>
                        <input
                            class="input-bordered input w-full"
                            inputmode="numeric"
                            value={String(parsed.extras?.tip ?? 0)}
                            on:input={e =>
                                setExtra('tip', (e.currentTarget as HTMLInputElement).value)}
                        />
                    </fieldset>

                    <fieldset class="fieldset">
                        <legend class="fieldset-legend">Discount</legend>
                        <input
                            class="input-bordered input w-full"
                            inputmode="numeric"
                            value={String(parsed.extras?.discount ?? 0)}
                            on:input={e =>
                                setExtra('discount', (e.currentTarget as HTMLInputElement).value)}
                        />
                    </fieldset>
                </div>

                <div class="divider my-5"></div>

                <h3 class="text-base font-semibold sm:text-lg">Items</h3>

                <!-- Mobile items editor (cards) -->
                <div class="mt-3 space-y-3 md:hidden">
                    {#each parsed.items as it, idx (idx)}
                        <div class="rounded-xl border border-base-200 bg-base-100 p-3 shadow-sm">
                            <div class="flex items-start justify-between gap-3">
                                <div class="min-w-0 flex-1">
                                    <div class="text-xs font-semibold opacity-70">Item</div>
                                    <input
                                        class="input-bordered input input-sm mt-1 w-full"
                                        value={it.name}
                                        placeholder="Item name"
                                        on:input={e =>
                                            setItemName(
                                                idx,
                                                (e.currentTarget as HTMLInputElement).value
                                            )}
                                    />
                                </div>

                                <button
                                    class="btn -mt-1 text-error btn-ghost btn-sm"
                                    on:click={() => removeItem(idx)}
                                    title="Remove"
                                >
                                    Remove
                                </button>
                            </div>

                            <div class="mt-3 grid grid-cols-2 gap-3">
                                <div>
                                    <div class="text-xs font-semibold opacity-70">Qty</div>
                                    <input
                                        class="input-bordered input input-sm mt-1 w-full text-right"
                                        inputmode="numeric"
                                        value={String(it.qty)}
                                        on:input={e =>
                                            setItemQty(
                                                idx,
                                                (e.currentTarget as HTMLInputElement).value
                                            )}
                                    />
                                </div>

                                <div>
                                    <div class="text-xs font-semibold opacity-70">Unit (VND)</div>
                                    <input
                                        class="input-bordered input input-sm mt-1 w-full text-right"
                                        inputmode="numeric"
                                        value={String(it.unitPrice)}
                                        on:input={e =>
                                            setItemUnitPrice(
                                                idx,
                                                (e.currentTarget as HTMLInputElement).value
                                            )}
                                    />
                                </div>
                            </div>

                            <div
                                class="mt-3 flex items-center justify-between border-t border-base-content/10 pt-3"
                            >
                                <span class="text-xs font-semibold opacity-70">Line total</span>
                                <span class="font-medium tabular-nums"
                                    >{formatVnd(it.qty * it.unitPrice)} VND</span
                                >
                            </div>
                        </div>
                    {/each}
                </div>

                <!-- Desktop items editor (table) -->
                <div class="mt-3 hidden overflow-x-auto md:block">
                    <table class="table w-full table-zebra">
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th class="text-right">Qty</th>
                                <th class="text-right">Unit (VND)</th>
                                <th class="text-right">Line (VND)</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each parsed.items as it, idx (idx)}
                                <tr>
                                    <td class="min-w-55">
                                        <input
                                            class="input-bordered input input-sm w-full"
                                            value={it.name}
                                            placeholder="Item name"
                                            on:input={e =>
                                                setItemName(
                                                    idx,
                                                    (e.currentTarget as HTMLInputElement).value
                                                )}
                                        />
                                    </td>
                                    <td class="min-w-27.5 text-right">
                                        <input
                                            class="input-bordered input input-sm w-full text-right"
                                            inputmode="numeric"
                                            value={String(it.qty)}
                                            on:input={e =>
                                                setItemQty(
                                                    idx,
                                                    (e.currentTarget as HTMLInputElement).value
                                                )}
                                        />
                                    </td>
                                    <td class="min-w-37.5 text-right">
                                        <input
                                            class="input-bordered input input-sm w-full text-right"
                                            inputmode="numeric"
                                            value={String(it.unitPrice)}
                                            on:input={e =>
                                                setItemUnitPrice(
                                                    idx,
                                                    (e.currentTarget as HTMLInputElement).value
                                                )}
                                        />
                                    </td>
                                    <td class="min-w-40 text-right font-medium tabular-nums">
                                        {formatVnd(it.qty * it.unitPrice)}
                                    </td>
                                    <td class="text-right">
                                        <button
                                            class="btn text-error btn-ghost btn-sm"
                                            on:click={() => removeItem(idx)}
                                            title="Remove"
                                        >
                                            Remove
                                        </button>
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>

                <div
                    class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                >
                    <button class="btn w-full btn-sm btn-secondary sm:w-auto" on:click={addItem}>
                        Add item
                    </button>
                </div>

                {#if validationErrors.length > 0}
                    <div class="mt-4 alert alert-error">
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
                            <h3 class="font-bold">Fix these issues:</h3>
                            <ul class="list-inside list-disc text-sm">
                                {#each validationErrors as err (err)}
                                    <li>{err}</li>
                                {/each}
                            </ul>
                        </div>
                    </div>
                {/if}

                <div class="mt-6 hidden items-center gap-3 sm:flex">
                    <button class="btn btn-primary" on:click={openBillPage}>
                        Generate bill link
                    </button>
                    <button class="btn btn-outline" on:click={() => switchMode('parse')}>
                        Back to JSON
                    </button>
                </div>

                <div class="border-t border-base-200 bg-base-100/95 backdrop-blur md:hidden">
                    <div class="container mx-auto max-w-4xl py-3">
                        <div class="flex flex-col gap-2">
                            <button class="btn w-full btn-primary" on:click={openBillPage}>
                                Generate bill link
                            </button>
                            <button
                                class="btn w-full btn-outline"
                                on:click={() => switchMode('parse')}
                            >
                                Back to JSON
                            </button>
                        </div>
                    </div>
                </div>

                <div class="mt-2 text-xs opacity-60">
                    This app is client-only. Your bill is encoded into the URL (no server storage).
                </div>
            </div>
        </div>
    {/if}
</main>
