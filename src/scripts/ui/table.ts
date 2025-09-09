import { ABIL, LOCS, MON_BY_INTERNAL, abilityName, movesIndex } from "../core/data";
import { navBack } from "../core/router";
import { Mon } from "../core/types";
import { bst, buildDetailHTML } from "../pages/mon";
import { abilityLinkHTML, categoryIconTag, iconCandidates, locHref, miniIconHTML, moveLinkHTML, typeLinkIconTag, typingIconsLinkedHTML } from "../util/assets";
import { wireFallbacks } from "../util/dom";
import { escapeHTML } from "./suggest";

export function applyDexTableSizing(container: HTMLElement) {
    const table = container.querySelector<HTMLTableElement>(".dex-table");
    if (!table) return;
    const allDataJson = container.getAttribute("data-all-pokemon");
    if (!allDataJson) return;
    const allData: Mon[] = JSON.parse(allDataJson);
    const widths = measureWidths(allData);
    table.style.setProperty("--col-icon", `44px`);
    table.style.setProperty("--col-typing", `110px`);   // NEW
    table.style.setProperty("--col-name", `${widths.name}px`);
    table.style.setProperty("--col-ability", `${widths.ability}px`);
    table.style.setProperty("--col-hidden", `${widths.hidden}px`);
    table.style.setProperty("--col-bst", `${widths.bst}px`);
    table.style.setProperty("--col-stat", `${widths.stat}px`);
}

export function measureWidths(pokemon: Mon[]) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
    const w = (s: string) => Math.ceil(ctx.measureText(s ?? "").width);

    const maxName = Math.max(...pokemon.map(p => w(p.name)), w("Name"));

    const typeStrings = new Set<string>(["Type1", "Type2"]);
    pokemon.forEach(p => p.types.forEach(t => typeStrings.add(t)));
    const maxType = Math.max(...[...typeStrings].map(w));

    const abilityStrings = new Set<string>(["Ability1", "Ability2"]);
    pokemon.forEach(p => p.abilities.forEach(a => abilityStrings.add(abilityName(a))));
    const maxAbility = Math.max(...[...abilityStrings].map(w));

    const hiddenStrings = new Set<string>(["Hidden Ability"]);
    pokemon.forEach(p => { if (p.hiddenAbility) hiddenStrings.add(abilityName(p.hiddenAbility)); });
    const maxHidden = Math.max(...[...hiddenStrings].map(w));

    const bstStrings = new Set<string>(["BST"]);
    pokemon.forEach(p => bstStrings.add(String(bst(p.stats))));
    const maxBST = Math.max(...[...bstStrings].map(w));

    const statStrings = new Set<string>(["HP","Atk","Def","SpA","SpD","Spe"]);
    pokemon.forEach(p => {
        const s = p.stats;
        ["hp","atk","def","spa","spd","spe"].forEach(k => statStrings.add(String((s as any)[k])));
    });
    const maxStat = Math.max(...[...statStrings].map(w));

    const fudge = 6;
    const cap = { name:120, type:70, ability:95, hidden:100, bst:36, stat:30 };

    return {
        name:   Math.min(maxName   + fudge, cap.name),
        type:   Math.min(maxType   + fudge, cap.type),
        ability:Math.min(maxAbility+ fudge, cap.ability),
        hidden: Math.min(maxHidden + fudge, cap.hidden),
        bst:    Math.min(maxBST    + fudge, cap.bst),
        stat:   Math.min(maxStat   + fudge, cap.stat),
    };
}

export type SortKey =
    | "num" | "name" | "typing"
    | "ability1" | "ability2" | "hidden"
    | "hp" | "atk" | "def" | "spa" | "spd" | "spe" | "bst";

export type SortDir = "asc" | "desc";

export let sortState: { key: SortKey; dir: SortDir } = { key: "num", dir: "asc" };

export function getFieldForSort(p: Mon, key: SortKey): string | number {
    switch (key) {
        case "num":  return (p as any).num ?? 0;
        case "name":   return p.name || "";
        case "typing": return (p.types?.[0] || "") + " " + (p.types?.[1] || "");
        case "ability1": return abilityName(p.abilities?.[0]);
        case "ability2": return abilityName(p.abilities?.[1]);
        case "hidden":   return abilityName(p.hiddenAbility);
        case "hp":   return p.stats.hp;
        case "atk":  return p.stats.atk;
        case "def":  return p.stats.def;
        case "spa":  return p.stats.spa;
        case "spd":  return p.stats.spd;
        case "spe":  return p.stats.spe;
        case "bst":  return bst(p.stats);
    }
}

