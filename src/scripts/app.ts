import { initTheme } from './ui/theme';
import { ALL_POKEMON, loadAll } from './core/data';
import { setupNavStack, renderCurrent, navigateToMon } from './core/router';
import { bindAbilityTooltips, bindTypeTooltips } from './ui/tooltip';
import { buildSearchIndex, wireSearchSuggest } from './ui/suggest';
import { buildFilters, renderTable } from './ui/table';

export async function start() {
    initTheme();

    await loadAll()

    buildFilters(ALL_POKEMON);
    bindAbilityTooltips()
    bindTypeTooltips()

    buildSearchIndex()
    wireSearchSuggest();

    setupNavStack()

    const grid = document.querySelector<HTMLElement>("#grid");
    if (grid) grid.setAttribute("data-all-pokemon", JSON.stringify(ALL_POKEMON));

    const q = document.querySelector<HTMLInputElement>("#q");
    const typeSel = document.querySelector<HTMLSelectElement>("#type");
    const rerender = () => renderTable(ALL_POKEMON);
    // q?.addEventListener("input", rerender);
    typeSel?.addEventListener("change", rerender);

    grid?.addEventListener("click", (e) => {
        const target = e.target as HTMLElement;
        if (target.closest("a")) return; // let ability links navigate
        const tr = target.closest<HTMLTableRowElement>("tr.rowlink");
        if (tr?.dataset.id) navigateToMon(tr.dataset.id);
    });
    grid?.addEventListener("keydown", (e: KeyboardEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest("a")) return; // don't hijack Enter on a link
        if (e.key === "Enter" || e.key === " ") {
            const tr = target.closest<HTMLTableRowElement>("tr.rowlink");
            if (tr?.dataset.id) {
                e.preventDefault();
                navigateToMon(tr.dataset.id);
            }
        }
    });



    renderCurrent(); // first render now sees ABIL, so names show up everywhere
}
