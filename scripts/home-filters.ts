const labels: Record<string,string> = { all: 'performances', sessions: 'Sonic Sessions', covers: 'Sonic Covers' };
document.querySelectorAll<HTMLElement>('[data-featured-archive]').forEach((root) => {
  const buttons=[...root.querySelectorAll<HTMLButtonElement>('[data-featured-filter]')];
  const items=[...root.querySelectorAll<HTMLElement>('[data-featured-item]')];
  const count=root.querySelector<HTMLElement>('[data-featured-count]');
  for(const button of buttons)button.addEventListener('click',()=>{
    const selected=button.dataset.featuredFilter??'all';
    for(const item of items)item.hidden=selected!=='all'&&item.dataset.series!==selected;
    for(const other of buttons)other.setAttribute('aria-pressed',String(other===button));
    const visible=items.filter(item=>!item.hidden).length;
    if(count)count.textContent=String(visible)+' '+(labels[selected]??'performances')+' shown';
  });
});
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-rail-prev],[data-rail-next]')){
  const railId=button.dataset.railPrev??button.dataset.railNext;
  const rail=document.querySelector<HTMLElement>('[data-rail="'+railId+'"]');
  button.addEventListener('click',()=>rail?.scrollBy({left:(button.dataset.railPrev?-1:1)*(rail?.clientWidth??0)*.82,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}));
}