export function cmp(a: Mon, b: Mon, key: SortKey, dir: SortDir): number {
    const av = getFieldForSort(a, key);
    const bv = getFieldForSort(b, key);
    let n = 0;
    if (typeof av === "number" && typeof bv === "number") {
        n = av - bv;
    } else {
        n = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
    }
    return dir === "asc" ? n : -n;
}

export function buildTableHTML(list: Mon[]) {
    const arrow = (key: SortKey) =>
        sortState.key === key ? `<span class="sort-arrow">${sortState.dir === "asc" ? "▲" : "▼"}</span>` : "";
    const th = (label: string, key: SortKey) =>
        `<th data-sort="${key}" tabindex="0" class="sortable">${label} ${arrow(key)}</th>`;

    return `
<table class="dex-table">
  <thead>
    <tr>
      <th class="icon-col" aria-label="Sprite"></th>
      ${th("Name", "name")}
      ${th("Typing", "typing")}
      ${th("Ability1", "ability1")}
      ${th("Ability2", "ability2")}
      ${th("Hidden Ability", "hidden")}
      ${th("HP", "hp")}
      ${th("Atk", "atk")}
      ${th("Def", "def")}
      ${th("SpA", "spa")}
      ${th("SpD", "spd")}
      ${th("Spe", "spe")}
      ${th("BST", "bst")}
    </tr>
  </thead>
  <tbody>
    ${list.map(p => {
        const ability1 = p.abilities[0] ? abilityLinkHTML(p.abilities[0]) : "";
        const ability2 = p.abilities[1] ? abilityLinkHTML(p.abilities[1]) : "";
        const hidden   = p.hiddenAbility ? abilityLinkHTML(p.hiddenAbility, { hidden: true }) : "";
        const sum = bst(p.stats);
        const srcs = iconCandidates(p);
        const icon = `
        <img class="dex-icon"
             src="${srcs[0]}"
             data-srcs="${srcs.join('|')}"
             data-idx="0"
             alt="" loading="lazy" decoding="async">
        `;
        const monHref = `#/mon/${encodeURIComponent(p.id)}`;
        const iconSrcs = iconCandidates(p); // you already have this util
        return `
      <tr class="rowlink" tabindex="0" data-id="${p.id}">
        <td class="icon">
          <a class="mon-link icon" href="${monHref}" aria-label="${escapeHTML(p.name)}" title="${escapeHTML(p.name)}">
            <img class="dex-icon"
                src="${iconSrcs[0]}"
                data-srcs="${iconSrcs.join('|')}"
                data-idx="0"
                alt=""
                loading="lazy">
          </a>
        </td>

        <td class="name">
          <a class="mon-link name" href="${monHref}" title="${escapeHTML(p.name)}">
            <span class="mon-name">${escapeHTML(p.name)}</span>
          </a>
        </td>
        <td class="typing" title="${(p.types||[]).join(' | ')}">${typingIconsLinkedHTML(p.types)}</td>
        <td title="${abilityName(p.abilities[0])}">${ability1}</td>
        <td title="${abilityName(p.abilities[1])}">${ability2}</td>
        <td title="${abilityName(p.hiddenAbility)}">${hidden}</td>
        <td>${p.stats.hp}</td>
        <td>${p.stats.atk}</td>
        <td>${p.stats.def}</td>
        <td>${p.stats.spa}</td>
        <td>${p.stats.spd}</td>
        <td>${p.stats.spe}</td>
        <td>${sum}</td>
      </tr>`;
    }).join("")}
  </tbody>
