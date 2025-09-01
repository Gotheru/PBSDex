// src/scripts/main.ts — table with fixed widths + zebra + short stat headers

type Stats = { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
type Move = { level: number; move: string };
type Mon = {
    id: string;
    name: string;
    types: string[];              // [Type1, Type2?]
    stats: Stats;                 // { hp, atk, def, spa, spd, spe }
    abilities: string[];          // [Ability1, Ability2?]
    hiddenAbility?: string;       // single
    summary?: string;
    moves?: Move[];
};

const BASE = import.meta.env.BASE_URL || "/";

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
        id, name, types, stats, abilities, hiddenAbility,
        summary: e.summary ?? e.pokedex ?? e.Pokedex ?? e.kind ?? "",
        moves: Array.isArray(e.moves) ? e.moves : []
    };
}

function bst(s: Stats) {
    return s.hp + s.atk + s.def + s.spa + s.spd + s.spe;
}

async function loadData(): Promise<Mon[]> {
    const base = BASE.endsWith("/") ? BASE : BASE + "/";
    const dataUrl = new URL("data/pokemon.json", window.location.origin + base).toString();

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

/* ---------------- column width calculation (overall max) ---------------- */

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
    pokemon.forEach(p => bstStrings.add(String(bst(p))));
    const maxBST = Math.max(...[...bstStrings].map(w));

    const statStrings = new Set<string>(["HP","Atk","Def","SpA","SpD","Spe"]);
    pokemon.forEach(p => {
        const s = p.stats;
        ["hp","atk","def","spa","spd","spe"].forEach(k => statStrings.add(String((s as any)[k])));
    });
    const maxStat = Math.max(...[...statStrings].map(w));

    // Small safety so text doesn’t clip inside the content box.
    const fudge = 6;

    // HARD CAPS (content width only). These keep the total width within the 1100px container.
    // (Padding is handled in CSS; we don't add it here.)
    const cap = {
        name:   120, // content px
        type:    70,
        ability: 95,
        hidden: 100,
        bst:     36,
        stat:    30,
    };

    return {
        name:   Math.min(maxName   + fudge, cap.name),
        type:   Math.min(maxType   + fudge, cap.type),
        ability:Math.min(maxAbility+ fudge, cap.ability),
        hidden: Math.min(maxHidden + fudge, cap.hidden),
        bst:    Math.min(maxBST    + fudge, cap.bst),
        stat:   Math.min(maxStat   + fudge, cap.stat),
    };
}


/* ---------------- render ---------------- */

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
      <tr>
        <td>${p.name}</td>
        <td>${type1}</td>
        <td>${type2}</td>
        <td>${ability1}</td>
        <td>${ability2}</td>
        <td>${hidden}</td>
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

    // Build table first…
    grid.innerHTML = buildTableHTML(list);

    // …then apply fixed widths computed from the FULL dataset (not just filtered)
    const table = grid.querySelector<HTMLTableElement>(".dex-table");
    if (table) {
        // We keep the full set cached in a data attr for width calc
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

/* ---------------- start ---------------- */

async function start() {
    const pokemon = await loadData();
    buildFilters(pokemon);

    // Stash the full dataset on #grid so we can compute widths after filtering
    const grid = document.querySelector<HTMLElement>("#grid");
    if (grid) grid.setAttribute("data-all-pokemon", JSON.stringify(pokemon));

    const q = document.querySelector<HTMLInputElement>("#q");
    const typeSel = document.querySelector<HTMLSelectElement>("#type");
    const sortSel = document.querySelector<HTMLSelectElement>("#sort");

    const rerender = () => renderTable(pokemon);
    q?.addEventListener("input", rerender);
    typeSel?.addEventListener("change", rerender);
    sortSel?.addEventListener("change", rerender);

    renderTable(pokemon);
}

// Run in the browser after DOM is ready
if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => void start(), { once: true });
    } else {
        void start();
    }
}
