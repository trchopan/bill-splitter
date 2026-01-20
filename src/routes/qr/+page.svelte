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

<main class="container mx-auto max-w-2xl p-6">
    <h1 class="mb-6 text-3xl font-bold">QR Payment</h1>

    {#if !data.ok}
        <div class="alert alert-error shadow-lg">
            <div>
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="stroke-current flex-shrink-0 h-6 w-6"
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
                    <h3 class="font-bold">Invalid link</h3>
                    <ul class="list-disc list-inside text-sm">
                        {#each data.errors as e (e)}
                            <li>{e}</li>
                        {/each}
                    </ul>
                    <p class="mt-2 opacity-85 text-xs">
                        Example: <code class="badge badge-neutral font-mono"
                            >/qr?d=&lt;base64url(emv_payload)&gt;</code
                        >
                    </p>
                </div>
            </div>
        </div>
    {:else}
        {#if error}
            <div class="alert alert-error shadow-lg mb-6">
                <div>
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="stroke-current flex-shrink-0 h-6 w-6"
                        fill="none"
                        viewBox="0 0 24 24"
                        ><path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        /></svg
                    >
                    <span>{error}</span>
                </div>
            </div>
        {/if}

        {#if qrDataUrl && data.payload}
            <div class="card bg-base-100 shadow-xl border border-base-200">
                <div class="card-body">
                    <div class="flex flex-col md:flex-row gap-8 items-start">
                        <div
                            class="bg-white p-4 rounded-xl border border-base-300 shadow-sm mx-auto md:mx-0"
                        >
                            <img src={qrDataUrl} alt="QR" class="w-64 h-64 block" />
                        </div>

                        <div class="flex-1 w-full space-y-4">
                            <div>
                                <h2 class="card-title text-xl mb-1">Scan to Pay</h2>
                                <p class="text-sm opacity-70">
                                    Use your banking app to scan this QR code.
                                </p>
                            </div>

                            <div class="flex flex-wrap gap-3">
                                <button
                                    class="btn btn-primary"
                                    on:click={() => copyToClipboard(data.payload!)}
                                >
                                    Copy EMV payload
                                </button>
                                <button
                                    class="btn btn-outline"
                                    on:click={() => downloadPng(qrDataUrl!, 'bill.png')}
                                >
                                    Download PNG
                                </button>
                            </div>

                            <div
                                class="collapse collapse-arrow bg-base-200 border border-base-300 rounded-box mt-4"
                            >
                                <input type="checkbox" />
                                <div class="collapse-title font-medium text-sm">
                                    Debug: EMV payload
                                </div>
                                <div class="collapse-content">
                                    <pre
                                        class="whitespace-pre-wrap break-all text-xs font-mono p-2">{data.payload}</pre>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        {/if}
    {/if}
</main>
