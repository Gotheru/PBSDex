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
// ---- types.json loader ----
type TypeInfo = {
    name: string; internalId: string;
    weaknesses: string[]; resistances: string[]; immunities: string[];
    isSpecialType: boolean; isPseudoType: boolean; index: number;
};
let typeData: Record<string, TypeInfo> = {};

// ---- combined defensive matchup for 1–2 types ----
function combineDefense(types: string[]) {
    const allAtk = Object.keys(typeData); // iterate all known types as attackers

    const immune: string[] = [];
    const strongResists: string[] = [];
    const resists: string[] = [];
    const weak: string[] = [];
    const veryWeak: string[] = [];

    for (const atk of allAtk) {
        // per-own-type relation for this attacking type
        let seenImm = false, resCount = 0, weakCount = 0;
        for (const def of types) {
            const info = typeData[def];
            if (!info) continue;
            if (info.immunities.includes(atk)) { seenImm = true; break; }
            if (info.resistances.includes(atk)) resCount++;
            else if (info.weaknesses.includes(atk)) weakCount++;
        }
        if (seenImm) { immune.push(atk); continue; }
        if (resCount === 2) { strongResists.push(atk); continue; }
        if (weakCount === 2) { veryWeak.push(atk); continue; }
        if (resCount === 1 && weakCount === 0) { resists.push(atk); continue; }
        if (weakCount === 1 && resCount === 0) { weak.push(atk); continue; }
        // net neutral -> ignore
    }

    return { immune, strongResists, resists, weak, veryWeak };
}

function typeIconTag(typeId: string) {
    const srcs = typeCandidates(typeId);
    const title = typeData[typeId]?.name || typeId;
    return `<img class="type-icon"
               src="${srcs[0]}" data-srcs="${srcs.join("|")}" data-idx="0"
               alt="${typeId}" title="${title}" loading="lazy" decoding="async">`;
}

function iconRow(list: string[]) {
    if (!list.length) return "";
    return `<span class="tip-icons">${list.map(typeIconTag).join("")}</span>`;
}

function typeMatchupTooltipHTML(types: string[]) {
    const m = combineDefense(types);
    const section = (label: string, arr: string[]) =>
        arr.length ? `<div class="tip-row"><b>${label}</b> ${iconRow(arr)}</div>` : "";
    const html =
        section("Immune to:", m.immune) +
        section("Strongly resists:", m.strongResists) +
        section("Resists:", m.resists) +
        section("Weak to:", m.weak) +
        section("Very weak to:", m.veryWeak);
    return html || `<div class="tip-row"><i>No notable modifiers</i></div>`;
}



// --- Abilities ---

let ABIL: AbilityMap = {}; // filled at startup

async function loadAbilities(): Promise<AbilityMap> {
    const url = new URL("./data/abilities.json", document.baseURI).toString();
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.json();
}

