import { typeData, ALL_POKEMON, movesIndex } from "../core/data";
import { navBack } from "../core/router";
import { buildTableHTML, applyDexTableSizing } from "../ui/table";
import { typeIconTag, typeLinkIconTag } from "../util/assets";
import { wireIconFallbacks } from "../util/dom";
import { defendingBuckets, attackingBuckets } from "../util/typing";
import { buildMovesTableNoLv } from "./move";

export function renderTypeDetail(typeId: string) {
    const grid  = document.querySelector<HTMLElement>("#grid");
    const count = document.querySelector<HTMLElement>("#count");
    if (!grid || !count) return;

    const title = typeData?.[typeId]?.name || typeId;
    const def = defendingBuckets(typeId);
    const atk = attackingBuckets(typeId);

    // Pokémon of this type
    const mons = ALL_POKEMON
        .filter(m => (m.types || []).includes(typeId))
        .sort((a,b)=> a.name.localeCompare(b.name));

    // Moves of this type
    const moveIds = Object.keys(movesIndex || {}).filter(id => movesIndex[id]?.type === typeId);

    count.innerHTML = `<button class="header-back" aria-label="Back">← Back</button>`;
    count.querySelector<HTMLButtonElement>(".header-back")?.addEventListener("click", navBack);


    grid.innerHTML = `
  <article class="detail type-detail">
    <header class="type-head panel">
      <div class="type-title">
        ${typeIconTag(typeId)}
        <h1>${title}</h1>
      </div>

      <div class="type-grid">
        <section class="panel type-box">
          <h2><b>Defending</b></h2>
          <div class="tip-row"><b>Immune to:</b> <span class="tip-icons">${def.immune.map(typeLinkIconTag).join("") || "—"}</span></div>
          <div class="tip-row"><b>Resists:</b>   <span class="tip-icons">${def.resist.map(typeLinkIconTag).join("") || "—"}</span></div>
          <div class="tip-row"><b>Weak to:</b>   <span class="tip-icons">${def.weak.map(typeLinkIconTag).join("")   || "—"}</span></div>
        </section>

        <section class="panel type-box">
          <h2><b>Attacking</b></h2>
          <div class="tip-row"><b>Super effective:</b>   <span class="tip-icons">${atk.superEff.map(typeLinkIconTag).join("") || "—"}</span></div>
          <div class="tip-row"><b>Not very effective:</b><span class="tip-icons">${atk.notVery.map(typeLinkIconTag).join("") || "—"}</span></div>
          <div class="tip-row"><b>No effect:</b>         <span class="tip-icons">${atk.noEffect.map(typeLinkIconTag).join("") || "—"}</span></div>
        </section>
      </div>
    </header>

    <section class="type-mons">
      <h2>Pokémon with ${title}</h2>
      ${buildTableHTML(mons)}
    </section>

    <section class="type-moves">
      <h2>Moves of type ${title}</h2>
      ${buildMovesTableNoLv("", moveIds)}
    </section>
  </article>`;

    // Make tables match the main sizing + fallback icons
    wireIconFallbacks(grid);
    applyDexTableSizing(grid);
}