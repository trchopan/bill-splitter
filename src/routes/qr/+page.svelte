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

<main class="container mx-auto w-full max-w-2xl px-4 pt-5 pb-10 sm:px-6">
    <!-- Header -->
    <div class="mb-5 flex flex-col gap-2 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
        <h1 class="text-2xl font-bold sm:text-3xl">QR Payment</h1>
    </div>

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
                <div class="min-w-0">
                    <h3 class="font-bold">Invalid link</h3>
                    <ul class="list-inside list-disc text-sm">
                        {#each data.errors as e (e)}
                            <li class="break-words">{e}</li>
                        {/each}
                    </ul>
                    <p class="mt-2 text-xs opacity-85">
                        Example:
                        <code class="badge font-mono break-all whitespace-normal badge-neutral"
                            >/qr?d=&lt;base64url(emv_payload)&gt;</code
                        >
                    </p>
                </div>
            </div>
        </div>
    {:else}
        {#if error}
            <div class="mb-5 alert alert-error shadow-lg sm:mb-6">
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
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        /></svg
                    >
                    <span class="break-words">{error}</span>
                </div>
            </div>
        {/if}

        {#if qrDataUrl && data.payload}
            <div class="card border border-base-200 bg-base-100 shadow-xl">
                <div class="card-body p-4 sm:p-6">
                    <!-- Layout: stack on mobile, side-by-side on md -->
                    <div class="flex flex-col gap-5 md:flex-row md:items-start md:gap-8">
                        <!-- QR -->
                        <div class="mx-auto w-full max-w-[320px] md:mx-0 md:w-auto">
                            <div
                                class="rounded-xl border border-base-300 bg-white p-3 shadow-sm sm:p-4"
                            >
                                <img
                                    src={qrDataUrl}
                                    alt="QR"
                                    class="mx-auto block h-56 w-56 sm:h-64 sm:w-64"
                                />
                            </div>
                        </div>

                        <!-- Details / Actions -->
                        <div class="w-full flex-1 space-y-4">
                            <div>
                                <h2 class="mb-1 text-lg font-bold sm:text-xl">Scan to Pay</h2>
                                <p class="text-sm opacity-70">
                                    Use your banking app to scan this QR code.
                                </p>
                            </div>

                            <!-- Buttons: stack on mobile, inline on desktop -->
                            <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3">
                                <button
                                    class="btn w-full btn-primary sm:w-auto"
                                    on:click={() => copyToClipboard(data.payload!)}
                                >
                                    Copy EMV payload
                                </button>
                                <button
                                    class="btn w-full btn-outline sm:w-auto"
                                    on:click={() => downloadPng(qrDataUrl!, 'bill.png')}
                                >
                                    Download PNG
                                </button>
                            </div>

                            <!-- Debug -->
                            <div
                                class="collapse-arrow collapse mt-2 rounded-box border border-base-300 bg-base-200"
                            >
                                <input type="checkbox" />
                                <div class="collapse-title text-sm font-medium">
                                    Debug: EMV payload
                                </div>
                                <div class="collapse-content">
                                    <pre
                                        class="p-2 font-mono text-xs break-all whitespace-pre-wrap opacity-80">{data.payload}</pre>
                                </div>
                            </div>

                            <!-- Small note for mobile -->
                            <div class="text-xs opacity-60">
                                If scanning fails, try downloading the PNG and importing it in your
                                banking app.
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        {/if}
    {/if}
</main>
