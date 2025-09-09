import { initTheme } from './ui/theme';
import { ALL_POKEMON, loadAll, setGameId } from './core/data';
import { setupNavStack, renderCurrent, navigateToMon, navigateToList, parseRoute } from './core/router';
import { bindAbilityTooltips, bindTypeTooltips } from './ui/tooltip';
import { buildSearchIndex, wireSearchSuggest } from './ui/suggest';
import { renderTable } from './ui/table';

export async function start() {
    initTheme();

    const params = new URLSearchParams(location.search);
    const game = params.get('game') || 'main';
    setGameId(game);

    try {
        await loadAll();
    } catch (err: any) {
        console.error('Failed to load game data', err);
        const grid = document.querySelector<HTMLElement>("#grid");
        const count = document.querySelector<HTMLElement>("#count");
        if (count) count.textContent = '';
        if (grid) grid.innerHTML = `<div style="padding:16px;color:#b91c1c;background:#fee2e2;border:1px solid #fecaca;border-radius:8px;">Failed to load data. ${String(err?.message || err || '')}</div>`;
        return;
    }

    bindAbilityTooltips()
    bindTypeTooltips()

    buildSearchIndex()
    wireSearchSuggest();

    setupNavStack()

    const grid = document.querySelector<HTMLElement>("#grid");
    if (grid) grid.setAttribute("data-all-pokemon", JSON.stringify(ALL_POKEMON));

    const q = document.querySelector<HTMLInputElement>("#q");
    const rerender = () => renderTable(ALL_POKEMON);
    // q?.addEventListener("input", rerender);

    // Inject data-kind selector between search and theme toggle if not present
    const controls = document.querySelector('.controls');
    const themeBtn = document.querySelector('#theme-toggle');
    if (controls && themeBtn && !document.getElementById('data-kind')){
        const sel = document.createElement('select');
        sel.id = 'data-kind';
        sel.title = 'Select data type';
        sel.innerHTML = `
          <option value="mon" selected>Pokémon</option>
          <option value="loc">Locations</option>
          <option value="ability">Abilities</option>
          <option value="move">Moves</option>`;
        controls.insertBefore(sel, themeBtn);
        sel.addEventListener('change', () => {
          const route = parseRoute();
          if (route.kind !== 'list') navigateToList();
          else renderCurrent();
        });
    }

    grid?.addEventListener('click', (e) => {
        if (!(e.target as HTMLElement).closest('.mon-link')) return; // only our links
        // anchor href + router will handle navigation; nothing else to do
    });

    renderCurrent(); // first render now sees ABIL, so names show up everywhere
}