</table>`;
}

export function renderTable(pokemon: Mon[]) {
    const grid    = document.querySelector<HTMLElement>("#grid");
    const count   = document.querySelector<HTMLElement>("#count");
    if (!grid || !count) return;


    const list = pokemon
        .sort((a, b) => cmp(a, b, sortState.key, sortState.dir));

    count.textContent = `${list.length} result${list.length === 1 ? "" : "s"}`;
    grid.innerHTML = buildTableHTML(list);

    // keep your column sizing logic
    const table = grid.querySelector<HTMLTableElement>(".dex-table");
    if (table) applyDexTableSizing(grid);
    wireFallbacks(grid, "img.dex-icon");
    wireTableSorting(pokemon);
}

export function wireTableSorting(pokemon: Mon[]) {
  const grid = document.querySelector<HTMLElement>("#grid");
  const table = grid?.querySelector<HTMLTableElement>(".dex-table");
  if (!table) return;

  table.querySelectorAll<HTMLTableCellElement>('th.sortable').forEach(th => {
    const key = th.getAttribute('data-sort') as SortKey | null;
    if (!key) return;

    const activate = () => {
      if (sortState.key === key) {
        sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
      } else {
        sortState.key = key;
        // default: names asc, numbers desc feels nicer; tweak if you want
        sortState.dir = (['name','typing','ability1','ability2','hidden'] as SortKey[]).includes(key) ? 'asc' : 'desc';
      }
      renderTable(pokemon); // re-render with new sort
    };

    th.addEventListener('click', activate);
    th.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
      }
    });
  });
}


export function renderDetail(pokemon: Mon[], id: string) {
    const grid  = document.querySelector<HTMLElement>("#grid");
    const count = document.querySelector<HTMLElement>("#count");
    if (!grid || !count) return;

    const mon = pokemon.find(m => m.id === id);
    if (!mon) {
        count.innerHTML = "";
        grid.innerHTML = `<div style="padding:16px;">Not found.</div>`;
        return;
    }

    // Put the Back button where “Details” used to be
    count.innerHTML = `<button class="header-back" aria-label="Back">← Back</button>`;
    count.querySelector<HTMLButtonElement>(".header-back")?.addEventListener("click", navBack);


    // Build the card WITHOUT an internal back button
    grid.innerHTML = buildDetailHTML(mon);

    // sprite fallback
    wireFallbacks(grid, "img.mon-front");
    wireFallbacks(grid, "img.type-icon");
    wireFallbacks(grid, "img.cat-icon");

}

// =========================
// Indexed list renderers
// =========================

type MoveSortKey = "name" | "category" | "power" | "accuracy" | "pp";
let moveSort: { key: MoveSortKey; dir: SortDir } = { key: "name", dir: "asc" };

function cmpMove(aId: string, bId: string, key: MoveSortKey, dir: SortDir): number {
  const a = (movesIndex as any)[aId] || {};
  const b = (movesIndex as any)[bId] || {};
  let av: any = a?.name || aId, bv: any = b?.name || bId;
  if (key === "category") { av = a?.category || ""; bv = b?.category || ""; }
  else if (key === "power") { av = a?.power ?? -1; bv = b?.power ?? -1; }
  else if (key === "accuracy") { av = a?.accuracy ?? -1; bv = b?.accuracy ?? -1; }
  else if (key === "pp") { av = a?.pp ?? -1; bv = b?.pp ?? -1; }
  let n = 0;
  if (typeof av === "number" && typeof bv === "number") n = av - bv; else n = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
  return dir === "asc" ? n : -n;
}

export function renderMovesIndex() {
  const grid = document.querySelector<HTMLElement>("#grid");
  const count = document.querySelector<HTMLElement>("#count");
  if (!grid || !count) return;

  const ids = Object.keys(movesIndex || {});
  ids.sort((a,b) => cmpMove(a,b, moveSort.key, moveSort.dir));
  count.textContent = `${ids.length} moves`;

  const arrow = (key: MoveSortKey) => moveSort.key === key ? `<span class=\"sort-arrow\">${moveSort.dir === "asc" ? "▲" : "▼"}</span>` : "";
  const th = (label: string, key?: MoveSortKey, cls?: string) =>
    key ? `<th data-sort=\"${key}\" tabindex=\"0\" class=\"sortable ${cls || ''}\">${label} ${arrow(key)}</th>`
        : `<th class=\"${cls || ''}\">${label}</th>`;

  grid.innerHTML = `
  <table class="moves-table no-lv">
    <thead>
      <tr>
        ${th("Move", "name", "mv-name")}
        ${th("Type", undefined, "mv-type")}
        ${th("Cat", "category", "mv-cat")}
        ${th("Power", "power", "mv-num")}
        ${th("Acc", "accuracy", "mv-num")}
        ${th("PP", "pp", "mv-num")}
        ${th("Description", undefined, "mv-desc")}
      </tr>
    </thead>
    <tbody>
      ${ids.map(id => {
        const mv = (movesIndex as any)[id] || {};
        const cat = mv?.category || "";
        const power = (cat === "Status" || mv?.power == null || mv?.power === 1) ? "—" : String(mv?.power ?? "—");
        const acc   = (mv?.accuracy == null || mv?.accuracy === 0) ? "—" : String(mv?.accuracy);
        const pp    = (mv?.pp ?? "—");
        const typeIcon = mv?.type ? typeLinkIconTag(mv.type) : "";
        const catIcon  = cat ? categoryIconTag(cat) : "";
        return `
          <tr>
            <td class="mv-name">${moveLinkHTML(id)}</td>
            <td class="mv-type">${typeIcon}</td>
            <td class="mv-cat">${catIcon}</td>
            <td class="mv-num">${power}</td>
            <td class="mv-num">${acc}</td>
            <td class="mv-num">${pp}</td>
            <td class="mv-desc">${mv?.description || ""}</td>
          </tr>`;
      }).join("")}
    </tbody>
  </table>`;

  const table = grid.querySelector<HTMLTableElement>(".moves-table");
  table?.querySelectorAll<HTMLTableCellElement>('th.sortable').forEach(th => {
    const key = th.getAttribute('data-sort') as MoveSortKey | null;
    if (!key) return;
    const activate = () => {
      if (moveSort.key === key) moveSort.dir = moveSort.dir === 'asc' ? 'desc' : 'asc';
      else { moveSort.key = key; moveSort.dir = 'asc'; }
      renderMovesIndex();
    };
    th.addEventListener('click', activate);
    th.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }});
  });
}

