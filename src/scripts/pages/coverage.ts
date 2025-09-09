import { ALL_POKEMON, typeData } from "../core/data";
import { Mon } from "../core/types";
import { typeIconTag } from "../util/assets";
import { attackMultiplier } from "../util/typing";
import { applyDexTableSizing, buildTableHTML, measureWidths } from "../ui/table";
import { wireFallbacks } from "../util/dom";

let selected: string[] = [];

function allPlayableTypes(): string[] {
  const ids = Object.keys(typeData || {});
  return ids.filter(t => t !== 'QMARKS' && t !== 'TYPELESS').sort((a,b) => (typeData[a]?.index ?? 0) - (typeData[b]?.index ?? 0));
}

function toggleType(id: string) {
  const i = selected.indexOf(id);
  if (i >= 0) { selected.splice(i, 1); return; }
  if (selected.length >= 4) return; // max 4
  selected.push(id);
}

function headerHTML(): string {
  const types = allPlayableTypes();
  const icon = (t: string) => {
    const on = selected.includes(t);
    const img = typeIconTag(t).replace('class="type-icon"', 'class="type-icon" style="width:28px;height:28px"');
    return `<button class="type-toggle" data-type="${t}" title="${t}"
              style="appearance:none;border:0;background:transparent;padding:4px;border-radius:8px;cursor:pointer;filter:${on ? 'none' : 'grayscale(100%) opacity(.5)'}">${img}</button>`;
  };
  return `<section class="panel" style="padding:8px 10px;">
    <div class="type-toggle-row" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center;">${types.map(icon).join('')}</div>
  </section>`;
}

function bucketize(pokemon: Mon[]): Record<string, Mon[]> {
  const out: Record<string, Mon[]> = {
    immune: [], strong: [], resist: [], neutral: [], super: [], very: []
  } as any;
  const T = selected.slice();
  for (const p of pokemon) {
    if (T.length === 0) continue;
    const mults = T.map(t => attackMultiplier(t, p.types || []));
    const anyEq = (x:number) => mults.some(m=>m===x);
    const allLe = (x:number) => mults.every(m=>m<=x);
    if (anyEq(0)   && allLe(0))   { out.immune.push(p); continue; }
    if (anyEq(0.25)&& allLe(0.25)){ out.strong.push(p); continue; }
    if (anyEq(0.5) && allLe(0.5)) { out.resist.push(p); continue; }
    if (anyEq(1)   && allLe(1))   { out.neutral.push(p); continue; }
    if (anyEq(2)   && allLe(2))   { out.super.push(p); continue; }
    if (anyEq(4)   && allLe(4))   { out.very.push(p); continue; }
  }
  return out;
}

function sectionsHTML(): string {
  if (selected.length === 0) return '';
  const groups = bucketize(ALL_POKEMON);
  const sec = (title: string, list: Mon[]) => `
    <section class="panel" style="margin-top:12px;">
      <h2 style="margin:10px 12px 6px; font-size:14px; opacity:.8;">${title}</h2>
      ${buildTableHTML(list)}
    </section>`;
  return [
    sec('Immune', groups.immune),
    sec('Strongly resists', groups.strong),
    sec('Resists', groups.resist),
    sec('Neutral', groups.neutral),
    sec('Super Effective', groups.super),
    sec('Very Effective', groups.very),
  ].join('');
}

export function renderCoverage() {
  const grid = document.querySelector<HTMLElement>('#grid');
  const count = document.querySelector<HTMLElement>('#count');
  if (!grid || !count) return;
  count.textContent = '';
  grid.innerHTML = headerHTML() + sectionsHTML();

  // Wire toggles
  grid.querySelectorAll<HTMLButtonElement>('button.type-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = btn.getAttribute('data-type') || '';
      toggleType(t);
      renderCoverage();
    });
  });

  // Make all dex tables use the same measured widths as the main page
  // Compute once using the full Pokédex, then apply to every table in this view
  try {
    const widths = measureWidths(ALL_POKEMON);
    const tables = grid.querySelectorAll<HTMLTableElement>('table.dex-table');
    tables.forEach((table) => {
      table.style.setProperty("--col-icon", `44px`);
      table.style.setProperty("--col-typing", `110px`);
      table.style.setProperty("--col-name", `${widths.name}px`);
      table.style.setProperty("--col-ability", `${widths.ability}px`);
      table.style.setProperty("--col-hidden", `${widths.hidden}px`);
      table.style.setProperty("--col-bst", `${widths.bst}px`);
      table.style.setProperty("--col-stat", `${widths.stat}px`);
    });
  } catch {}
  // Ensure icon fallbacks work
  wireFallbacks(grid, 'img.dex-icon');
}
