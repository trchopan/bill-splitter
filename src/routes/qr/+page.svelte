<script lang="ts">
    import type {PageData} from './$types';
    import QRCode from 'qrcode';

    export let data: PageData;

    let qrDataUrl: string | null = null;
    let error: string | null = null;

    async function renderQr() {
        error = null;
        qrDataUrl = null;

        if (!data.ok || !data.payload) {
            error = (data.errors && data.errors[0]) || 'Invalid payload';
            return;
        }

        try {
            qrDataUrl = await QRCode.toDataURL(data.payload, {
                errorCorrectionLevel: 'M',
                margin: 2,
                scale: 7,
            });
        } catch (e: any) {
            error = e?.message ?? 'Failed to render QR.';
        }
    }

    renderQr();

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
    <title>Pay by QR</title>
</svelte:head>

<main style="max-width: 820px; margin: 0 auto; padding: 24px;">
    <h1>QR</h1>

    {#if !data.ok}
        <div
            style="margin-top: 12px; padding: 12px; border: 1px solid #ffb4b4; background: #fff5f5;"
        >
            <strong>Invalid link</strong>
            <ul style="margin: 8px 0 0 18px;">
                {#each data.errors as e (e)}
                    <li>{e}</li>
                {/each}
            </ul>
            <p style="margin-top: 10px; opacity: 0.85;">
                Example: <code>/qr?d=&lt;base64url(emv_payload)&gt;</code>
            </p>
        </div>
    {:else}
        {#if error}
            <div
                style="margin-top: 12px; padding: 12px; border: 1px solid #ffb4b4; background: #fff5f5;"
            >
                {error}
            </div>
        {/if}

        {#if qrDataUrl && data.payload}
            <div
                style="margin-top: 16px; display:flex; gap: 16px; align-items:flex-start; flex-wrap: wrap;"
            >
                <div
                    style="border:1px solid #eee; border-radius: 10px; padding: 10px; width: fit-content;"
                >
                    <img
                        src={qrDataUrl}
                        alt="QR"
                        style="display:block; width: 260px; height: 260px;"
                    />
                </div>

                <div style="flex: 1; min-width: 280px;">
                    <div style="display:flex; gap: 10px; flex-wrap: wrap;">
                        <button on:click={() => copyToClipboard(data.payload!)}>
                            Copy EMV payload
                        </button>
                        <button on:click={() => downloadPng(qrDataUrl!, 'bill.png')}>
                            Download PNG
                        </button>
                    </div>

                    <details style="margin-top: 12px;">
                        <summary>Debug: EMV payload</summary>
                        <pre
                            style="white-space: pre-wrap; word-break: break-all; margin-top: 8px;">{data.payload}</pre>
                    </details>
                </div>
            </div>
        {/if}
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
    code {
        background: #f6f6f6;
        padding: 2px 6px;
        border-radius: 6px;
    }
</style>