type AbilSortKey = "name";
let abilSort: { key: AbilSortKey; dir: SortDir } = { key: "name", dir: "asc" };

export function renderAbilitiesIndex() {
  const grid = document.querySelector<HTMLElement>("#grid");
  const count = document.querySelector<HTMLElement>("#count");
  if (!grid || !count) return;

  const entries = Object.entries(ABIL || {});
  entries.sort((a,b) => abilSort.dir === 'asc' ? (a[1]?.name || a[0]).localeCompare(b[1]?.name || b[0]) : (b[1]?.name || b[0]).localeCompare(a[1]?.name || a[0]));
  count.textContent = `${entries.length} abilities`;

  const arrow = `<span class=\"sort-arrow\">${abilSort.dir === "asc" ? "▲" : "▼"}</span>`;
  grid.innerHTML = `
  <table class="moves-table no-lv">
    <thead>
      <tr>
        <th data-sort="name" tabindex="0" class="sortable mv-name" style="width:20%;">Ability ${arrow}</th>
        <th class="mv-desc">Description</th>
      </tr>
    </thead>
    <tbody>
      ${entries.map(([id, a]) => `
        <tr>
          <td class="mv-name">${abilityLinkHTML(id)}</td>
          <td class="mv-desc">${a?.description || ''}</td>
        </tr>`).join("")}
    </tbody>
  </table>`;

  const th = grid.querySelector<HTMLTableCellElement>('th.sortable');
  th?.addEventListener('click', () => { abilSort.dir = abilSort.dir === 'asc' ? 'desc' : 'asc'; renderAbilitiesIndex(); });
  th?.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abilSort.dir = abilSort.dir === 'asc' ? 'desc' : 'asc'; renderAbilitiesIndex(); }});
}

export function renderLocationsIndex() {
  const grid = document.querySelector<HTMLElement>("#grid");
  const count = document.querySelector<HTMLElement>("#count");
  if (!grid || !count) return;

  const entries = Object.entries(LOCS || {});
  entries.sort((a,b) => (a[1]?.name || a[0]).localeCompare(b[1]?.name || b[0]));
  count.textContent = `${entries.length} locations`;

  grid.innerHTML = `
  <table class="moves-table no-lv">
    <thead>
      <tr>
        <th>Location</th>
        <th>Pokémon</th>
      </tr>
    </thead>
    <tbody>
      ${entries.map(([id, loc]) => {
        const seen = new Set<string>();
        for (const rows of Object.values(loc?.encounters || {})) {
          for (const r of (rows as any[])) {
            const intName = String(r?.[1] || '').trim();
            if (intName) seen.add(intName);
          }
        }
        const mons = Array.from(seen);
        mons.sort((a,b) => (MON_BY_INTERNAL[a]?.num ?? 0) - (MON_BY_INTERNAL[b]?.num ?? 0));
        const icons = `<span class=\"icon-list\" style=\"display:inline-flex;gap:6px;flex-wrap:wrap;align-items:center;\">${mons.map(x => miniIconHTML(x)).join("")}</span>`;
        const name = loc?.name || `#${id}`;
        return `
          <tr>
            <td class="loc"><a class="plain" href="${locHref(id)}">${escapeHTML(name)}</a></td>
            <td class="icons">${icons}</td>
          </tr>`;
      }).join("")}
    </tbody>
  </table>`;
}

export function renderListByKind(pokemon: Mon[], kind: 'mon'|'move'|'ability'|'loc') {
  if (kind === 'move') return renderMovesIndex();
  if (kind === 'ability') return renderAbilitiesIndex();
  if (kind === 'loc') return renderLocationsIndex();
  return renderTable(pokemon);
}
