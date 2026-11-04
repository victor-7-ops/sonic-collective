const control = document.querySelector<HTMLButtonElement>('[data-share-page]');
if (control) {
  const status = document.querySelector<HTMLElement>('[data-share-status]');
  const fallback = document.querySelector<HTMLInputElement>('[data-share-url]');
  const url = new URL(location.pathname, location.origin).toString();
  control.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
      if (status) status.textContent = 'Link copied.';
    } catch {
      if (fallback) { fallback.value = url; fallback.hidden = false; fallback.focus(); fallback.select(); }
      if (status) status.textContent = 'Copy was unavailable. The page link is selected so you can copy it.';
    }
  });
}
