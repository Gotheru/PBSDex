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
type AbilityInfo = { name: string; description?: string };
type AbilityMap = Record<string, AbilityInfo>;

// --- Abilities ---

let ABIL: AbilityMap = {}; // filled at startup

async function loadAbilities(): Promise<AbilityMap> {
    const url = new URL("./data/abilities.json", document.baseURI).toString();
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.json();
}

function abilityName(id?: string | null): string {
    if (!id) return "";
    return ABIL[id]?.name || id; // fallback to internal id if missing
}

function abilityLinkHTML(id?: string | null, opts?: { hidden?: boolean }) {
    if (!id) return "";
    const name = abilityName(id);
    const a = `<a href="#/ability/${encodeURIComponent(id)}" class="abil-link">${name}</a>`;
    return opts?.hidden ? `<em>${a}</em>` : a; // italicize hidden
}

function formatAbilities(abilities: string[], hidden?: string): string {
    const parts: string[] = [];
    if (abilities?.[0]) parts.push(abilityLinkHTML(abilities[0]));
    if (abilities?.[1]) parts.push(abilityLinkHTML(abilities[1]));
    if (hidden) parts.push(abilityLinkHTML(hidden, { hidden: true }));
    return parts.length ? parts.join(" | ") : "—";
}


// --- stat bar helpers ---
// Using a broader range keeps tall stats from capping visually too early.
const STAT_MAX = 200; // 0..200 → 10 is VERY low, 181 ≈ 90% width

function statBarHTML(v: number) {
    const clamped = Math.max(0, Math.min(STAT_MAX, v));
    const t = clamped / STAT_MAX;                  // 0..1
    const pct = Math.round(t * 100);               // width %
    const hue = Math.round(t * 170);               // 0 (red) → 170 (cyan)

    // Make low numbers look deeper/richer red:
    // lower lightness at the low-end; slightly higher at the top-end
    const l1 = (36 + 24 * t).toFixed(1);           // 48% → 60%
    const l2 = (26 + 24 * t).toFixed(1);           // 38% → 50%
    // Saturation slightly eases at the top so cyan isn’t neon
    const s1 = (96 - 10 * t).toFixed(1);           // 96% → 86%
    const s2 = (92 - 10 * t).toFixed(1);           // 92% → 82%

    return `<div class="statbar" style="--w:${pct}%;--h:${hue};--s1:${s1}%;--l1:${l1}%;--s2:${s2}%;--l2:${l2}%"></div>`;
}



