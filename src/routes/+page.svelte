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

<!-- svelte-ignore a11y_label_has_associated_control -->
<main style="max-width: 980px; margin: 0 auto; padding: 24px;">
    <h1>Create a Bill (Owner)</h1>

    <section style="margin-top: 16px; padding: 12px; border: 1px solid #ddd; border-radius: 10px;">
        <h2>1) Owner payment info</h2>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            <div>
                <label style="display:block; font-weight: 600; margin-bottom: 6px;"> Bank </label>

                <select bind:value={ownerBank} style="width: 100%; padding: 8px;">
                    <option value="" disabled selected> Select a bank </option>

                    {#each BANKS as bank (bank)}
                        <option value={bank.code}>
                            {bank.shortName} ({bank.code})
                        </option>
                    {/each}
                </select>

                {#if ownerBank}
                    <div style="margin-top: 6px; font-size: 13px; opacity: 0.8;">
                        {BANKS.find(b => b.code === ownerBank)?.name}
                    </div>
                {/if}
            </div>

            <div>
                <label style="display:block; font-weight: 600; margin-bottom: 6px;">
                    Account number
                </label>
                <input
                    bind:value={ownerAccountNumber}
                    placeholder="digits only"
                    style="width: 100%; padding: 8px;"
                />
            </div>
        </div>

        {#if ownerBank.trim() && ownerAccountNumber.replace(/\s+/g, '').length}
            <details style="margin-top: 10px;">
                <summary style="cursor: pointer; font-weight: 600;">Bookmark this setup</summary>
                <div
                    style="margin-top: 10px; padding: 10px; border: 1px solid #ddd; border-radius: 8px; background: #fafafa;"
                >
                    <div style="opacity: 0.85; margin-bottom: 8px;">
                        Save this link so next time your bank info is pre-filled.
                    </div>

                    {#key ownerBank + ownerAccountNumber}
                        <input readonly value={bookmarkUrl} style="width: 100%; padding: 8px;" />
                    {/key}

                    <div style="margin-top: 8px; display:flex; gap: 8px; flex-wrap: wrap;">
                        <button
                            on:click={() => {
                                navigator.clipboard.writeText(bookmarkUrl);
                            }}
                        >
                            Copy bookmark link
                        </button>
                    </div>
                </div>
            </details>
        {/if}
    </section>

    <section style="margin-top: 16px; padding: 12px; border: 1px solid #ddd; border-radius: 10px;">
        <h2>2) Extract bill JSON using AI</h2>

        <p style="margin: 0; opacity: 0.85;">
            Upload your receipt image to your AI (ChatGPT / Claude / etc.), paste this prompt, and
            make sure the AI outputs
            <strong>JSON only</strong>. Then paste the result below.
        </p>

        <div
            style="margin-top: 10px; display:flex; gap: 10px; align-items:center; flex-wrap: wrap;"
        >
            <button on:click={() => copyText(AI_PROMPT)}>Copy AI prompt</button>
            <span style="font-size: 13px; opacity: 0.75;"> Multimodal • Image → JSON </span>
        </div>

        <details style="margin-top: 10px;">
            <summary style="cursor: pointer; font-weight: 600;">Show prompt</summary>
            <pre
                style="margin-top: 10px; padding: 12px; background:#f7f7f7; border-radius: 8px; white-space: pre-wrap;">{AI_PROMPT}</pre>
        </details>

        <h2 style="margin: 16px 0 8px 0;">Paste AI JSON</h2>

        <p style="margin: 8px 0; opacity: 0.85;">
            Paste the JSON produced by your multimodal AI using our prompt. Then click “Parse &
            Validate”.
        </p>

        <textarea
            bind:value={rawJson}
            rows="14"
            style="width: 100%; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size: 13px; padding: 12px;"
        ></textarea>

        <div style="display: flex; gap: 12px; align-items: center; margin-top: 12px;">
            <button on:click={onParse}>Parse & Validate</button>
            {#if parsed}
                <span style="color: #0a7a2f;">Valid ✅</span>
            {/if}
        </div>

        {#if validationErrors.length > 0}
            <div
                style="margin-top: 12px; padding: 12px; border: 1px solid #ffb4b4; background: #fff5f5;"
            >
                <strong>Fix these issues:</strong>
                <ul>
                    {#each validationErrors as err (err)}
                        <li>{err}</li>
                    {/each}
                </ul>
            </div>
        {/if}
    </section>

    {#if parsed}
        <section
            style="margin-top: 16px; padding: 12px; border: 1px solid #ddd; border-radius: 10px;"
        >
            <h2>2) Review</h2>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                <div>
                    <label style="display:block; font-weight: 600; margin-bottom: 6px;"
                        >Bill name (used as transaction note)</label
                    >
                    <input
                        value={parsed.billName}
                        on:input={e =>
                            (parsed = parsed
                                ? {...parsed, billName: (e.currentTarget as HTMLInputElement).value}
                                : parsed)}
                        style="width: 100%; padding: 8px;"
                    />
                </div>

                <div style="opacity: 0.9;">
                    <div><strong>Items total:</strong> {formatVnd(itemsTotal)} VND</div>
                    {#if parsed.extras}
                        <div><strong>Extras net:</strong> {formatVnd(extrasNet)} VND</div>
                    {/if}
                    <div>
                        <strong>Computed bill total:</strong>
                        {formatVnd(computedBillTotal)} VND
                    </div>
                </div>
            </div>

            <div style="margin-top: 16px; overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr>
                            <th
                                style="text-align:left; border-bottom: 1px solid #ddd; padding: 8px;"
                            >
                                Item
                            </th>
                            <th
                                style="text-align:right; border-bottom: 1px solid #ddd; padding: 8px;"
                            >
                                Qty
                            </th>
                            <th
                                style="text-align:right; border-bottom: 1px solid #ddd; padding: 8px;"
                            >
                                Unit (VND)
                            </th>
                            <th
                                style="text-align:right; border-bottom: 1px solid #ddd; padding: 8px;"
                            >
                                Line (VND)
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each parsed.items as it (it)}
                            <tr>
                                <td style="padding: 8px; border-bottom: 1px solid #f0f0f0;">
                                    {it.name}
                                </td>
                                <td
                                    style="padding: 8px; border-bottom: 1px solid #f0f0f0; text-align:right;"
                                >
                                    {it.qty}
                                </td>
                                <td
                                    style="padding: 8px; border-bottom: 1px solid #f0f0f0; text-align:right;"
                                >
                                    {formatVnd(it.unitPrice)}
                                </td>
                                <td
                                    style="padding: 8px; border-bottom: 1px solid #f0f0f0; text-align:right;"
                                >
                                    {formatVnd(it.qty * it.unitPrice)}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>

            {#if parsed.extras}
                <div style="margin-top: 12px; opacity: 0.9;">
                    <strong>Extras:</strong>
                    Tax: {formatVnd(toIntVnd(parsed.extras.tax))}, Tip: {formatVnd(
                        toIntVnd(parsed.extras.tip)
                    )}, Discount: {formatVnd(toIntVnd(parsed.extras.discount))}
                </div>
            {/if}
        </section>

        <section style="margin-top: 24px;">
            <div style="display: flex; gap: 12px; align-items: center; margin-top: 12px;">
                <button on:click={onGenerateLink} disabled={!canGenerate}>
                    Generate share link
                </button>
                {#if shareUrl}
                    <span style="color:#0a7a2f;">Link ready ✅</span>
                {/if}
            </div>

            {#if shareUrl}
                <div
                    style="margin-top: 12px; padding: 12px; border: 1px solid #d8e7ff; background: #f5f9ff;"
                >
                    <div style="font-weight: 700; margin-bottom: 6px;">
                        Share this link with friends:
                    </div>
                    <input readonly value={shareUrl} style="width: 100%; padding: 8px;" />
                    <div style="margin-top: 8px; display: flex; gap: 8px;">
                        <button
                            on:click={() => {
                                navigator.clipboard.writeText(shareUrl ?? '');
                            }}
                        >
                            Copy link
                        </button>

                        <a
                            href={shareUrl}
                            style="display:inline-block; padding: 8px 12px; border: 1px solid #ccc; text-decoration: none;"
                        >
                            Open bill page
                        </a>
                    </div>

                    <details style="margin-top: 10px;">
                        <summary>Debug: payload preview</summary>
                        <pre style="white-space: pre-wrap;">{JSON.stringify(
                                sharePayload,
                                null,
                                2
                            )}</pre>
                    </details>
                </div>
            {/if}
        </section>
    {/if}
</main>

<style>
    button {
        padding: 8px 12px;
        border: 1px solid #ccc;
        background: #fff;
        cursor: pointer;
    }
    button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    input {
        border: 1px solid #ccc;
        border-radius: 4px;
    }
    textarea {
        border: 1px solid #ccc;
        border-radius: 4px;
    }
</style>
