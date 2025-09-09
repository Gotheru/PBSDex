import { getAbilityInfo, resolveAbilityKey } from "../core/data";
import { Mon } from "../core/types";
import { escapeHtml } from "../util/fmt";
import { applyDexTableSizing, buildTableHTML } from "../ui/table";
import { scrollToTopNow, wireIconFallbacks } from "../util/dom";
import { navBack, setHeaderBack } from "../core/router"

export function renderAbilityDetail(pokemon: Mon[], id: string) {
    const grid  = document.querySelector<HTMLElement>("#grid");
    const count = document.querySelector<HTMLElement>("#count");
    if (!grid || !count) return;

    const aKey  = resolveAbilityKey(id);
    const info  = getAbilityInfo(aKey);
    const title = info?.name || id;

    // Standard header back button
    setHeaderBack();

    // Filter mons that have this ability (regular or hidden)
    const list = pokemon
        .filter(p => (p.abilities?.includes(aKey)) || p.hiddenAbility === aKey)
        .sort((a, b) => a.name.localeCompare(b.name));

    // Page
    grid.innerHTML = `
    <article class="detail">
      <h1 class="detail-name">${escapeHtml(title)}</h1>

      <section class="detail-block">
        ${escapeHtml(info?.description || "—")}
      </section>

      <section class="detail-block">
        <h2>Pokémon</h2>
        ${buildTableHTML(list)}
      </section>
    </article>
  `;

    // Keep table behavior consistent with main page
    wireIconFallbacks(grid);
    applyDexTableSizing(grid);

    // Start at top
    scrollToTopNow?.();
}
