import { moveDisplayName, movesIndex, pokemonLearnersOf } from "../core/data";
import { tFlag, tTarget } from "../core/intl";
import { navBack, setHeaderBack } from "../core/router";
import { buildTableHTML, applyDexTableSizing } from "../ui/table";
import { categoryIconTag, moveLinkHTML, typeLinkIconTag } from "../util/assets";
import { wireIconFallbacks } from "../util/dom";

export function moveRowHTML(moveId: string) {
    const mv = movesIndex?.[moveId] || null;

    const name = moveDisplayName(moveId);
    const typeIcon = mv?.type ? typeLinkIconTag(mv.type) : "";
    const catIcon  = categoryIconTag(mv?.category);

    // Power: em-dash for Status / null / 1
    const power = (mv?.category === "Status" || mv?.power == null || mv?.power === 1) ? "—" : String(mv.power ?? "—");
    // Accuracy: em-dash for 0 or missing
    const acc   = (mv?.accuracy == null || mv?.accuracy === 0) ? "—" : String(mv.accuracy);
    // PP
    const pp    = (mv?.pp ?? "—");
    const desc  = mv?.description || "";

    return `
    <tr>
      <td class="mv-name" title="${name}">${moveLinkHTML(moveId)}</td>
      <td class="mv-type">${typeIcon}</td>
      <td class="mv-cat">${catIcon}</td>
      <td class="mv-num">${power}</td>
      <td class="mv-num">${acc}</td>
      <td class="mv-num">${pp}</td>
      <td class="mv-desc">${desc}</td>
    </tr>`;
}

export function buildMovesTableNoLv(title: string, ids: string[]) {
    const uniq = Array.from(new Set(ids.filter(Boolean)));
    uniq.sort((a, b) => (moveDisplayName(a)).localeCompare(moveDisplayName(b)));

    const rows = uniq.map(moveRowHTML).join("");

    return `
  <section class="learnset">
    <h2 class="learnset-title">${title}</h2>
    ${
        uniq.length
            ? `<table class="moves-table no-lv">
           <thead>
             <tr>
               <th class="mv-name">Move</th>
               <th class="mv-type">Type</th>
               <th class="mv-cat">Cat</th>
               <th class="mv-num">Power</th>
               <th class="mv-num">Acc</th>
               <th class="mv-num">PP</th>
               <th class="mv-desc">Description</th>
             </tr>
           </thead>
           <tbody>${rows}</tbody>
         </table>`
            : `<div class="empty-learnset">No moves found.</div>`
    }
  </section>`;
}

export function buildMoveDetailHTML(moveId: string): string {
    const mv = movesIndex?.[moveId];
    if (!mv) return `<div style="padding:16px;">Move not found.</div>`;

    const typeIcon = mv.type ? typeLinkIconTag(mv.type) : "";
    const catIcon  = mv.category ? categoryIconTag(mv.category) : "";

    // numbers / labels
    const power = (mv.category === "Status" || mv.power == null || mv.power === 1) ? "—" : String(mv.power ?? "—");
    const acc   = (mv.accuracy == null || mv.accuracy === 0) ? "—" : String(mv.accuracy);
    const pp    = (mv.pp ?? "—");
    const prio  = (mv.priority == null ? "0" : String(mv.priority));
    const target= mv.target || "—";
    const targetText = tTarget(mv.target);
    const flags = Array.isArray(mv.flags) ? mv.flags : [];
    const flagsHTML = flags.length
        ? `<ul class="flag-list">${flags.map((f: any) => `<li>${tFlag(f)}</li>`).join("")}</ul>`
        : `<div class="empty-learnset">—</div>`;

    const learners = pokemonLearnersOf(moveId);
    const learnerTable = buildTableHTML(learners);

    // Inline flags text
    const flagsText = flags.length ? flags.join(", ") : "—";

    return `
  <article class="detail move-detail">
    <div class="move-header panel">
      <h1 class="move-name">${mv.name || moveId}</h1>

      <div class="move-kv">
        <div><span>Type</span><strong class="ico">${typeIcon}</strong></div>
        <div><span>Category</span><strong class="ico">${catIcon}</strong></div>
        <div><span>Power</span><strong>${power}</strong></div>
        <div><span>Accuracy</span><strong>${acc}</strong></div>
        <div><span>Priority</span><strong>${prio}</strong></div>
        <div><span>PP</span><strong>${pp}</strong></div>
      </div>
    </div>

    <section class="panel move-section">
      <p class="move-desc">${mv.description || ""}</p>
    </section>

    <section class="panel move-section">
      <p><b>Targets:</b> ${targetText}</p>
    </section>

    <section class="panel move-section">
      <p><b>Move flags:</b> ${flagsHTML}</p>
    </section>

    <section class="move-learners">
      <h2>Pokémon that learn ${mv.name || moveId}</h2>
      ${learnerTable}
    </section>
  </article>`;
}

export function renderMoveDetail(moveId: string) {
    const grid  = document.querySelector<HTMLElement>("#grid");
    const count = document.querySelector<HTMLElement>("#count");
    if (!grid || !count) return;

    setHeaderBack();


    grid.innerHTML = buildMoveDetailHTML(moveId);

    // Fallbacks + ensure learner table uses main table widths
    wireIconFallbacks(grid);
    applyDexTableSizing(grid);
}