async function loadTypes() {
    const dataUrl = new URL("./data/types.json", document.baseURI).toString();
    const res = await fetch(dataUrl, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${dataUrl}`);
    typeData = await res.json();
}

function abilityName(id?: string | null): string {
    if (!id) return "";
    return ABIL[id]?.name || id; // fallback to internal id if missing
}

function escapeAttr(s: string) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\s+/g, " "); // collapse newlines/extra spaces
}

function abilityLinkHTML(id?: string | null, opts?: { hidden?: boolean }) {
    if (!id) return "";
    const name = abilityName(id);
    const tip  = ABIL[id]?.description ? ` data-tip="${escapeAttr(ABIL[id].description!)}"` : "";
    const a = `<a href="#/ability/${encodeURIComponent(id)}" class="abil-link"${tip}>${name}</a>`;
    return opts?.hidden ? `<em>${a}</em>` : a;
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

// ── Type icon helpers ────────────────────────────────────────────────────────
function typeCandidates(tRaw: string): string[] {
    const base = new URL("./images/types/", document.baseURI).toString();
    const name = String(tRaw || "");
    const cap = name ? name[0] + name.slice(1).toLowerCase() : name;
    const variants = [name, name.toUpperCase(), name.toLowerCase(), cap];
    const exts = ["png", "PNG"];
    const seen = new Set<string>();
    const urls: string[] = [];
    for (const v of variants) for (const ext of exts) {
        const u = base + encodeURIComponent(v) + "." + ext;
        if (!seen.has(u)) { urls.push(u); seen.add(u); }
    }
    return urls;
}

function typingIconsHTML(types: string[]): string {
    const ts = (types || []).slice(0, 2).filter(Boolean);
    if (ts.length === 0) return "";
    const imgs = ts.map(t => {
        const srcs = typeCandidates(t);
        const alt = t;
        return `<img class="type-icon"
                 src="${srcs[0]}" data-srcs="${srcs.join("|")}" data-idx="0"
                 alt="${alt}" title="${alt}" loading="lazy" decoding="async">`;
    }).join("");
    return `<span class="type-icons">${imgs}</span>`;
}

// generic fallback wire-up you already added; reuse it for type icons too:
// wireFallbacks(root, "img.type-icon");


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
// Front sprites live in /images/front/<INTERNAL>.png (96x96)
function frontCandidates(p: Mon): string[] {
    const base = new URL("./images/front/", document.baseURI).toString();
    const names = [
        p.internalName,                  // e.g. BEEDRILLT
        p.internalName.toLowerCase(),    // beedrillt
        p.id,                            // beedrillt
        p.id.toUpperCase(),              // BEEDRILLT
    ];
    const exts = ["png", "PNG"];
    const seen = new Set<string>();
    const urls: string[] = [];
    for (const n of names) for (const ext of exts) {
        const u = base + encodeURIComponent(n) + "." + ext;
        if (!seen.has(u)) { urls.push(u); seen.add(u); }
    }
    return urls;
}

// Generic error fallback for any <img> with data-srcs + data-idx
function wireFallbacks(root: HTMLElement, selector: string) {
    root.querySelectorAll<HTMLImageElement>(selector).forEach(img => {
        const srcs = (img.getAttribute("data-srcs") || "").split("|").filter(Boolean);
        if (srcs.length <= 1) return;
        img.addEventListener("error", () => {
            let i = Number(img.dataset.idx || "0");
            i += 1;
            if (i < srcs.length) {
                img.dataset.idx = String(i);
                img.src = srcs[i];
            } else {
                img.style.visibility = "hidden";
            }
        });
    });
}

function wireIconFallbacks(root: HTMLElement) {
    root.querySelectorAll<HTMLImageElement>("img.dex-icon").forEach(img => {
        const srcs = (img.getAttribute("data-srcs") || "").split("|").filter(Boolean);
        if (srcs.length <= 1) return;

        img.addEventListener("error", () => {
            let i = Number(img.dataset.idx || "0");
            i += 1;
            if (i < srcs.length) {
                img.dataset.idx = String(i);
                img.src = srcs[i];
            } else {
                img.style.visibility = "hidden"; // no valid sources; hide the broken icon
            }
        });
    });
}


function applyDexTableSizing(container: HTMLElement) {
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



function ensureTooltip(): HTMLElement {
    let el = document.getElementById("tooltip");
    if (!el) {
        el = document.createElement("div");
        el.id = "tooltip";
        document.body.appendChild(el);
    }
    return el;
}

function iconUrl(internalName: string): string {
    // public/images/icons/<InternalName>.png
    // document.baseURI keeps it working at /PBSDex/ in prod and / in dev
    return new URL(`./images/icons/${encodeURIComponent(internalName)}.png`, document.baseURI).toString();
}

function iconCandidates(p: Mon): string[] {
    const base = new URL("./images/icons/", document.baseURI).toString();
    const names = [
        p.internalName,                  // e.g. BEEDRILLT
        p.internalName.toLowerCase(),    // beedrillt
        p.id,                            // beedrillt (slug)
        p.id.toUpperCase(),              // BEEDRILLT
    ];
    const exts = ["png", "PNG"];       // try both cases
    const seen = new Set<string>();
    const urls: string[] = [];

    for (const n of names) {
        for (const ext of exts) {
            const u = base + encodeURIComponent(n) + "." + ext;
            if (!seen.has(u)) { urls.push(u); seen.add(u); }
        }
    }
    return urls;
}



const TOOLTIP_MARGIN = 8;

function positionTooltip(el: HTMLElement, anchor: HTMLElement) {
    const rect = anchor.getBoundingClientRect();
    // make visible to measure
    const r2 = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // default below the anchor
    let top = rect.bottom + TOOLTIP_MARGIN;
    let left = rect.left;

    // clamp horizontally
    if (left + r2.width > vw - 8) left = vw - 8 - r2.width;
    if (left < 8) left = 8;

    // if it would go off-screen bottom, place above
    if (top + r2.height > vh - 8) {
        top = rect.top - TOOLTIP_MARGIN - r2.height;
        // move arrow to bottom when above
        el.style.setProperty("--arrow-pos", "bottom");
    } else {
        el.style.setProperty("--arrow-pos", "top");
    }

    el.style.left = `${Math.round(left)}px`;
    el.style.top  = `${Math.round(top)}px`;
}

function bindAbilityTooltips() {
    const tipEl = ensureTooltip();
    let currentAnchor: HTMLElement | null = null;

    const show = (a: HTMLElement) => {
        const tip = a.getAttribute("data-tip");
        if (!tip) return;
        currentAnchor = a;
        tipEl.textContent = tip;
        // show first so we can measure size before positioning
        tipEl.classList.add("show");
        tipEl.style.left = "-10000px";
        tipEl.style.top = "0px";
        requestAnimationFrame(() => {
            if (currentAnchor) positionTooltip(tipEl, currentAnchor);
        });
    };

    const hide = () => {
        currentAnchor = null;
        tipEl.classList.remove("show");
    };

    // Hover
    document.addEventListener("mouseover", (e) => {
        const a = (e.target as HTMLElement).closest<HTMLElement>('a.abil-link[data-tip]');
        if (a) show(a);
    });
    document.addEventListener("mouseout", (e) => {
        const a = (e.target as HTMLElement).closest<HTMLElement>('a.abil-link[data-tip]');
        if (a) hide();
    });
    // Keyboard focus
    document.addEventListener("focusin", (e) => {
        const a = (e.target as HTMLElement).closest<HTMLElement>('a.abil-link[data-tip]');
        if (a) show(a);
    });
    document.addEventListener("focusout", (e) => {
        const a = (e.target as HTMLElement).closest<HTMLElement>('a.abil-link[data-tip]');
        if (a) hide();
    });

    // Reposition on scroll/resize if visible
    window.addEventListener("scroll", () => {
        if (currentAnchor) positionTooltip(tipEl, currentAnchor);
    }, { passive: true });
    window.addEventListener("resize", () => {
        if (currentAnchor) positionTooltip(tipEl, currentAnchor);
    });
}

function bindTypeTooltips() {
    const tipEl = ensureTooltip();
    let currentAnchor: HTMLElement | null = null;

    const show = (anchor: HTMLElement) => {
        const types = Array.from(anchor.querySelectorAll<HTMLImageElement>("img.type-icon"))
            .map(img => (img.getAttribute("alt") || "").toUpperCase())
            .filter(Boolean);

        tipEl.innerHTML = typeMatchupTooltipHTML(types);
        tipEl.classList.add("show");
        tipEl.style.left = "-10000px"; tipEl.style.top = "0px";
        // attach image fallbacks inside tooltip
        wireFallbacks(tipEl, "img.type-icon");
        requestAnimationFrame(() => positionTooltip(tipEl, anchor));
        currentAnchor = anchor;
    };

    const hide = () => {
        currentAnchor = null;
        tipEl.classList.remove("show");
        tipEl.innerHTML = "";
    };

    // Delegated events for any .type-icons (table + detail)
    document.addEventListener("mouseover", (e) => {
        const el = (e.target as HTMLElement).closest<HTMLElement>(".type-icons");
        if (el) show(el);
    });
    document.addEventListener("mouseout", (e) => {
        const el = (e.target as HTMLElement).closest<HTMLElement>(".type-icons");
        if (el) hide();
    });
    document.addEventListener("focusin", (e) => {
        const el = (e.target as HTMLElement).closest<HTMLElement>(".type-icons");
        if (el) show(el);
    });
    document.addEventListener("focusout", (e) => {
        const el = (e.target as HTMLElement).closest<HTMLElement>(".type-icons");
        if (el) hide();
    });

    window.addEventListener("scroll", () => { if (currentAnchor) positionTooltip(tipEl, currentAnchor); }, { passive: true });
    window.addEventListener("resize", () => { if (currentAnchor) positionTooltip(tipEl, currentAnchor); });
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
/* ---------- sorting ------------- */
type SortKey =
    | "name" | "typing"
    | "ability1" | "ability2" | "hidden"
    | "hp" | "atk" | "def" | "spa" | "spd" | "spe" | "bst";

type SortDir = "asc" | "desc";

let sortState: { key: SortKey; dir: SortDir } = { key: "name", dir: "asc" };

function getFieldForSort(p: Mon, key: SortKey): string | number {
    switch (key) {
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

function cmp(a: Mon, b: Mon, key: SortKey, dir: SortDir): number {
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


/* ---------- table rendering ---------- */

function buildTableHTML(list: Mon[]) {
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
        return `
      <tr class="rowlink" tabindex="0" data-id="${p.id}">
        <td class="icon">${icon}</td>
        <td title="${p.name}">${p.name}</td>
        <td class="typing" title="${(p.types||[]).join(' | ')}">${typingIconsHTML(p.types)}</td>
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
    const count = document.querySelector<HTMLElement>("#count");
    if (!grid || !q || !typeSel || !count) return;

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
        .sort((a, b) => cmp(a, b, sortState.key, sortState.dir));


    count.textContent = `${list.length} result${list.length === 1 ? "" : "s"}`;

    grid.innerHTML = buildTableHTML(list);


    // header click & keyboard sort
    const head = grid.querySelector("thead");
    head?.addEventListener("click", (e) => {
        const th = (e.target as HTMLElement).closest<HTMLTableCellElement>("th.sortable[data-sort]");
        if (!th) return;
        const key = th.dataset.sort as SortKey;
        if (sortState.key === key) {
            sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
        } else {
            sortState = { key, dir: (key === "name" || key.startsWith("type") || key.startsWith("ability") || key === "hidden") ? "asc" : "desc" };
        }
        renderTable(pokemon);
    });
    head?.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        const th = (e.target as HTMLElement).closest<HTMLTableCellElement>("th.sortable[data-sort]");
        if (!th) return;
        e.preventDefault();
        const key = th.dataset.sort as SortKey;
        if (sortState.key === key) {
            sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
        } else {
            sortState = { key, dir: (key === "name" || key.startsWith("type") || key.startsWith("ability") || key === "hidden") ? "asc" : "desc" };
        }
        renderTable(pokemon);
    });
    grid?.addEventListener("click", (e) => {
        const target = e.target as HTMLElement;
        if (target.closest("a")) return;                 // ability links
        if (target.closest("thead")) return;             // header sorts
        const tr = target.closest<HTMLTableRowElement>("tr.rowlink");
        if (tr?.dataset.id) navigateToMon(tr.dataset.id);
    });

    wireFallbacks(grid, "img.dex-icon");
    wireFallbacks(grid, "img.type-icon");

    // set fixed widths based on the FULL dataset (stored on #grid)
    applyDexTableSizing(grid);
}

