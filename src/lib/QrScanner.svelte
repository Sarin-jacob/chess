<script lang="ts">
  // Camera QR reader. Uses the browser's BarcodeDetector where there is one (Chrome on
  // Android and macOS) and falls back to jsQR, fetched only when first needed.
  import { onDestroy, onMount } from 'svelte';

  let { onresult, oncancel }: {
    /** Called with each code seen: true stops scanning, a string is shown as a hint (wrong QR). */
    onresult: (text: string) => boolean | string | Promise<boolean | string>;
    oncancel: () => void;
  } = $props();

  let video = $state<HTMLVideoElement>();
  let error = $state('');
  let hint = $state('');
  let hintTimer = 0;
  let stream: MediaStream | null = null;
  let timer = 0;
  let stopped = false;

  type Reader = (v: HTMLVideoElement) => Promise<string | null>;

  async function makeReader(): Promise<Reader> {
    const BD = (window as any).BarcodeDetector;
    if (BD && (await BD.getSupportedFormats?.())?.includes('qr_code')) {
      const det = new BD({ formats: ['qr_code'] });
      return async (v) => (await det.detect(v))[0]?.rawValue ?? null;
    }
    const jsQR = (await import('jsqr')).default;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    return async (v) => {
      const scale = Math.min(1, 1024 / v.videoWidth);
      canvas.width = Math.round(v.videoWidth * scale);
      canvas.height = Math.round(v.videoHeight * scale);
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
    };
  }

  function stop() {
    stopped = true;
    clearTimeout(timer);
    clearTimeout(hintTimer);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  onMount(async () => {
    try {
      // Without size hints phones hand over 640x480, too coarse for a dense QR code.
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      if (stopped) return stop();
      stream.getVideoTracks()[0]?.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => {});
      const v = video!;
      v.srcObject = stream;
      await v.play();
      const read = await makeReader();
      const loop = async () => {
        if (stopped) return;
        if (v.readyState >= 2 && v.videoWidth) {
          const text = await read(v).catch(() => null);
          const res = text ? await onresult(text) : false;
          if (res === true) return stop();
          if (typeof res === 'string') {
            hint = res;
            clearTimeout(hintTimer);
            hintTimer = window.setTimeout(() => (hint = ''), 2500);
          }
        }
        timer = window.setTimeout(loop, 200);
      };
      loop();
    } catch (e) {
      error = e instanceof DOMException && e.name === 'NotAllowedError'
        ? 'Camera permission was refused. Paste the code instead.'
        : 'No camera available. Paste the code instead.';
    }
  });

  onDestroy(stop);
</script>

<div class="scanner">
  {#if error}
    <p class="error">{error}</p>
  {:else}
    <div class="view">
      <!-- svelte-ignore a11y_media_has_caption -->
      <video bind:this={video} playsinline muted></video>
      <span class="frame" aria-hidden="true"></span>
    </div>
    <small class="tip" class:warn={!!hint}>{hint || 'Hold the QR code inside the square, about a hand-span away.'}</small>
  {/if}
  <button onclick={() => { stop(); oncancel(); }}>Stop scanning</button>
</div>

<style>
  .scanner { display: grid; gap: 0.4rem; }
  .view { position: relative; overflow: hidden; border-radius: 10px; background: #000; }
  video { display: block; width: 100%; height: 240px; object-fit: cover; }
  .frame {
    position: absolute;
    left: 50%;
    top: 50%;
    height: 72%;
    aspect-ratio: 1;
    translate: -50% -50%;
    border: 2px solid var(--accent);
    border-radius: 12px;
    box-shadow: 0 0 0 999px rgb(0 0 0 / 0.25);
    pointer-events: none;
  }
  .error { color: #f87171; margin: 0; font-size: 0.85rem; }
  .tip { color: var(--muted); font-size: 0.78rem; text-align: center; }
  .tip.warn { color: #fbbf24; }
</style>
