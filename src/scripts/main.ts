// src/scripts/main.ts — table + simple detail view (hash router)

type Stats = { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
type Move = { level: number; move: string };
type Mon = {
    id: string;
    internalName: string;
    name: string;
    types: string[];
    stats: Stats;
    abilities: string[];
    hiddenAbility?: string;
    summary?: string;
    moves?: Move[];
};

// --- stat bar helpers ---
const STAT_MAX = 200; // scale: 0–100; values above 100 clamp to a full bar

function statBarHTML(v: number) {
    // width (0–100)
    const pct = Math.max(0, Math.min(100, Math.round((Math.min(v, STAT_MAX) / STAT_MAX) * 100)));
    // color hue: ~10 (red/orange) → ~50 (gold) as value increases
    const hue = Math.round(10 + (Math.min(v, STAT_MAX) / STAT_MAX) * 40);
    return `<div class="statbar" style="--w:${pct}%;--h:${hue}"></div>`;
}

function formatTyping(types: string[]): string {
    if (!types || types.length === 0) return "—";
    const t1 = types[0] ?? "";
    const t2 = types[1] ?? "";
    return t2 ? `${t1} | ${t2}` : t1;
}

function formatAbilities(abilities: string[], hidden?: string): string {
    const parts: string[] = [];
    if (abilities?.[0]) parts.push(abilities[0]);
    if (abilities?.[1]) parts.push(abilities[1]);
    if (hidden) parts.push(`<em>${hidden}</em>`);  // italic hidden
    return parts.length ? parts.join(" | ") : "—";
}


const toArray = (x: unknown): string[] => {
    if (Array.isArray(x)) return x.filter(Boolean) as string[];
    if (typeof x === "string") return x.split(",").map(s => s.trim()).filter(Boolean);
    if (x && typeof x === "object") return Object.values(x as Record<string, unknown>).map(String).filter(Boolean);
    return [];
};

const num = (x: unknown, d = 0): number => {
    const n = typeof x === "number" ? x : parseInt(String(x), 10);
    return Number.isFinite(n) ? n : d;
};

const slugify = (s: string) =>
    (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ---------- normalize one entry ----------
function normalizeEntry(e: any, idx: number): Mon {
    const name: string = e.name ?? e.Name ?? e.internalName ?? e.InternalName ?? `Pokemon ${idx + 1}`;
    const id: string = e.id ?? (e.internalName ? slugify(e.internalName) : slugify(name) || `pokemon-${idx + 1}`);
    let types: string[] = [];
    if (Array.isArray(e.types)) types = e.types;
    else if (typeof e.types === "string") types = toArray(e.types);
    else if (e.type || e.Type) types = toArray(e.type || e.Type);
    else if (e.types && typeof e.types === "object") types = toArray(e.types);
    types = types.filter(Boolean);

    const s = e.stats || e.BaseStats || e.baseStats || {};
    const stats: Stats = {
        hp:  num((s as any).hp ?? (s as any).HP ?? (s as any)[0]),
        atk: num((s as any).atk ?? (s as any).Atk ?? (s as any)[1]),
        def: num((s as any).def ?? (s as any).Def ?? (s as any)[2]),
        spa: num((s as any).spa ?? (s as any).SpA ?? (s as any)[3]),
        spd: num((s as any).spd ?? (s as any).SpD ?? (s as any)[4]),
        spe: num((s as any).spe ?? (s as any).Spe ?? (s as any)[5]),
    };

    const abilities = toArray(e.abilities || e.Abilities);
    const hiddenAbility: string | undefined = (e.hiddenAbility ?? e.HiddenAbility) || undefined;

    return {
        id,
        internalName: e.internalName || e.InternalName || id,
        name,
        types,
        stats,
        abilities,
        hiddenAbility,
        summary: e.summary ?? e.pokedex ?? e.Pokedex ?? e.kind ?? "",
        moves: Array.isArray(e.moves) ? e.moves : []
    };
}

function bst(s: Stats) {
    return s.hp + s.atk + s.def + s.spa + s.spd + s.spe;
}

// ---------- data load ----------
async function loadData(): Promise<Mon[]> {
    const dataUrl = new URL("./data/pokemon.json", document.baseURI).toString();
    const res = await fetch(dataUrl, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${dataUrl}`);
    const data: any = await res.json();

    let raw: any[] = [];
    if (Array.isArray(data)) raw = data;
    else if (Array.isArray(data.pokemon)) raw = data.pokemon;
    else if (data && typeof data.pokemon === "object") raw = Object.values(data.pokemon);
    else if (data && typeof data === "object") raw = Object.values(data);

    console.log("Loaded dataset:", { url: dataUrl, count: raw.length, sample: raw[0] });
    return raw.map(normalizeEntry);
}

/* ---------- column width calculation (overall max; compact caps) ---------- */

function measureWidths(pokemon: Mon[]) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
    const w = (s: string) => Math.ceil(ctx.measureText(s ?? "").width);

    const maxName = Math.max(...pokemon.map(p => w(p.name)), w("Name"));

    const typeStrings = new Set<string>(["Type1", "Type2"]);
    pokemon.forEach(p => p.types.forEach(t => typeStrings.add(t)));
    const maxType = Math.max(...[...typeStrings].map(w));

    const abilityStrings = new Set<string>(["Ability1", "Ability2"]);
    pokemon.forEach(p => p.abilities.forEach(a => abilityStrings.add(a)));
    const maxAbility = Math.max(...[...abilityStrings].map(w));

    const hiddenStrings = new Set<string>(["Hidden Ability"]);
    pokemon.forEach(p => { if (p.hiddenAbility) hiddenStrings.add(p.hiddenAbility); });
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

/* ---------- table rendering ---------- */

function buildTableHTML(list: Mon[]) {
    return `
<table class="dex-table">
  <thead>
    <tr>
      <th>Name</th>
      <th>Type1</th>
      <th>Type2</th>
      <th>Ability1</th>
      <th>Ability2</th>
      <th>Hidden Ability</th>
      <th>BST</th>
      <th>HP</th>
      <th>Atk</th>
      <th>Def</th>
      <th>SpA</th>
      <th>SpD</th>
      <th>Spe</th>
    </tr>
  </thead>
  <tbody>
    ${list.map(p => {
        const type1 = p.types[0] ?? "";
        const type2 = p.types[1] ?? "";
        const ability1 = p.abilities[0] ?? "";
        const ability2 = p.abilities[1] ?? "";
        const hidden = p.hiddenAbility ?? "";
        const sum = bst(p.stats);
        return `
      <tr class="rowlink" tabindex="0" data-id="${p.id}">
        <td title="${p.name}">${p.name}</td>
        <td title="${type1}">${type1}</td>
        <td title="${type2}">${type2}</td>
        <td title="${ability1}">${ability1}</td>
        <td title="${ability2}">${ability2}</td>
        <td title="${hidden}">${hidden}</td>
        <td>${sum}</td>
        <td>${p.stats.hp}</td>
        <td>${p.stats.atk}</td>
        <td>${p.stats.def}</td>
        <td>${p.stats.spa}</td>
        <td>${p.stats.spd}</td>
        <td>${p.stats.spe}</td>
      </tr>`;
    }).join("")}
  </tbody>
</table>`;
}

function buildFilters(pokemon: Mon[]) {
    const typeSel = document.querySelector<HTMLSelectElement>("#type");
    if (!typeSel) return;
    typeSel.innerHTML = '<option value="">All types</option>';
    const typeSet = new Set<string>();
    pokemon.forEach(p => p.types.forEach(t => typeSet.add(t)));
    [...typeSet].sort().forEach(t => {
        const opt = document.createElement("option");
        opt.value = t;
        opt.textContent = t;
        typeSel.appendChild(opt);
    });
}

function renderTable(pokemon: Mon[]) {
    const grid = document.querySelector<HTMLElement>("#grid");
    const q = document.querySelector<HTMLInputElement>("#q");
    const typeSel = document.querySelector<HTMLSelectElement>("#type");
    const sortSel = document.querySelector<HTMLSelectElement>("#sort");
    const count = document.querySelector<HTMLElement>("#count");
    if (!grid || !q || !typeSel || !sortSel || !count) return;

    const query = q.value.trim().toLowerCase();
    const typeFilter = typeSel.value;

    const list = pokemon
        .filter(p => {
            const inType = !typeFilter || p.types.includes(typeFilter);
            const hay = (p.name + " " + p.types.join(" ") + " " + (p.abilities || []).join(" ")).toLowerCase();
            return inType && (!query || hay.includes(query));
        })
        .sort((a, b) => {
            if (sortSel.value === "name") return a.name.localeCompare(b.name);
            if (sortSel.value === "bst") return bst(b.stats) - bst(a.stats);
            return 0;
        });

    count.textContent = `${list.length} result${list.length === 1 ? "" : "s"}`;

    grid.innerHTML = buildTableHTML(list);

    // set fixed widths based on the FULL dataset (stored on #grid)
    const table = grid.querySelector<HTMLTableElement>(".dex-table");
    if (table) {
        const allDataJson = grid.getAttribute("data-all-pokemon");
        if (allDataJson) {
            const allData: Mon[] = JSON.parse(allDataJson);
            const widths = measureWidths(allData);
            table.style.setProperty("--col-name", `${widths.name}px`);
            table.style.setProperty("--col-type", `${widths.type}px`);
            table.style.setProperty("--col-ability", `${widths.ability}px`);
            table.style.setProperty("--col-hidden", `${widths.hidden}px`);
            table.style.setProperty("--col-bst", `${widths.bst}px`);
            table.style.setProperty("--col-stat", `${widths.stat}px`);
        }
    }
}

/* ---------- detail rendering ---------- */

function buildDetailHTML(p: Mon) {
    const typingStr = formatTyping(p.types);
    const abilitiesStr = formatAbilities(p.abilities, p.hiddenAbility);

    return `
  <article class="detail">
    <button class="back" aria-label="Back to list">← Back</button>
    <h1 class="detail-name">${p.name}</h1>

    <section class="detail-block">
      <h2>Info</h2>
      <div class="kv">
        <div><span>Typing</span><strong>${typingStr}</strong></div>
        <div><span>Abilities</span><strong>${abilitiesStr}</strong></div>
      </div>
    </section>

    <section class="detail-block">
      <h2>Base Stats</h2>
      <table class="stats">
        <tbody>
          <tr><td class="label">HP</td>   <td class="num">${p.stats.hp}</td>  <td class="bar">${statBarHTML(p.stats.hp)}</td></tr>
          <tr><td class="label">Atk</td>  <td class="num">${p.stats.atk}</td> <td class="bar">${statBarHTML(p.stats.atk)}</td></tr>
          <tr><td class="label">Def</td>  <td class="num">${p.stats.def}</td> <td class="bar">${statBarHTML(p.stats.def)}</td></tr>
          <tr><td class="label">SpA</td>  <td class="num">${p.stats.spa}</td> <td class="bar">${statBarHTML(p.stats.spa)}</td></tr>
          <tr><td class="label">SpD</td>  <td class="num">${p.stats.spd}</td> <td class="bar">${statBarHTML(p.stats.spd)}</td></tr>
          <tr><td class="label">Spe</td>  <td class="num">${p.stats.spe}</td> <td class="bar">${statBarHTML(p.stats.spe)}</td></tr>
          <tr class="bst"><td class="label">BST</td><td class="num">${bst(p.stats)}</td><td class="bar"></td></tr>
        </tbody>
      </table>
    </section>
  </article>`;
}

function renderDetail(pokemon: Mon[], id: string) {
    const grid = document.querySelector<HTMLElement>("#grid");
    const count = document.querySelector<HTMLElement>("#count");
    if (!grid || !count) return;
    const mon = pokemon.find(m => m.id === id);
    if (!mon) {
        grid.innerHTML = `<div style="padding:16px;">Not found.</div>`;
        return;
    }
    count.textContent = "Details";
    grid.innerHTML = buildDetailHTML(mon);

    const backBtn = grid.querySelector<HTMLButtonElement>(".back");
    backBtn?.addEventListener("click", () => navigateToList());
}

/* ---------- tiny hash router ---------- */

function hashToId(): string | null {
    const m = location.hash.match(/^#\/mon\/(.+)$/);
    return m ? decodeURIComponent(m[1]) : null;
}
function navigateToMon(id: string) {
    location.hash = `#/mon/${encodeURIComponent(id)}`;
}
function navigateToList() {
    history.pushState("", document.title, window.location.pathname + window.location.search); // clear hash
    renderCurrent();
}
function renderCurrent() {
    const grid = document.querySelector<HTMLElement>("#grid");
    if (!grid) return;
    const allDataJson = grid.getAttribute("data-all-pokemon");
    if (!allDataJson) return;
    const pokemon: Mon[] = JSON.parse(allDataJson);
    const id = hashToId();
    if (id) renderDetail(pokemon, id);
    else renderTable(pokemon);
}

/* ---------- start ---------- */

async function start() {
    const pokemon = await loadData();
    buildFilters(pokemon);

    const grid = document.querySelector<HTMLElement>("#grid");
    if (grid) grid.setAttribute("data-all-pokemon", JSON.stringify(pokemon));

    // list interactions
    const q = document.querySelector<HTMLInputElement>("#q");
    const typeSel = document.querySelector<HTMLSelectElement>("#type");
    const sortSel = document.querySelector<HTMLSelectElement>("#sort");
    const rerender = () => renderTable(pokemon);
    q?.addEventListener("input", rerender);
    typeSel?.addEventListener("change", rerender);
    sortSel?.addEventListener("change", rerender);

    // click/keyboard on rows → navigate to detail
    grid?.addEventListener("click", (e) => {
        const tr = (e.target as HTMLElement).closest<HTMLTableRowElement>("tr.rowlink");
        if (tr?.dataset.id) navigateToMon(tr.dataset.id);
    });
    grid?.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
            const tr = (e.target as HTMLElement).closest<HTMLTableRowElement>("tr.rowlink");
            if (tr?.dataset.id) {
                e.preventDefault();
                navigateToMon(tr.dataset.id);
            }
        }
    });

    window.addEventListener("hashchange", renderCurrent);

    // initial render based on hash
    renderCurrent();
}

// Run in the browser after DOM is ready
if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => void start(), { once: true });
    } else {
        void start();
    }
}