/* ---------- detail rendering ---------- */

function buildDetailHTML(p: Mon) {
    const abilitiesStr = formatAbilities(p.abilities, p.hiddenAbility);

    const srcs = frontCandidates(p);
    const img = `
    <img class="mon-front"
         src="${srcs[0]}"
         data-srcs="${srcs.join('|')}"
         data-idx="0"
         alt="${p.name}"
         loading="lazy"
         decoding="async">
  `;

    return `
  <article class="detail mon-layout">
    <div class="mon-art">
      <div class="art-box">${img}</div>
    </div>

    <div class="mon-middle">
      <div class="info-tile">
        <div class="info-label">Typing</div>
        <div class="info-value center">
          <span class="type-icons big">${typingIconsHTML(p.types).replace('type-icons','type-icons big')}</span>
        </div>
      </div>

      <div class="info-tile">
        <div class="info-label">Abilities</div>
        <div class="info-value stacked center">
          ${
        [ p.abilities?.[0] ? abilityLinkHTML(p.abilities[0]) : "",
            p.abilities?.[1] ? abilityLinkHTML(p.abilities[1]) : "",
            p.hiddenAbility   ? abilityLinkHTML(p.hiddenAbility, { hidden: true }) : ""
        ].filter(Boolean).map(h => `<div class="line">${h}</div>`).join("")
    }
        </div>
      </div>
    </div>

    <div class="mon-stats">
      <div class="stats-panel">
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
      </div>
    </div>
  </article>`;
}




function renderDetail(pokemon: Mon[], id: string) {
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
    count.innerHTML = `<button class="back header-back" aria-label="Back to list">← Back</button>`;
    count.querySelector<HTMLButtonElement>(".header-back")
        ?.addEventListener("click", () => navigateToList());

    // Build the card WITHOUT an internal back button
    grid.innerHTML = buildDetailHTML(mon);

    // sprite fallback
    wireFallbacks(grid, "img.mon-front");
    wireFallbacks(grid, "img.type-icon");

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
    await Promise.all([loadTypes()])
    ABIL = abilities;

    bindAbilityTooltips()
    bindTypeTooltips()
    buildFilters(pokemon);

    const grid = document.querySelector<HTMLElement>("#grid");
    if (grid) grid.setAttribute("data-all-pokemon", JSON.stringify(pokemon));

    const q = document.querySelector<HTMLInputElement>("#q");
    const typeSel = document.querySelector<HTMLSelectElement>("#type");
    const rerender = () => renderTable(pokemon);
    q?.addEventListener("input", rerender);
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
    wireIconFallbacks(grid);
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
