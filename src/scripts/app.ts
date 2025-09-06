import { initTheme } from './ui/theme';
import { ALL_POKEMON, loadAll } from './core/data';
import { setupNavStack, renderCurrent, navigateToMon } from './core/router';
import { bindAbilityTooltips, bindTypeTooltips } from './ui/tooltip';
import { buildSearchIndex, wireSearchSuggest } from './ui/suggest';
import { renderTable } from './ui/table';

export async function start() {
    initTheme();

    await loadAll()

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

    grid?.addEventListener('click', (e) => {
        if (!(e.target as HTMLElement).closest('.mon-link')) return; // only our links
        // anchor href + router will handle navigation; nothing else to do
    });

    renderCurrent(); // first render now sees ABIL, so names show up everywhere
}
