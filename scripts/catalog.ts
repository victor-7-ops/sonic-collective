import { filterCatalogItems, parseCatalogQuery } from '../src/lib/search';

type Item = { id:string;title:string;searchText:string;seriesId:'sessions'|'covers'|null;source:'curated'|'youtube';featuredOrder?:number;publishedAt?:string;format?:'full'|'short' };
const root = document.querySelector<HTMLElement>('[data-catalog-root]');
if (root) {
  const form = root.querySelector<HTMLFormElement>('[data-filter-form]')!;
  const cards = [...root.querySelectorAll<HTMLElement>('[data-catalog-card]')];
  const count = root.querySelector<HTMLElement>('[data-result-count]')!;
  const empty = root.querySelector<HTMLElement>('[data-empty-state]')!;
  const clearButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-clear-filters]')];
  const items = JSON.parse(root.querySelector<HTMLScriptElement>('[data-catalog-data]')!.textContent!) as Item[];
  const byId = new Map(cards.map((card) => [card.dataset.catalogCard!, card]));
  let typingTimer: ReturnType<typeof setTimeout> | undefined;

  function stateFromForm() {
    const values = new FormData(form);
    return parseCatalogQuery(new URLSearchParams({ format: String(values.get('format')??'all'), q: String(values.get('q') ?? ''), series: String(values.get('series') ?? 'all'), sort: String(values.get('sort') ?? 'featured') }));
  }
  function paramsFor(state: ReturnType<typeof stateFromForm>) {
    const params = new URLSearchParams();
    if (state.format && state.format !== 'all') params.set('format', state.format);
    if (state.q) params.set('q', state.q);
    if (state.series !== 'all') params.set('series', state.series);
    if (state.sort !== 'featured') params.set('sort', state.sort);
    return params;
  }
  function render(state = stateFromForm()) {
    const results = filterCatalogItems(items,state);
    const visible = new Set(results.map((item) => item.id));
    cards.forEach((card) => { card.hidden = !visible.has(card.dataset.catalogCard!); });
    results.forEach((item) => { const card = byId.get(item.id); if (card) root!.querySelector('[data-catalog-grid]')!.append(card); });
    count.textContent = `${results.length} ${results.length === 1 ? 'performance' : 'performances'}`;
    empty.hidden = results.length > 0;
    return state;
  }
  function updateUrl(mode: 'replace' | 'push') {
    const params = paramsFor(stateFromForm());
    const next = `${location.pathname}${params.size ? `?${params}` : ''}${location.hash}`;
    history[mode === 'push' ? 'pushState' : 'replaceState'](null, '', next);
  }
  function fromUrl() {
    const state = parseCatalogQuery(location.search);
    (form.elements.namedItem('format') as HTMLSelectElement).value = state.format??'all';
    (form.elements.namedItem('q') as HTMLInputElement).value = state.q;
    (form.elements.namedItem('series') as HTMLSelectElement).value = state.series;
    (form.elements.namedItem('sort') as HTMLSelectElement).value = state.sort;
    render(state);
  }
  form.addEventListener('input', (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.name === 'q') {
      if (typingTimer) clearTimeout(typingTimer);
      typingTimer = setTimeout(() => { render(); updateUrl('replace'); }, 150);
    }
  });
  form.addEventListener('change', (event) => {
    if (event.target instanceof HTMLSelectElement) { if (typingTimer) clearTimeout(typingTimer); render(); updateUrl('push'); }
  });
  clearButtons.forEach((clear) => clear.addEventListener('click', (event) => {
    event.preventDefault(); if (typingTimer) clearTimeout(typingTimer);
    (form.elements.namedItem('format') as HTMLSelectElement).value = 'all';
    (form.elements.namedItem('q') as HTMLInputElement).value = '';
    (form.elements.namedItem('series') as HTMLSelectElement).value = 'all';
    (form.elements.namedItem('sort') as HTMLSelectElement).value = 'featured';
    render(); updateUrl('push');
    (form.elements.namedItem('q') as HTMLInputElement).focus();
  }));
  window.addEventListener('popstate', fromUrl);
  fromUrl();
}
