const closeMenu = (button: HTMLButtonElement, panel: HTMLElement, restore: boolean) => { panel.dataset.expanded='false'; button.setAttribute('aria-expanded','false'); if(restore)button.focus(); };
for(const nav of document.querySelectorAll<HTMLElement>('.site-nav')){
  const button=nav.querySelector<HTMLButtonElement>('.site-nav__toggle'); const panel=nav.querySelector<HTMLElement>('.site-nav__links'); if(!button||!panel)continue;
  panel.dataset.expanded='false'; button.setAttribute('aria-expanded','false');
  button.addEventListener('click',()=>{const open=button.getAttribute('aria-expanded')!=='true';button.setAttribute('aria-expanded',String(open));panel.dataset.expanded=String(open);});
  nav.addEventListener('keydown',(event)=>{if(event.key==='Escape'&&button.getAttribute('aria-expanded')==='true')closeMenu(button,panel,true);});
  panel.addEventListener('click',(event)=>{if((event.target as Element).closest('a')&&matchMedia('(max-width: 760px)').matches)closeMenu(button,panel,false);});
  matchMedia('(min-width: 761px)').addEventListener('change',(event)=>{panel.dataset.expanded='false';button.setAttribute('aria-expanded','false');if(event.matches)button.blur();});
}
document.documentElement.classList.add('nav-ready');


