<script lang="ts">
    import type {AiBillInput, SharedBillPayload} from '$lib/bill/types';
    import {validateAiBill} from '$lib/bill/validate';
    import {buildSharedBillPayload, computeItemsTotal, toIntVnd} from '$lib/bill/utils';
    import {encodeForUrl} from '$lib/bill/codec';
    import {BANKS} from '$lib/emvcode/EMVCodeUtil';
    import type {PageData} from './$types';

    export let data: PageData;

    let didApplyPreset = false;

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

    // Owner inputs (added after AI parse)
    let ownerBank: string = '';
    let ownerAccountNumber = '';

    // Apply presets exactly once on initial load
    if (!didApplyPreset) {
        if (data?.preset?.bank) ownerBank = data.preset.bank;
        if (data?.preset?.acct) ownerAccountNumber = data.preset.acct;
        didApplyPreset = true;
    }

    $: bookmarkUrl =
        `${location.origin}/?` +
        `bank=${encodeURIComponent(ownerBank.trim())}&` +
        `accountNumber=${encodeURIComponent(ownerAccountNumber.replace(/\s+/g, ''))}`;

    // Derived
    let shareUrl: string | null = null;
    let sharePayload: SharedBillPayload | null = null;

    function onParse() {
        shareUrl = null;
        sharePayload = null;
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
        if (!parsed.extras) {
            parsed.extras = {tax: 0, tip: 0, discount: 0};
        }
    }

    $: canGenerate =
        !!parsed &&
        ownerBank.trim().length > 0 &&
        ownerAccountNumber.replace(/\s+/g, '').length > 0;

    function onGenerateLink() {
        if (!parsed) return;
        if (!canGenerate) {
            validationErrors = [
                'Please fill in bank and account number before generating the link.',
            ];
            return;
        }

        sharePayload = buildSharedBillPayload({
            ai: parsed,
            ownerBank,
            ownerAccountNumber,
        });

        const encoded = encodeForUrl(sharePayload);
        // SvelteKit route we'll create next: /bill?b=...
        shareUrl = `${location.origin}/bill?b=${encoded}`;
    }

    function formatVnd(n: number): string {
        // Keep simple; avoid locale quirks in v1
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

<main class="container mx-auto max-w-4xl p-6">
    <h1 class="mb-6 text-3xl font-bold">Create a Bill (Owner)</h1>

    <div class="card bg-base-100 mb-6 border border-base-200 shadow-xl">
        <div class="card-body">
            <h2 class="card-title text-xl">1) Owner payment info</h2>

            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div class="form-control w-full">
                    <div class="label">
                        <span class="label-text font-semibold">Bank</span>
                    </div>
                    <select bind:value={ownerBank} class="select select-bordered w-full">
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
                        class="input input-bordered w-full"
                    />
                </div>
            </div>

            {#if ownerBank.trim() && ownerAccountNumber.replace(/\s+/g, '').length}
                <div class="collapse collapse-arrow bg-base-200 mt-4 rounded-box">
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
                                class="input input-bordered input-sm mb-3 w-full"
                            />
                        {/key}
                        <button
                            class="btn btn-sm btn-outline"
                            on:click={() => {
                                navigator.clipboard.writeText(bookmarkUrl);
                            }}
                        >
                            Copy bookmark link
                        </button>
                    </div>
                </div>
            {/if}
        </div>
    </div>

    <div class="card bg-base-100 mb-6 border border-base-200 shadow-xl">
        <div class="card-body">
            <h2 class="card-title text-xl">2) Extract bill JSON using AI</h2>

            <p class="text-sm opacity-85">
                Upload your receipt image to your AI (ChatGPT / Claude / etc.), paste this prompt,
                and make sure the AI outputs
                <strong>JSON only</strong>. Then paste the result below.
            </p>

            <div class="mt-2 flex flex-wrap items-center gap-3">
                <button class="btn btn-secondary btn-sm" on:click={() => copyText(AI_PROMPT)}
                    >Copy AI prompt</button
                >
                <span class="badge badge-ghost">Multimodal • Image → JSON</span>
            </div>

            <div class="collapse collapse-arrow bg-base-200 mt-4 rounded-box">
                <input type="checkbox" />
                <div class="collapse-title font-semibold">Show prompt</div>
                <div class="collapse-content">
                    <pre class="bg-base-300 whitespace-pre-wrap rounded-lg p-3 text-xs">{AI_PROMPT}</pre>
                </div>
            </div>

            <div class="divider"></div>

            <h3 class="mb-2 text-lg font-semibold">Paste AI JSON</h3>
            <p class="mb-2 text-sm opacity-85">
                Paste the JSON produced by your multimodal AI using our prompt. Then click “Parse &
                Validate”.
            </p>

            <textarea
                bind:value={rawJson}
                rows="14"
                class="textarea textarea-bordered w-full font-mono text-sm"
            ></textarea>

            <div class="mt-4 flex items-center gap-3">
                <button class="btn btn-primary" on:click={onParse}>Parse & Validate</button>
                {#if parsed}
                    <span class="badge badge-success gap-2">Valid ✅</span>
                {/if}
            </div>

            {#if validationErrors.length > 0}
                <div class="alert alert-error mt-4">
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
        </div>
    </div>

    {#if parsed}
        <div class="card bg-base-100 mb-6 border border-base-200 shadow-xl">
            <div class="card-body">
                <h2 class="card-title text-xl">3) Review</h2>

                <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div class="form-control w-full">
                        <div class="label">
                            <span class="label-text font-semibold"
                                >Bill name (transaction note)</span
                            >
                        </div>
                        <input
                            value={parsed.billName}
                            class="input input-bordered w-full"
                            on:input={e =>
                                (parsed = parsed
                                    ? {
                                          ...parsed,
                                          billName: (e.currentTarget as HTMLInputElement).value,
                                      }
                                    : parsed)}
                        />
                    </div>

                    <div class="bg-base-200 rounded-lg p-3 text-sm">
                        <div class="flex justify-between">
                            <span>Items total:</span>
                            <span class="font-medium">{formatVnd(itemsTotal)} VND</span>
                        </div>
                        {#if parsed.extras}
                            <div class="flex justify-between">
                                <span>Extras net:</span>
                                <span class="font-medium">{formatVnd(extrasNet)} VND</span>
                            </div>
                        {/if}
                        <div class="mt-2 flex justify-between border-t border-base-content/20 pt-2">
                            <span class="font-bold">Computed total:</span>
                            <span class="font-bold text-primary"
                                >{formatVnd(computedBillTotal)} VND</span
                            >
                        </div>
                    </div>
                </div>

                <div class="overflow-x-auto mt-4">
                    <table class="table table-zebra w-full">
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th class="text-right">Qty</th>
                                <th class="text-right">Unit (VND)</th>
                                <th class="text-right">Line (VND)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each parsed.items as it (it)}
                                <tr>
                                    <td>{it.name}</td>
                                    <td class="text-right">{it.qty}</td>
                                    <td class="text-right">{formatVnd(it.unitPrice)}</td>
                                    <td class="text-right font-medium"
                                        >{formatVnd(it.qty * it.unitPrice)}</td
                                    >
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>

                {#if parsed.extras}
                    <div class="alert alert-ghost mt-4 text-sm">
                        <div>
                            <span class="font-bold">Extras:</span>
                            Tax: {formatVnd(toIntVnd(parsed.extras.tax))}, Tip: {formatVnd(
                                toIntVnd(parsed.extras.tip)
                            )}, Discount: {formatVnd(toIntVnd(parsed.extras.discount))}
                        </div>
                    </div>
                {/if}
            </div>
        </div>

        <div class="mt-8 mb-12">
            <div class="flex items-center gap-3">
                <button
                    class="btn btn-primary btn-lg"
                    on:click={onGenerateLink}
                    disabled={!canGenerate}
                >
                    Generate share link
                </button>
                {#if shareUrl}
                    <div class="badge badge-success badge-lg gap-2">Link ready ✅</div>
                {/if}
            </div>

            {#if shareUrl}
                <div class="alert alert-info mt-6 shadow-lg">
                    <div class="w-full">
                        <h3 class="font-bold">Share this link with friends:</h3>
                        <input
                            readonly
                            value={shareUrl}
                            class="input input-bordered w-full mt-2 text-sm"
                        />
                        <div class="mt-3 flex gap-2">
                            <button
                                class="btn btn-sm btn-outline bg-base-100"
                                on:click={() => {
                                    navigator.clipboard.writeText(shareUrl ?? '');
                                }}
                            >
                                Copy link
                            </button>

                            <a href={shareUrl} class="btn btn-sm btn-neutral"> Open bill page </a>
                        </div>

                        <div class="collapse collapse-arrow bg-base-100/50 mt-4 rounded-box">
                            <input type="checkbox" />
                            <div class="collapse-title text-sm font-medium">
                                Debug: payload preview
                            </div>
                            <div class="collapse-content">
                                <pre class="text-xs">{JSON.stringify(sharePayload, null, 2)}</pre>
                            </div>
                        </div>
                    </div>
                </div>
            {/if}
        </div>
    {/if}
</main>
