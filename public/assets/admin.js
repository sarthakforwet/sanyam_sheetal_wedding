/* Admin conveniences: confirmations, copy links, audience pickers, QR scanner. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  $$('form[data-confirm]').forEach((f) => f.addEventListener('submit', (e) => {
    if (!confirm(f.dataset.confirm)) e.preventDefault();
  }));

  $$('[data-copy]').forEach((btn) => btn.addEventListener('click', async () => {
    const text = btn.parentElement.querySelector('[data-copy-text]')?.textContent.trim();
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
    } catch { /* clipboard blocked */ }
  }));

  const aud = $('[data-audience]');
  if (aud) {
    const sync = () => $$('[data-aud-for]').forEach((fs) => { fs.hidden = fs.dataset.audFor !== aud.value; });
    aud.addEventListener('change', sync);
    sync();
  }

  // Camera QR scanner (Chrome/Android BarcodeDetector). iPhones can simply
  // use the built-in camera app, which opens the pass URL directly.
  const start = $('[data-scan-start]');
  const box = $('[data-scanner]');
  if (start && box) {
    if (!('BarcodeDetector' in window)) {
      start.hidden = true;
      return;
    }
    start.addEventListener('click', async () => {
      const video = $('video', box);
      const status = $('.scan-status', box);
      box.hidden = false;
      start.hidden = true;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = stream;
        await video.play();
        const detector = new BarcodeDetector({ formats: ['qr_code'] });
        status.textContent = 'Looking for a pass…';
        const loop = async () => {
          try {
            const codes = await detector.detect(video);
            const hit = codes.map((c) => c.rawValue).find((v) => /\/c\/[A-Za-z0-9]+/.test(v));
            if (hit) {
              stream.getTracks().forEach((t) => t.stop());
              location.href = new URL(hit).pathname;
              return;
            }
          } catch { /* frame not ready */ }
          requestAnimationFrame(loop);
        };
        loop();
      } catch {
        status.textContent = 'Camera unavailable — type the pass code instead.';
      }
    });
  }
})();