function formatTyping(types: string[]): string {
    if (!types || types.length === 0) return "—";
    const t1 = types[0] ?? "";
    const t2 = types[1] ?? "";
    return t2 ? `${t1} | ${t2}` : t1;
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

// ---------- more helpers ----------
function applyDexTableSizing(container: HTMLElement) {
    const table = container.querySelector<HTMLTableElement>(".dex-table");
    if (!table) return;
    const allDataJson = container.getAttribute("data-all-pokemon");
    if (!allDataJson) return;
    const allData: Mon[] = JSON.parse(allDataJson);
    const widths = measureWidths(allData);
    table.style.setProperty("--col-name", `${widths.name}px`);
    table.style.setProperty("--col-type", `${widths.type}px`);
    table.style.setProperty("--col-ability", `${widths.ability}px`);
    table.style.setProperty("--col-hidden", `${widths.hidden}px`);
    table.style.setProperty("--col-bst", `${widths.bst}px`);
    table.style.setProperty("--col-stat", `${widths.stat}px`);
}

// ----------- dark mode ----------------

type ThemeMode = "light" | "dark";

function resolveInitialTheme(): ThemeMode {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved as ThemeMode;
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "dark" : "light";
}

function applyTheme(mode: ThemeMode) {
    document.documentElement.setAttribute("data-theme", mode === "dark" ? "dark" : "light");
    const btn = document.querySelector<HTMLButtonElement>("#theme-toggle");
    if (btn) btn.textContent = mode === "dark" ? "☀️" : "🌙";
}

function initTheme() {
    let mode = resolveInitialTheme();
    applyTheme(mode);
    localStorage.setItem("theme", mode);

    // Toggle handler
    const btn = document.querySelector<HTMLButtonElement>("#theme-toggle");
    btn?.addEventListener("click", () => {
        mode = (document.documentElement.getAttribute("data-theme") === "dark") ? "light" : "dark";
        applyTheme(mode);
        localStorage.setItem("theme", mode);
    });

    // If user hasn't chosen manually, you could react to OS changes:
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", (e) => {
      if (!localStorage.getItem("theme")) { mode = e.matches ? "dark" : "light"; applyTheme(mode); }
    });
}


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
      <th>HP</th>
      <th>Atk</th>
      <th>Def</th>
      <th>SpA</th>
      <th>SpD</th>
      <th>Spe</th>
      <th>BST</th>
    </tr>
  </thead>
  <tbody>
    ${list.map(p => {
        const type1 = p.types[0] ?? "";
        const type2 = p.types[1] ?? "";
        const ability1 = p.abilities[0] ? abilityLinkHTML(p.abilities[0]) : "";
        const ability2 = p.abilities[1] ? abilityLinkHTML(p.abilities[1]) : "";
        const hidden   = p.hiddenAbility ? abilityLinkHTML(p.hiddenAbility, { hidden: true }) : "";
        const sum = bst(p.stats);
        return `
      <tr class="rowlink" tabindex="0" data-id="${p.id}">
        <td title="${p.name}">${p.name}</td>
        <td title="${type1}">${type1}</td>
        <td title="${type2}">${type2}</td>
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
            const abilNames = (p.abilities || []).map(a => abilityName(a)).join(" ");
            const hiddenName = abilityName(p.hiddenAbility);
            const hay = (p.name + " " + p.types.join(" ") + " " + abilNames + " " + hiddenName).toLowerCase();
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
    applyDexTableSizing(grid);
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

type Route = { kind: "list" } | { kind: "mon"; id: string } | { kind: "ability"; id: string };

function parseHash(): Route {
    const h = location.hash;
    let m = h.match(/^#\/mon\/(.+)$/);
    if (m) return { kind: "mon", id: decodeURIComponent(m[1]) };
    m = h.match(/^#\/ability\/(.+)$/);
    if (m) return { kind: "ability", id: decodeURIComponent(m[1]) };
    return { kind: "list" };
}

function navigateToAbility(id: string) {
    location.hash = `#/ability/${encodeURIComponent(id)}`;
}

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
    const r = parseHash();
    if (r.kind === "mon") renderDetail(pokemon, r.id);
    else if (r.kind === "ability") renderAbilityDetail(pokemon, r.id);
    else renderTable(pokemon);
}


/* ---------- start ---------- */

async function start() {
    initTheme();

    const [abilities, pokemon] = await Promise.all([
        loadAbilities(),
        loadData(),
    ]);
    ABIL = abilities;

    buildFilters(pokemon);

    const grid = document.querySelector<HTMLElement>("#grid");
    if (grid) grid.setAttribute("data-all-pokemon", JSON.stringify(pokemon));

    const q = document.querySelector<HTMLInputElement>("#q");
    const typeSel = document.querySelector<HTMLSelectElement>("#type");
    const sortSel = document.querySelector<HTMLSelectElement>("#sort");
    const rerender = () => renderTable(pokemon);
    q?.addEventListener("input", rerender);
    typeSel?.addEventListener("change", rerender);
    sortSel?.addEventListener("change", rerender);

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


    window.addEventListener("hashchange", renderCurrent);
    renderCurrent(); // first render now sees ABIL, so names show up everywhere
}

function buildAbilityDetailHTML(abilityId: string, pokemon: Mon[]) {
    const info = ABIL[abilityId];
    const title = info?.name || abilityId;

    const normal = pokemon.filter(p => (p.abilities || []).includes(abilityId))
        .sort((a,b) => a.name.localeCompare(b.name));
    const hidden = pokemon.filter(p => p.hiddenAbility === abilityId)
        .sort((a,b) => a.name.localeCompare(b.name));

    const list = (arr: Mon[]) => arr.map(p => `<li><a href="#/mon/${encodeURIComponent(p.id)}">${p.name}</a></li>`).join("");

    return `
  <article class="detail">
    <button class="back" aria-label="Back to list">← Back</button>
    <h1 class="detail-name">${title}</h1>

    <section class="detail-block">
      <h2>Description</h2>
      <p>${info?.description || "—"}</p>
    </section>

    <section class="detail-block">
      <h2>Pokémon with this ability</h2>

      <div class="kv" style="margin-bottom:6px;"><div><span>Regular</span><strong>${normal.length}</strong></div><div><span>Hidden</span><strong>${hidden.length}</strong></div></div>

      <div style="display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px;">
        <div>
          <h3 style="font-size:14px; opacity:.75; margin:0 0 6px;">Regular Ability</h3>
          <ul class="list">${list(normal) || "<li>—</li>"}</ul>
        </div>
        <div>
          <h3 style="font-size:14px; opacity:.75; margin:0 0 6px;">Hidden Ability</h3>
          <ul class="list">${list(hidden) || "<li>—</li>"}</ul>
        </div>
      </div>
    </section>
  </article>`;
}

function renderAbilityDetail(pokemon: Mon[], id: string) {
    const grid = document.querySelector<HTMLElement>("#grid");
    const count = document.querySelector<HTMLElement>("#count");
    if (!grid || !count) return;

    const info = ABIL[id];
    const title = info?.name || id;

    // Equivalent to “querying by ability”: include mons where ability1/2 OR hidden matches this internal id
    const list = pokemon.filter(p => (p.abilities?.includes(id)) || p.hiddenAbility === id)
        .sort((a, b) => a.name.localeCompare(b.name));

    count.textContent = `${list.length} result${list.length === 1 ? "" : "s"} for ability “${title}”`;

    grid.innerHTML = `
  <article class="detail">
    <button class="back" aria-label="Back to list">← Back</button>
    <h1 class="detail-name">${title}</h1>

    <section class="detail-block">
      <h2>Description</h2>
      <p>${info?.description || "—"}</p>
    </section>

    <section class="detail-block">
      <h2>Pokémon</h2>
      ${buildTableHTML(list)}
    </section>
  </article>`;

    grid.querySelector<HTMLButtonElement>(".back")?.addEventListener("click", () => navigateToList());

    // Make the table use the same column sizing as the main page
    applyDexTableSizing(grid);
}



// Run in the browser after DOM is ready
if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => void start(), { once: true });
    } else {
        void start();
    }
}
