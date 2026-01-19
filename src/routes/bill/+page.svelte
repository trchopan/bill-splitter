<script lang="ts">
    import type {PageData} from './$types';
    import QRCode from 'qrcode';
    import {generateQrEmvPayload} from '$lib/emvcode';
    import LZString from 'lz-string';

    export let data: PageData;

    $: shared = data.ok ? data.shared : null;
    let qrOnlyUrl: string | null = null;

    // Friend selection: quantities 0..item.qty
    let selectedQty: Record<string, number> = {};

    // UI state
    let qrDataUrl: string | null = null;
    let emvPayload: string | null = null;
    let bankLabel: string | null = null;
    let error: string | null = null;

    function initSelection() {
        if (!shared) return;
        const map: Record<string, number> = {};
        for (const it of shared.items) map[it.id] = 0;
        selectedQty = map;
    }

    // Initialize on load
    if (shared) initSelection();

    function clampQty(itemId: string, next: number) {
        if (!shared) return;
        const it = shared.items.find(x => x.id === itemId);
        if (!it) return;
        const clamped = Math.max(0, Math.min(it.qty, Math.trunc(next)));
        selectedQty = {...selectedQty, [itemId]: clamped};
    }

    function inc(itemId: string) {
        clampQty(itemId, (selectedQty[itemId] ?? 0) + 1);
    }

    function dec(itemId: string) {
        clampQty(itemId, (selectedQty[itemId] ?? 0) - 1);
    }

    function formatVnd(n: number): string {
        return `${Math.round(n)}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    $: billItemsTotal = shared
        ? shared.items.reduce((sum, it) => sum + it.qty * it.unitPrice, 0)
        : 0;

    $: selectedItemsSum = shared
        ? shared.items.reduce((sum, it) => sum + (selectedQty[it.id] ?? 0) * it.unitPrice, 0)
        : 0;

    $: extrasNet = shared?.extras
        ? (shared.extras.tax ?? 0) + (shared.extras.tip ?? 0) - (shared.extras.discount ?? 0)
        : 0;

    $: extrasShare =
        billItemsTotal > 0 ? Math.round((selectedItemsSum / billItemsTotal) * extrasNet) : 0;

    $: amountDue = selectedItemsSum + extrasShare;

    async function generateQr() {
        error = null;
        qrDataUrl = null;
        emvPayload = null;
        bankLabel = null;
        qrOnlyUrl = null;

        if (!shared) {
            error = 'Missing bill payload.';
            return;
        }

        if (amountDue <= 0) {
            error = 'Please select at least 1 item.';
            return;
        }

        try {
            const {payload, bank} = generateQrEmvPayload({
                bank: shared.owner.bank,
                accountNumber: shared.owner.accountNumber,
                amount: amountDue,
                note: shared.billName, // requirement: note = bill name
                countryCode: shared.countryCode ?? 'VN',
                currencyNumeric: shared.currencyNumeric ?? '704',
                pointOfInitiationMethod: '12',
            });

            emvPayload = payload;
            bankLabel = `${bank.shortName} (${bank.code})`;

            qrDataUrl = await QRCode.toDataURL(payload, {
                errorCorrectionLevel: 'M',
                margin: 2,
                scale: 6,
            });

            const d = LZString.compressToEncodedURIComponent(payload);
            qrOnlyUrl = `${location.origin}/qr?d=${d}`;
        } catch (e: any) {
            error = e?.message ?? 'Failed to generate QR payload.';
        }
    }

    function resetQr() {
        qrDataUrl = null;
        emvPayload = null;
        bankLabel = null;
        qrOnlyUrl = null;
        error = null;
    }

    async function copyToClipboard(text: string) {
        try {
            await navigator.clipboard.writeText(text);
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
</script>

<svelte:head>
    <title>Bill Split - Select Items</title>
</svelte:head>

<main style="max-width: 980px; margin: 0 auto; padding: 24px;">
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
            style="display:flex; align-items:flex-start; justify-content:space-between; gap: 16px;"
        >
            <div>
                <h1 style="margin:0;">{shared.billName}</h1>
                <div style="opacity:0.85; margin-top:6px;">
                    Select your items (integer quantities). Then generate QR to pay.
                </div>
            </div>
            <div style="text-align:right; opacity:0.85;">
                <div>
                    <strong>Pay to:</strong>
                    {shared.owner.bank} • {shared.owner.accountNumber}
                </div>
            </div>
        </header>

        <section style="margin-top: 18px; overflow-x:auto;">
            <table style="width:100%; border-collapse: collapse;">
                <thead>
                    <tr>
                        <th style="text-align:left; border-bottom:1px solid #ddd; padding:8px;"
                            >Item</th
                        >
                        <th style="text-align:right; border-bottom:1px solid #ddd; padding:8px;"
                            >Unit (VND)</th
                        >
                        <th style="text-align:right; border-bottom:1px solid #ddd; padding:8px;"
                            >Available</th
                        >
                        <th style="text-align:right; border-bottom:1px solid #ddd; padding:8px;"
                            >My qty</th
                        >
                        <th style="text-align:right; border-bottom:1px solid #ddd; padding:8px;"
                            >Line (VND)</th
                        >
                    </tr>
                </thead>
                <tbody>
                    {#each shared.items as it (it)}
                        <tr>
                            <td style="padding:8px; border-bottom:1px solid #f0f0f0;">{it.name}</td>
                            <td
                                style="padding:8px; border-bottom:1px solid #f0f0f0; text-align:right;"
                                >{formatVnd(it.unitPrice)}</td
                            >
                            <td
                                style="padding:8px; border-bottom:1px solid #f0f0f0; text-align:right;"
                                >{it.qty}</td
                            >
                            <td
                                style="padding:8px; border-bottom:1px solid #f0f0f0; text-align:right;"
                            >
                                <div style="display:inline-flex; align-items:center; gap:8px;">
                                    <button
                                        on:click={() => {
                                            dec(it.id);
                                            resetQr();
                                        }}
                                        disabled={(selectedQty[it.id] ?? 0) <= 0}>−</button
                                    >
                                    <input
                                        value={selectedQty[it.id] ?? 0}
                                        inputmode="numeric"
                                        style="width:56px; text-align:center; padding:6px;"
                                        on:input={e => {
                                            const v = Number(
                                                (e.currentTarget as HTMLInputElement).value
                                            );
                                            clampQty(it.id, v);
                                            resetQr();
                                        }}
                                    />
                                    <button
                                        on:click={() => {
                                            inc(it.id);
                                            resetQr();
                                        }}
                                        disabled={(selectedQty[it.id] ?? 0) >= it.qty}>+</button
                                    >
                                </div>
                            </td>
                            <td
                                style="padding:8px; border-bottom:1px solid #f0f0f0; text-align:right;"
                            >
                                {formatVnd((selectedQty[it.id] ?? 0) * it.unitPrice)}
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </section>

        {#if shared.extras}
            <section style="margin-top: 12px; opacity: 0.9;">
                <strong>Extras on bill:</strong>
                Tax {formatVnd(shared.extras.tax ?? 0)} • Tip {formatVnd(shared.extras.tip ?? 0)} • Discount
                {formatVnd(shared.extras.discount ?? 0)}
                <div style="margin-top:6px;">
                    Your extras share is proportional to your selected subtotal.
                </div>
            </section>
        {/if}

        <section
            style="margin-top: 18px; padding: 12px; border: 1px solid #ddd; border-radius: 8px;"
        >
            <div style="display:flex; justify-content:space-between; gap: 16px; flex-wrap: wrap;">
                <div>
                    <div><strong>Items subtotal:</strong> {formatVnd(selectedItemsSum)} VND</div>
                    {#if shared.extras}
                        <div><strong>Extras share:</strong> {formatVnd(extrasShare)} VND</div>
                    {/if}
                    <div style="margin-top:6px; font-size: 18px;">
                        <strong>Total to pay:</strong>
                        {formatVnd(amountDue)} VND
                    </div>
                </div>

                <div style="display:flex; gap: 10px; align-items:flex-end;">
                    <button on:click={generateQr} disabled={amountDue <= 0}>Generate QR</button>
                    <button
                        on:click={() => {
                            initSelection();
                            resetQr();
                        }}
                        style="opacity:0.85;">Clear</button
                    >
                </div>
            </div>

            {#if error}
                <div
                    style="margin-top: 10px; padding: 10px; border: 1px solid #ffb4b4; background:#fff5f5;"
                >
                    {error}
                </div>
            {/if}

            {#if qrDataUrl && emvPayload}
                <div
                    style="margin-top: 14px; display: grid; grid-template-columns: 220px 1fr; gap: 16px; align-items: start;"
                >
                    <div
                        style="border:1px solid #eee; border-radius: 10px; padding: 10px; width: fit-content;"
                    >
                        <img
                            src={qrDataUrl}
                            alt="QR Payment"
                            style="display:block; width: 200px; height: 200px;"
                        />
                    </div>

                    <div>
                        <div style="opacity:0.9;">
                            <div><strong>Note:</strong> {shared.billName}</div>
                            <div><strong>Bank:</strong> {bankLabel ?? shared.owner.bank}</div>
                            <div><strong>Account:</strong> {shared.owner.accountNumber}</div>
                            <div><strong>Amount:</strong> {formatVnd(amountDue)} VND</div>
                        </div>

                        <div style="margin-top: 10px; display:flex; gap: 8px; flex-wrap: wrap;">
                            <button on:click={() => copyToClipboard(emvPayload!)}
                                >Copy EMV payload</button
                            >
                            <button
                                on:click={() => downloadPng(qrDataUrl!, `qr-payment-${amountDue}.png`)}
                                >Download QR PNG</button
                            >
                            {#if qrOnlyUrl}
                                <button on:click={() => copyToClipboard(qrOnlyUrl!)}
                                    >Copy QR-only link</button
                                >
                                <a
                                    href={qrOnlyUrl}
                                    style="display:inline-block; padding: 8px 12px; border: 1px solid #ccc; border-radius: 6px; text-decoration: none;"
                                >
                                    Open QR page
                                </a>
                            {/if}
                        </div>

                        {#if qrOnlyUrl}
                            <div style="margin-top: 10px;">
                                <div style="font-weight: 600; margin-bottom: 6px;">
                                    QR-only link
                                </div>
                                <input
                                    readonly
                                    value={qrOnlyUrl}
                                    style="width: 100%; padding: 8px;"
                                />
                            </div>
                        {/if}

                        <details style="margin-top: 10px;">
                            <summary>Debug: EMV payload</summary>
                            <pre
                                style="white-space: pre-wrap; word-break: break-all;">{emvPayload}</pre>
                        </details>
                    </div>
                </div>
            {/if}
        </section>

        <footer style="margin-top: 18px; opacity: 0.75; font-size: 13px;">
            This is a serverless link. Item selection is not locked across users; please coordinate
            with your friends.
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
    input {
        border: 1px solid #ccc;
        border-radius: 6px;
    }
</style>
