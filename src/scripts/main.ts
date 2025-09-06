// src/scripts/main.ts — table + simple detail view (hash router)

type Stats = { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
type Move = { level: number; move: string };
type Evolution = { to: string; method: string; param: string };

type Mon = {
    id: string;
    internalName: string;
    name: string;
    types: string[];
    stats: Stats;

    abilities: string[];
    hiddenAbility?: string;

    // text
    summary?: string;

    // learnsets / misc (from new JSON)
    moves?: Move[];
    tutorMoves?: string[];
    eggMoves?: string[];
    machineMoves?: string[];
    evolutions?: Evolution[];

    // relations
    prevo?: string;            // ← NEW
    isForm?: boolean;
    baseInternal?: string;
};

let ALL_POKEMON: Mon[] = [];
let byInternal = new Map<string, Mon>();


type AbilityInfo = { name: string; description?: string };
type AbilityMap = Record<string, AbilityInfo>;
type SuggestKind = 'mon' | 'move' | 'ability' | 'type' | 'loc';
type SuggestItem = {
    kind: SuggestKind;
    id: string;           // internal id (mon.id for Pokémon; ability/move/type internal)
    label: string;        // display name
    sub?: string;         // optional subtext
    iconHTML?: string;    // optional left icon HTML
    score?: number;       // ranking score
    search: string;
};

let SEARCH_INDEX: SuggestItem[] = [];

// ---- types ----
type EncounterRow = [number, string, number, number]; // [chance, mon, min, max]
type EncounterLocation = {
    id: string;            // "003"
    name: string;          // "Forested Cavern"
    encounters: Record<string, EncounterRow[]>; // e.g. { Land: [...], Water: [...] }
};

// ---- global registry ----
let LOCS: Record<string, EncounterLocation> = {};

// Resolve a location display name (fallback to "#id")
const locationName = (locId?: string): string =>
    (locId && LOCS[locId]?.name) ? LOCS[locId].name : (locId ? `#${locId}` : "");

// ---- loader ----
async function loadEncounters(): Promise<void> {
    const url = new URL("./data/encounters.json", document.baseURI).toString();
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) return;
    const data = await res.json();
    // Expect an object keyed by id; if an array is ever produced, re-key it.
    if (Array.isArray(data)) {
        const m: Record<string, EncounterLocation> = {};
        for (const loc of data) if (loc?.id) m[loc.id] = loc;
        LOCS = m;
    } else {
        LOCS = data as Record<string, EncounterLocation>;
    }
}


// ---- types.json loader ----
type TypeInfo = {
    name: string; internalId: string;
    weaknesses: string[]; resistances: string[]; immunities: string[];
    isSpecialType: boolean; isPseudoType: boolean; index: number;
};
let typeData: Record<string, TypeInfo> = {};

// ---- types.ts bits (in your main.ts near other types) ----
type Item = {
    id: string;
    internalName: string;
    name: string;
    description?: string;
    pocket?: number | string;
    price?: number | string;
    sellPrice?: number | string;
    fieldUse?: string;
    flags?: string[];
    namePlural?: string;
    consumable?: boolean;
    extra?: Record<string, string>;
};

// Global registry
let ITEMS: Record<string, Item> = {};
const itemName = (internal: string | undefined | null): string => {
    if (!internal) return "";
    const it = ITEMS[internal];
    return it?.name || internal;
};

// ---- loader (match style of your other loaders) ----
async function loadItems(): Promise<void> {
    const url = new URL("./data/items.json", document.baseURI).toString();
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) return;
    const data = await res.json();
    // supports object keyed by internal; also supports array fallback
    if (Array.isArray(data)) {
        const out: Record<string, Item> = {};
        for (const it of data as Item[]) {
            const key = (it.internalName || it.id || "").toString();
            if (key) out[key] = it;
        }
        ITEMS = out;
    } else {
        ITEMS = data as Record<string, Item>;
    }
}


// ---- searchbar ---- //

const escapeHTML = (s:string) =>
    String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

function highlight(label:string, q:string){
    if (!q) return escapeHTML(label);
    const i = label.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return escapeHTML(label);
    return escapeHTML(label.slice(0,i)) + '<mark>' + escapeHTML(label.slice(i, i+q.length)) + '</mark>' + escapeHTML(label.slice(i+q.length));
}

// Resolves relative to the current page, so it works in dev ("/") and GH Pages ("/PBSDex/")
const assetUrl = (rel: string) => new URL(rel.replace(/^\//, ""), document.baseURI).toString();

// Mini sprite (left 64px of a 128×64 sheet) — suggestions dropdown
function miniIconHTML(monOrName: Mon | string){
    const p = _asMon(monOrName);
    const urls = iconCandidates(p);
    const all = urls.join("|").replace(/"/g, "&quot;");
    return `<img class="suggest-icon"
               src="${urls[0]}"
               data-srcs="${all}"
               data-si="0"
               alt=""
               loading="lazy"
               onerror="(function(el){
                 var a=(el.getAttribute('data-srcs')||'').split('|');
                 var i=+el.getAttribute('data-si')||0; i++;
                 if(i<a.length){el.setAttribute('data-si',i); el.src=a[i];}
                 else{el.style.display='none';}
               })(this)">`;
}


function smallTypeIcons(types: string[]){
    return `<span class="suggest-typeicons">${types.map(t => typeIconTag(t).replace('class="type-icon"', 'class="type-icon"')).join('')}</span>`;
}

function moveSmallIcon(moveId: string){
    const mv = movesIndex?.[moveId];
    if (!mv) return '';
    // prefer type icon; could also show category badge if you prefer
    return mv.type ? typeIconTag(mv.type).replace('class="type-icon"', 'class="type-icon" style="width:18px;height:18px"') : '';
}

function scoreMatch(label:string, q:string){
    const L = label.toLowerCase(), Q = q.toLowerCase();
    const i = L.indexOf(Q);
    if (i < 0) return -1;
    // startsWith gets a big boost; earlier position better; shorter label slightly better
    return 1000 - i*2 - Math.max(0, L.length - Q.length);
}

function buildSearchIndex(){
    const out: SuggestItem[] = [];

    // Pokémon
    for (const p of ALL_POKEMON){
        out.push({
            kind: 'mon',
            id: p.id,                          // hash route uses slug id
            label: p.name,
            sub: p.types?.join(' • ') || '',
            iconHTML: miniIconHTML(p.internalName),
            search: makeSearchKey(p.name)
        });
    }

    // Moves
    for (const [mid, mv] of Object.entries(movesIndex || {})){
        out.push({
            kind:'move',
            id: mid,
            label: mv.name || mid,
            sub: (mv.type || mv.category) ? [mv.type, mv.category].filter(Boolean).join(' • ') : '',
            iconHTML: moveSmallIcon(mid),
            search: makeSearchKey(mv.name || mid),
        });
    }

    // Abilities
    for (const [aid, a] of Object.entries(ABIL || {})){
        out.push({
            kind:'ability',
            id: aid,
            label: a.name || aid,
            sub: a.description || '',
            search: makeSearchKey(a.name || aid),
        });
    }

    // Types
    for (const tid of Object.keys(typeData || {})){
        out.push({
            kind:'type',
            id: tid,
            label: typeData[tid]?.name || tid,
            iconHTML: typeIconTag(tid).replace('class="type-icon"', 'class="type-icon" style="width:18px;height:18px"'),
            search: typeData[tid]?.name || tid,
        });
    }

    // Locations
    for (const [lid, loc] of Object.entries(LOCS || {})) {
        const name = (loc?.name || `#${lid}`).trim();
        out.push({
            kind: 'loc',
            id: lid,
            label: name,
            sub: Object.keys(loc?.encounters || {}).join(', '), // e.g., "Land, Water"
            iconHTML: `<span class="suggest-pin" aria-hidden="true">📍</span>`,
            search: makeSearchKey(name),
        });
    }


    SEARCH_INDEX = out;
}

function ensureSuggestBox(){
    let box = document.getElementById('search-suggest');
    if (!box){
        box = document.createElement('div');
        box.id = 'search-suggest';
        box.innerHTML = `<ul id="search-suggest-list" class="suggest-list" role="listbox"></ul>`;
        document.querySelector('.controls')?.appendChild(box);
    }
    return box as HTMLDivElement;
}

function positionSuggestBox(){
    const input = document.querySelector<HTMLInputElement>('#q');
    const box = document.getElementById('search-suggest') as HTMLDivElement | null;
    if (!input || !box) return;
    const r = input.getBoundingClientRect();
    box.style.top = `${r.bottom + 6}px`;   // 6px gap below input
    box.style.left = `${r.left}px`;
    box.style.width = `${r.width}px`;
}


function navigateFromSuggestion(s: SuggestItem){
    if (s.kind === 'mon')      navigateToMon(s.id);
    else if (s.kind === 'ability') location.hash = `#/ability/${encodeURIComponent(s.id)}`;
    else if (s.kind === 'move')    location.hash = `#/move/${encodeURIComponent(s.id)}`;
    else if (s.kind === 'type')    location.hash = `#/type/${encodeURIComponent(s.id)}`;
    else if (s.kind === 'loc')     location.hash = `#/loc/${encodeURIComponent(s.id)}`;
}

function renderSuggestions(q: string){
    const nq = makeSearchKey(q);
    const box = ensureSuggestBox();
    const ul  = box.querySelector('.suggest-list') as HTMLUListElement;

    if (!nq || !nq.trim()){
        box.style.display = 'none';
        ul.innerHTML = '';
        return;
    }

    // score & pick top N (score against normalized label)
    const scored: SuggestItem[] = [];
    for (const it of SEARCH_INDEX){
        const hay = (it as any).search || makeSearchKey(it.label);   // ← normalized
        const s   = scoreMatch(hay, nq);                              // ← use normalized haystack
        if (s >= 0) scored.push({ ...it, score: s } as any);
    }

    // prefer Pokémon > Moves > Abilities > Types > Locations on ties
    const kindOrder: Record<string, number> = { mon:0, move:1, ability:2, type:3, loc:4, location:4 };
    scored.sort((a:any,b:any)=>
        (b.score - a.score) ||
        ((kindOrder[a.kind] ?? 999) - (kindOrder[b.kind] ?? 999)) ||
        a.label.localeCompare(b.label)
    );

    const top = scored.slice(0, 12);

    ul.innerHTML = top.map((s:any, idx:number) => `
    <li class="suggest-item" role="option" data-kind="${s.kind}" data-id="${escapeHTML(s.id)}" data-idx="${idx}">
      ${s.iconHTML || ''}
      <div class="suggest-main">
        <div class="suggest-label">${highlight(s.label, q)}</div>
        ${s.sub ? `<div class="suggest-sub">${escapeHTML(s.sub)}</div>` : ``}
      </div>
      <div class="suggest-kind">${s.kind}</div>
    </li>
  `).join('');

    // click
    ul.querySelectorAll<HTMLLIElement>('.suggest-item').forEach(li => {
        li.addEventListener('click', () => {
            const idx = Number(li.dataset.idx);
            const chosen = top[idx];
            if (chosen) {
                navigateFromSuggestion(chosen);
                hideSuggestions();
            }
        });
    });

    // inside renderSuggestions()
    const hasResults = top.length > 0;
    (document.querySelector('#q') as HTMLInputElement)?.setAttribute('aria-expanded', String(hasResults));


    // show & position
    box.style.display = top.length ? 'block' : 'none';
    positionSuggestBox();
}


function hideSuggestions(){
    const box = document.getElementById('search-suggest') as HTMLDivElement | null;
    if (box){
        box.style.display = 'none';
        const ul = box.querySelector('.suggest-list') as HTMLUListElement | null;
        if (ul) ul.innerHTML = '';
    }
}


// tiny debounce so we don't recompute on every keystroke
function debounce<T extends (...args:any[]) => void>(fn: T, wait = 120){
    let t: number | undefined;
    return (...args: Parameters<T>) => {
        if (t) window.clearTimeout(t);
        t = window.setTimeout(() => fn(...args), wait);
    };
}

function wireSearchSuggest(){
    const input = document.querySelector<HTMLInputElement>('#q');
    if (!input) return;

    // Kill native suggestions/autofill
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('spellcheck', 'false');

    // ARIA combobox semantics (optional but nice)
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', 'search-suggest-list'); // make sure your UL uses this id
    // Some Chrome builds still show history unless name is “unfamiliar”
    if (!input.name) input.name = 'site-search-' + Math.random().toString(36).slice(2);

    let activeIndex = -1;

    const getListEl = () =>
        document.querySelector('#search-suggest .suggest-list') as HTMLUListElement | null;

    const getItems = () => {
        const ul = getListEl();
        return ul ? Array.from(ul.querySelectorAll<HTMLLIElement>('.suggest-item')) : [];
    };

    const setActive = (i:number) => {
        const ul = getListEl();
        if (!ul) return;
        const items = getItems();
        items.forEach(el => el.classList.remove('active'));
        if (i >= 0 && i < items.length){
            items[i].classList.add('active');
            (items[i] as HTMLElement).scrollIntoView({ block: 'nearest' });
        }
        activeIndex = i;
    };

    const debouncedRender = debounce((val:string) => {
        renderSuggestions(val);    // renders dropdown only (main table stays untouched)
        setActive(-1);
        positionSuggestBox();
    }, 120);

    // show suggestions as you type
    input.addEventListener('input', () => {
        debouncedRender(input.value);
    });

    // also show when focusing an already-typed query
    input.addEventListener('focus', () => {
        if (input.value.trim()){
            renderSuggestions(input.value);
            setActive(-1);
            positionSuggestBox();
        }
    });

    // keyboard navigation
    input.addEventListener('keydown', (e) => {
        const items = getItems();
        if (e.key === 'ArrowDown'){
            e.preventDefault(); e.stopPropagation();
            if (!items.length) return;
            setActive((activeIndex + 1) % items.length);
        } else if (e.key === 'ArrowUp'){
            e.preventDefault(); e.stopPropagation();
            if (!items.length) return;
            setActive((activeIndex - 1 + items.length) % items.length);
        } else if (e.key === 'Enter'){
            const box = document.getElementById('search-suggest');
            if (box && box.style.display !== 'none' && items.length){
                e.preventDefault(); e.stopPropagation();
                const pick = items[activeIndex >= 0 ? activeIndex : 0];
                pick?.click();   // navigateFromSuggestion() is wired in renderSuggestions()
            }
        } else if (e.key === 'Escape'){
            hideSuggestions();
        }
    });

    // hide when clicking elsewhere
    document.addEventListener('click', (e) => {
        const box = document.getElementById('search-suggest');
        if (!box) return;
        if (e.target === input || box.contains(e.target as Node)) return;
        hideSuggestions();
    }, { capture: true });

    window.addEventListener('resize', positionSuggestBox);
    window.addEventListener('scroll', positionSuggestBox, { passive: true });
    window.addEventListener('hashchange', hideSuggestions);
}



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
    return `<span class="tip-icons">${list.map(typeLinkIconTag).join("")}</span>`;
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

// All type ids, from your TYPES dataset
function allTypes(): string[] {
    return Object.keys(typeData || {});
}

// Get multiplier for a single attacking vs single defending type
function mult(atk: string, def: string): number {
    const immunities = typeData[def].immunities;
    for (const x of immunities) {
        if (x == atk) {
            return 0;
        }
    }
    const resistances = typeData[def].resistances;
    for (const x of resistances) {
        if (x == atk) {
            return 0.5;
        }
    }
    const weaknesses = typeData[def].weaknesses;
    for (const x of weaknesses) {
        if (x == atk) {
            return 2;
        }
    }
    return 1;
}

// For DEFENDING as a single type: what hits this type for 0, 0.5, 2
function defendingBuckets(defType: string) {
    const immune: string[] = [];
    const resist: string[] = [];
    const weak: string[] = [];
    for (const a of allTypes()) {
        const m = mult(a, defType);
        if (m === 0) immune.push(a);
        else if (m === 0.5) resist.push(a);
        else if (m === 2) weak.push(a);
    }
    return { immune, resist, weak };
}

// For ATTACKING as a single type: what targets are 0, 0.5, 2
function attackingBuckets(atkType: string) {
    const noEffect: string[] = [];
    const notVery: string[] = [];
    const superEff: string[] = [];
    for (const d of allTypes()) {
        const m = mult(atkType, d);
        if (m === 0) noEffect.push(d);
        else if (m === 0.5) notVery.push(d);
        else if (m === 2) superEff.push(d);
    }
    return { noEffect, notVery, superEff };
}


// ----- Moves ------
// Moves index (from moves.json)
let movesIndex: Record<string, any> = {};

async function loadMoves() {
    const dataUrl = new URL("./data/moves.json", document.baseURI).toString();
    const res = await fetch(dataUrl, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${dataUrl}`);
    movesIndex = await res.json();
}

// ── Category icon helpers (PHYSICAL / SPECIAL / STATUS) ────────────────
function categoryIconCandidates(catRaw: string | undefined): string[] {
    const base = new URL("./images/categories/", document.baseURI).toString();
    const c = String(catRaw || "");
    const up = c.toUpperCase();
    const cap = c ? c[0].toUpperCase() + c.slice(1).toLowerCase() : c;
    const variants = [up, cap, c.toLowerCase()];
    const exts = ["png", "PNG"];
    const seen = new Set<string>(); const urls: string[] = [];
    for (const v of variants) for (const ext of exts) {
        const u = base + encodeURIComponent(v) + "." + ext;
        if (!seen.has(u)) { urls.push(u); seen.add(u); }
    }
    return urls;
}
function categoryIconTag(catRaw: string | undefined) {
    if (!catRaw) return "";
    const srcs = categoryIconCandidates(catRaw);
    const alt = String(catRaw);
    return `<img class="cat-icon"
               src="${srcs[0]}" data-srcs="${srcs.join("|")}" data-idx="0"
               alt="${alt}" title="${alt}" loading="lazy" decoding="async">`;
}

// ── Move lookup helpers (from moves.json you loaded into movesIndex) ───
function moveInfo(moveId: string) {
    return movesIndex?.[moveId] || null;
}
function moveDisplayName(moveId: string) {
    const m = moveInfo(moveId);
    return (m?.name) || moveId;
}

function buildLevelUpTable(p: Mon): string {
    const list = (p.moves || [])
        .slice()
        .sort((a, b) => (a.level - b.level) || a.move.localeCompare(b.move));

    if (!list.length) {
        return `
      <section class="learnset">
        <h2 class="learnset-title">Level-Up Moves</h2>
        <div class="empty-learnset">No level-up moves found.</div>
      </section>`;
    }

    const rows = list.map(({ level, move }) => {
        const mv = moveInfo(move);
        const levelLabel = (level === 0) ? "Evolve" : (level === 1 ? "—" : String(level));

        const typeIcon = mv?.type ? typeLinkIconTag(mv.type) : "";
        const catIcon  = categoryIconTag(mv?.category);

        // Power: em-dash when null/undefined or explicitly 1 (per your rule) or Status
        const power = (mv?.category === "Status" || mv?.power == null || mv?.power === 1) ? "—" : String(mv.power ?? "—");
        // Accuracy: em-dash when 0 (always hits) or missing
        const acc   = (mv?.accuracy == null || mv?.accuracy === 0) ? "—" : String(mv.accuracy);
        // PP: should always be present, fallback just in case
        const pp    = (mv?.pp ?? "—");

        const desc  = mv?.description || "";

        return `
      <tr>
        <td class="lv">${levelLabel}</td>
        <td class="mv-name" title="${moveDisplayName(move)}">${moveLinkHTML(move)}</td>
        <td class="mv-type">${typeIcon}</td>
        <td class="mv-cat">${catIcon}</td>
        <td class="mv-num">${power}</td>
        <td class="mv-num">${acc}</td>
        <td class="mv-num">${pp}</td>
        <td class="mv-desc">${desc}</td>
      </tr>`;
    }).join("");

    return `
  <section class="learnset">
    <h2 class="learnset-title">Level-Up Moves</h2>
    <table class="moves-table">
      <thead>
        <tr>
          <th class="lv">Lv</th>
          <th class="mv-name">Move</th>
          <th class="mv-type">Type</th>
          <th class="mv-cat">Cat</th>
          <th class="mv-num">Power</th>
          <th class="mv-num">Acc</th>
          <th class="mv-num">PP</th>
          <th class="mv-desc">Description</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </section>`;
}


// --- Abilities ---

let ABIL: AbilityMap = {}; // filled at startup

async function loadAbilities() {
    const url = new URL("./data/abilities.json", document.baseURI).toString();
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    ABIL = await res.json();
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

function moveLinkHTML(moveId: string) {
    const name = moveDisplayName(moveId);
    return `<a href="#/move/${encodeURIComponent(moveId)}" class="move-link" data-move="${moveId}" title="${name}">${name}</a>`;
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

// --- Numeric-aware search normalizer ---
// lowercases, strips accents, converts number words & roman numerals to digits
function makeSearchKey(s: string): string {
    if (!s) return "";
    s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // strip accents
    s = s.replace(/[-–—]/g, " ");                           // hyphens to spaces
    const lower = s.toLowerCase();

    // replace roman numerals (standalone tokens) with digits
    const romanized = lower.replace(/\b[mcdlxvi]+\b/gi, (t) => {
        const n = romanToInt(t);
        return n ? String(n) : t.toLowerCase();
    });

    // replace number words up to 99 (handles "twenty one", "twenty-one", "sixteen")
    return wordsToDigits(romanized).replace(/\s+/g, " ").trim();
}

function romanToInt(str: string): number {
    const map: Record<string, number> = {i:1,v:5,x:10,l:50,c:100,d:500,m:1000};
    let n = 0, prev = 0;
    for (let i = str.length - 1; i >= 0; i--) {
        const v = map[str[i].toLowerCase()] || 0;
        n += v < prev ? -v : v;
        prev = v;
    }
    return n;
}

function wordsToDigits(s: string): string {
    const ones: Record<string, number> = {
        zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9,
        ten:10, eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16, seventeen:17, eighteen:18, nineteen:19
    };
    const tens: Record<string, number> = {
        twenty:20, thirty:30, forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90
    };

    const tok = s.split(/\s+/);
    const out: string[] = [];
    for (let i = 0; i < tok.length; i++) {
        const t = tok[i];
        if (t in ones) { out.push(String(ones[t])); continue; }

        if (t in tens) {
            let val = tens[t];
            const next = tok[i+1] || "";
            if (next in ones) { val += ones[next]; i++; }
            out.push(String(val));
            continue;
        }

        // handle hyphenated tens-ones like "twenty-one"
        const m = t.match(/^([a-z]+)-([a-z]+)$/i);
        if (m && (m[1].toLowerCase() in tens) && (m[2].toLowerCase() in ones)) {
            out.push(String(tens[m[1].toLowerCase()] + ones[m[2].toLowerCase()]));
            continue;
        }

        out.push(t);
    }
    return out.join(" ");
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

function summarizeEncounterType(rows: EncounterRow[]): {
    list: { intName: string; chancePct: number; minLvl: number; maxLvl: number }[];
    total: number;
} {
    const acc = new Map<string, { chance: number; min: number; max: number }>();
    let total = 0;

    for (const [chance, mon, lo, hi] of rows) {
        total += chance;
        const cur = acc.get(mon);
        if (cur) {
            cur.chance += chance;
            cur.min = Math.min(cur.min, lo);
            cur.max = Math.max(cur.max, hi);
        } else {
            acc.set(mon, { chance, min: lo, max: hi });
        }
    }

    const list = Array.from(acc, ([intName, v]) => ({
        intName,
        chancePct: total ? Math.round((v.chance * 100) / total) : 0,
        minLvl: v.min,
        maxLvl: v.max,
    }));

    list.sort((a, b) =>
        b.chancePct - a.chancePct ||
        (MON_BY_INTERNAL[a.intName]?.name || a.intName)
            .localeCompare(MON_BY_INTERNAL[b.intName]?.name || b.intName)
    );

    return { list, total };
}

const fmtLv = (min:number, max:number) => (min === max ? `Lv. ${min}` : `Lv. ${min}–${max}`);


const locHref = (id: string) => `#/loc/${encodeURIComponent(id)}`;
const monHref = (m: Mon) => `#/mon/${encodeURIComponent(m.id)}`;


function scrollToTopNow() {
    // Window/body scroll:
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    // The main content area (it’s scrollable via overflow:auto):
    const grid = document.getElementById('grid');
    if (grid) grid.scrollTop = 0;
}

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

// Resolve to a Mon if only a string is passed
function _asMon(m: Mon | string): Mon {
    if (typeof m !== "string") return m;
    const byInternal = (window as any).MON_BY_INTERNAL?.[m];
    const byId = (window as any).MON_BY_ID?.[m];
    return byInternal || byId || ({ internalName: m, id: String(m), name: m, types: [], stats:{hp:0,atk:0,def:0,spa:0,spd:0,spe:0}, abilities:[] } as unknown as Mon);
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

function moveRowHTML(moveId: string) {
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

function buildMovesTableNoLv(title: string, ids: string[]) {
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

// put near your tooltip helpers
function hideTooltip() {
    const tip = document.getElementById("tooltip");
    if (tip) tip.classList.remove("show");
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

async function loadPokemon(): Promise<Mon[]> {
    const dataUrl = new URL("./data/pokemon.json", document.baseURI).toString();
    const res = await fetch(dataUrl, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${dataUrl}`);
    const raw = await res.json();

    // file can be an array or an object map — normalize to array
    const arr: any[] = Array.isArray(raw) ? raw : Object.values(raw || {});

    // massage into our Mon shape, keeping fields if present
    const list: Mon[] = arr.map((e: any, idx: number) => {
        const statsObj = e.stats || {};
        const stats: Stats = {
            hp:  num(statsObj.hp, 0),
            atk: num(statsObj.atk, 0),
            def: num(statsObj.def, 0),
            spa: num(statsObj.spa, 0),
            spd: num(statsObj.spd, 0),
            spe: num(statsObj.spe, 0),
        };

        const id = e.id ?? (e.internalName ? slugify(e.internalName) :
            e.name ? slugify(e.name) : `pokemon-${idx+1}`);

        const types = Array.isArray(e.types) ? e.types.filter(Boolean)
            : toArray(e.types);

        return {
            id,
            internalName: e.internalName ?? e.InternalName ?? id,
            name: e.name ?? e.Name ?? e.internalName ?? `Pokemon ${idx+1}`,
            types,
            stats,
            abilities: Array.isArray(e.abilities) ? e.abilities : toArray(e.abilities || e.Abilities),
            hiddenAbility: e.hiddenAbility ?? e.HiddenAbility ?? undefined,
            summary: e.summary ?? e.pokedex ?? e.Pokedex ?? e.kind ?? "",

            moves: Array.isArray(e.moves) ? e.moves : [],
            tutorMoves: toArray(e.tutorMoves),
            eggMoves: toArray(e.eggMoves),
            machineMoves: toArray(e.machineMoves),

            evolutions: Array.isArray(e.evolutions) ? e.evolutions : [],
            isForm: !!e.isForm,
            baseInternal: e.baseInternal,
        };
    });

    // compute and attach unique pre-evolutions
    attachPrevos(list);

    console.log("Loaded pokemon:", { url: dataUrl, count: list.length, sample: list[0] });
    return list;
}

function attachPrevos(pokemon: Mon[]) {
    const byInternal = new Map<string, Mon>();
    pokemon.forEach(p => byInternal.set(p.internalName, p));

    pokemon.forEach(parent => {
        const evos = parent.evolutions || [];
        for (const ev of evos) {
            const child = byInternal.get(ev.to);
            if (child && !child.prevo) {
                child.prevo = parent.internalName; // unique, set once
            }
        }
    });
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
    const grid    = document.querySelector<HTMLElement>("#grid");
    const typeSel = document.querySelector<HTMLSelectElement>("#type");
    const count   = document.querySelector<HTMLElement>("#count");
    if (!grid || !typeSel || !count) return;

    const typeFilter = typeSel.value;     // keep type filter if you still want it

    const list = pokemon
        .filter(p => !typeFilter || p.types.includes(typeFilter)) // ← no text query here
        .sort((a, b) => a.name.localeCompare(b.name));            // your default sort

    count.textContent = `${list.length} result${list.length === 1 ? "" : "s"}`;
    grid.innerHTML = buildTableHTML(list);

    // keep your column sizing logic
    const table = grid.querySelector<HTMLTableElement>(".dex-table");
    if (table) applyDexTableSizing(grid);
}


/* ---------- detail rendering ---------- */
function findMonLocations(mon: Mon): { locId: string; etype: string; chancePct: number; minLvl: number; maxLvl: number }[] {
    const targetInternal = (mon as any).baseInternal || mon.internalName;
    const out: { locId: string; etype: string; chancePct: number; minLvl: number; maxLvl: number }[] = [];

    for (const [locId, loc] of Object.entries(LOCS)) {
        for (const [etype, rows] of Object.entries(loc.encounters)) {
            const { list } = summarizeEncounterType(rows);
            const hit = list.find(x => x.intName === targetInternal);
            if (hit) out.push({ locId, etype, chancePct: hit.chancePct, minLvl: hit.minLvl, maxLvl: hit.maxLvl });
        }
    }

    out.sort((a,b) =>
        b.chancePct - a.chancePct ||
        locationName(a.locId).localeCompare(locationName(b.locId)) ||
        a.etype.localeCompare(b.etype)
    );
    return out;
}


function buildMonLocationsHTML(mon: Mon): string {
    const rows = findMonLocations(mon);
    if (!rows.length) return "";
    const body = rows.map(r => `
    <tr>
      <td class="loc"><a class="plain" href="${locHref(r.locId)}" title="${escapeHTML(locationName(r.locId))}">${escapeHTML(locationName(r.locId))}</a></td>
      <td class="etype">${escapeHTML(r.etype)}</td>
      <td class="lv">${fmtLv(r.minLvl, r.maxLvl)}</td>
      <td class="num">${r.chancePct}%</td>
    </tr>
  `).join("");

    return `
    <section class="panel mon-locations" style="margin-top:12px;">
      <h2 style="margin:10px 12px 6px; font-size:14px; opacity:.8;">Locations</h2>
      <table class="mon-loc-table">
        <thead><tr><th>Location</th><th>Method</th><th>Levels</th><th>Chance</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </section>
  `;
}



function buildDetailHTML(p: Mon) {
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
    const flavor = (p as any).pokedex?.trim?.() || p.summary?.trim?.() || "";

    const detailTop = `
  <article class="detail mon-layout">
    <div class="mon-art">
      <div class="art-box panel">${img}</div>
    </div>

    <div class="mon-middle">
      <div class="info-tile panel">
        <div class="info-label"><b>Typing</b></div>
        <div class="info-value center">
          ${typingIconsLinkedHTML(p.types).replace('class="type-icons"', 'class="type-icons big"')}
        </div>
      </div>

      <div class="info-tile panel">
        <div class="info-label"><b>Abilities</b></div>
        <div class="info-value stacked center">
          ${
        [
            p.abilities?.[0] ? abilityLinkHTML(p.abilities[0]) : "",
            p.abilities?.[1] ? abilityLinkHTML(p.abilities[1]) : "",
            p.hiddenAbility   ? abilityLinkHTML(p.hiddenAbility, { hidden: true }) : ""
        ]
            .filter(Boolean)
            .map(h => `<div class="line">${h}</div>`)
            .join("")
    }
        </div>
      </div>
      
      ${flavor ? `
      <div class="info-tile flavor">
        <div class="flavor-text">“${escapeHTML(flavor)}”</div>
      </div>
    ` : ""}

      
    </div>

    <div class="mon-stats">
      <div class="stats-panel panel">
        <table class="stats">
          <tbody>
            <tr><td class="label">HP</td>  <td class="num">${p.stats.hp}</td>  <td class="bar">${statBarHTML(p.stats.hp)}</td></tr>
            <tr><td class="label">Atk</td> <td class="num">${p.stats.atk}</td> <td class="bar">${statBarHTML(p.stats.atk)}</td></tr>
            <tr><td class="label">Def</td> <td class="num">${p.stats.def}</td> <td class="bar">${statBarHTML(p.stats.def)}</td></tr>
            <tr><td class="label">SpA</td> <td class="num">${p.stats.spa}</td> <td class="bar">${statBarHTML(p.stats.spa)}</td></tr>
            <tr><td class="label">SpD</td> <td class="num">${p.stats.spd}</td> <td class="bar">${statBarHTML(p.stats.spd)}</td></tr>
            <tr><td class="label">Spe</td> <td class="num">${p.stats.spe}</td> <td class="bar">${statBarHTML(p.stats.spe)}</td></tr>
            <tr class="bst"><td class="label">BST</td><td class="num">${bst(p.stats)}</td><td class="bar"></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </article>`;

    const evolutions = buildEvolutionHTML(p);

    const locations = buildMonLocationsHTML(p);

    const learnset = buildLevelUpTable(p);
    // Tutor + Machine moves combined
    const tutorAndTM = [
        ...(p.tutorMoves || []),
        ...(p.machineMoves || []),
    ];
    const tutorTMSection = buildMovesTableNoLv("Tutor / TM Moves", tutorAndTM);

    // Egg moves
    const eggSection = buildMovesTableNoLv("Egg Moves", eggMovesFromRoot(p));

    // Return everything
    return detailTop + evolutions + locations + learnset + tutorTMSection + eggSection;

}

function renderTypeDetail(typeId: string) {
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


function buildMoveDetailHTML(moveId: string): string {
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
        ? `<ul class="flag-list">${flags.map(f => `<li>${tFlag(f)}</li>`).join("")}</ul>`
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

function typeLinkIconTag(t: string) {
    return `<a href="#/type/${encodeURIComponent(t)}" class="type-link" data-type="${t}">${typeIconTag(t)}</a>`;
}

function typingIconsLinkedHTML(types: string[]) {
    return `<span class="type-icons">${types.map(typeLinkIconTag).join("")}</span>`;
}


function chainRoot(mon: Mon): Mon {
    let cur = mon;
    const seen = new Set<string>();
    while (cur.prevo && !seen.has(cur.prevo)) {
        seen.add(cur.internalName);
        const prev = byInternal.get(cur.prevo);
        if (!prev) break;
        cur = prev;
    }
    return cur;
}

function eggMovesFromRoot(mon: Mon): string[] {
    const root = chainRoot(mon);
    return Array.isArray(root.eggMoves) ? root.eggMoves : [];
}

function pokemonLearnersOf(moveId: string): Mon[] {
    const out: Mon[] = [];
    const seen = new Set<string>();
    for (const p of ALL_POKEMON) {
        const lvl  = (p.moves || []).some(m => m.move === moveId);
        const ttm  = (p.tutorMoves || []).includes(moveId) || (p.machineMoves || []).includes(moveId);
        const egg  = eggMovesFromRoot(p).includes(moveId);
        if (lvl || ttm || egg) {
            if (!seen.has(p.internalName)) {
                seen.add(p.internalName);
                out.push(p);
            }
        }
    }
    return out.sort((a,b)=> a.name.localeCompare(b.name));
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
    count.innerHTML = `<button class="header-back" aria-label="Back">← Back</button>`;
    count.querySelector<HTMLButtonElement>(".header-back")?.addEventListener("click", navBack);


    // Build the card WITHOUT an internal back button
    grid.innerHTML = buildDetailHTML(mon);

    // sprite fallback
    wireFallbacks(grid, "img.mon-front");
    wireFallbacks(grid, "img.type-icon");
    wireFallbacks(grid, "img.cat-icon");

}

/* ----- intl ------ */
// ---- i18n / intl ------------------------------------------------------
type IntlPack = {
    moveTargets?: Record<string, string>;
    moveFlags?: Record<string, string>;
    evoMethods?: Record<string, string>;     // ← NEW
};

let INTL: IntlPack = {};
let INTL_IDX = {
    moveTargets: new Map<string, string>(),
    moveFlags: new Map<string, string>(),
    evoMethods: new Map<string, string>()    // ← NEW
};

const normKey = (s: string) => String(s || "").replace(/[\s_-]+/g, "").toLowerCase();
const humanize = (s: string) =>
    String(s || "")
        .replace(/[_-]+/g, " ")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, c => c.toUpperCase());

async function loadIntl() {
    const url = new URL("./data/intl.json", document.baseURI).toString();
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) return;
    INTL = await res.json();

    // rebuild indexes (for forgiving lookups)
    INTL_IDX.moveTargets.clear();
    INTL_IDX.moveFlags.clear();
    INTL_IDX.evoMethods.clear();             // ← NEW

    for (const [k, v] of Object.entries(INTL.moveTargets || {})) {
        INTL_IDX.moveTargets.set(normKey(k), v);
    }
    for (const [k, v] of Object.entries(INTL.moveFlags || {})) {
        INTL_IDX.moveFlags.set(normKey(k), v);
    }
    for (const [k, v] of Object.entries(INTL.evoMethods || {})) {  // ← NEW
        INTL_IDX.evoMethods.set(normKey(k), v);
    }
}

function tTarget(key: string | undefined): string {
    if (!key) return "—";
    return INTL_IDX.moveTargets.get(normKey(key)) || humanize(key);
}
function tFlag(key: string | undefined): string {
    if (!key) return "—";
    return INTL_IDX.moveFlags.get(normKey(key)) || humanize(key);
}


/* ---------- tiny hash router ---------- */

type Route = { kind: "list" } | { kind: "mon"; id: string } | { kind: "ability"; id: string };

function parseHash(): {type:'list'|'mon'|'ability'|'move'|'type', id?:string} {
    const m = location.hash.match(/^#\/(mon|ability|move|type)\/(.+)$/);
    if (m) return { type: m[1] as any, id: decodeURIComponent(m[2]) };
    return { type: 'list' };
}

function parseRoute(): { kind: 'mon'|'ability'|'move'|'type'|'loc'|'list'; id?: string } {
    const h = location.hash;
    let m = h.match(/^#\/mon\/(.+)$/);  if (m) return { kind:'mon',  id: decodeURIComponent(m[1]) };
    m = h.match(/^#\/ability\/(.+)$/);     if (m) return { kind:'ability', id: decodeURIComponent(m[1]) };
    m = h.match(/^#\/move\/(.+)$/);     if (m) return { kind:'move', id: decodeURIComponent(m[1]) };
    m = h.match(/^#\/type\/(.+)$/);     if (m) return { kind:'type', id: decodeURIComponent(m[1]) };
    m = h.match(/^#\/loc\/(.+)$/);      if (m) return { kind:'loc',  id: decodeURIComponent(m[1]) };
    return { kind:'list' };
}

function renderMoveDetail(moveId: string) {
    const grid  = document.querySelector<HTMLElement>("#grid");
    const count = document.querySelector<HTMLElement>("#count");
    if (!grid || !count) return;

    count.innerHTML = `<button class="header-back" aria-label="Back">← Back</button>`;
    count.querySelector<HTMLButtonElement>(".header-back")?.addEventListener("click", navBack);


    grid.innerHTML = buildMoveDetailHTML(moveId);

    // Fallbacks + ensure learner table uses main table widths
    wireIconFallbacks(grid);
    applyDexTableSizing(grid);
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
    location.hash = '';
    history.pushState("", document.title, window.location.pathname + window.location.search); // clear hash
    renderCurrent();
    scrollToTopNow();
}

let NAV_STACK: string[] = [];
let NAV_LOCK = false; // suppress push while we programmatically go back

const currentRoute = () => (location.hash || "");



function renderCurrent() {
    const grid = document.querySelector<HTMLElement>("#grid");
    if (!grid) return;
    const pokemon = JSON.parse(grid.getAttribute("data-all-pokemon") || "[]") as Mon[];
    const route = parseRoute();
    switch (route.kind) {
        case 'mon':  return renderDetail(pokemon, route.id!);
        case 'ability': return renderAbilityDetail(pokemon, route.id!);
        case 'move': return renderMoveDetail(route.id!);
        case 'type': return renderTypeDetail(route.id!);
        case 'loc':  return renderLocationDetail(route.id!);  // ← NEW
        default:     return renderTable(pokemon);
    }
}
/* ---------- evolutions ---------- */

type EvoEdge = { from: string; to: string; method?: string; param?: string };

// After you load INTL and MOVES:
const EVO_TPL: Record<string, string> = (window as any).INTL?.evoMethods || {};

function tpl(str: string, ctx: Record<string, string | number | undefined>) {
    return str.replace(/\{(\w+)\}/g, (_, k) => String(ctx[k] ?? ""));
}

function moveNameFromId(id?: string): string {
    if (!id) return "";
    const m = movesIndex[id];
    return m?.name || id;
}


// Build quick indexes after loading Pokémon
let MON_BY_INTERNAL: Record<string, Mon> = {};
let MON_BY_ID: Record<string, Mon> = {};

// If you already have INTL + an evoMethods map, this integrates nicely.
// Fallbacks still work if no INTL string is provided.
function formatEvoMethod(method: string, param?: string): string {
    const mKey = normKey(method);
    const tem  = (INTL as any)?.evoMethods?.[method] || (INTL as any)?.evoMethods?.[mKey];

    const tokens: Record<string, string> = {
        method,
        param: param ?? ""
    };

    // Item name (if template asks for {item})
    if (tem && tem.includes("{item}")) {
        tokens.item = itemName(param || "");
    }

    // Location name (if method is Location OR template asks for {location})
    if (/^Location$/i.test(method) || (tem && tem.includes("{location}"))) {
        const name = locationName(param || "");
        tokens.location = name;
        // If template uses {param} to mean the location string, keep this behavior:
        if (tem && tem.includes("{param}")) tokens.param = name;
    }

    // NEW: {level} → show the numeric parameter as-is (integer string)
    if (tem && tem.includes("{level}")) {
        const n = parseInt(param ?? "", 10);
        tokens.level = Number.isFinite(n) ? String(n) : (param ?? "");
    }

    // NEW: {move} → display move's proper name
    if (tem && tem.includes("{move}")) {
        tokens.move = moveNameFromId(param || "");
    }

    // Apply template if present
    if (tem) {
        return tem.replace(/\{(\w+)\}/g, (_, k) => tokens[k] ?? "");
    }

    // Fallbacks (keep your previous behavior)
    if (/^Location$/i.test(method) && tokens.location) return `Level up at ${tokens.location}`;
    return tokens.param ? `${method} ${tokens.param}` : method;
}




// 48×48 evo icon (crop left half) — evolution line
function miniIcon48(monOrName: Mon | string) {
    const p = _asMon(monOrName);
    const urls = iconCandidates(p);
    const all = urls.join("|").replace(/"/g, "&quot;");
    return `<img class="evo-mini"
               src="${urls[0]}"
               data-srcs="${all}"
               data-si="0"
               alt=""
               loading="lazy"
               style="width:48px;height:48px;object-fit:cover;object-position:left center;image-rendering:pixelated;border-radius:8px;"
               onerror="(function(el){
                 var a=(el.getAttribute('data-srcs')||'').split('|');
                 var i=+el.getAttribute('data-si')||0; i++;
                 if(i<a.length){el.setAttribute('data-si',i); el.src=a[i];}
                 else{el.style.display='none';}
               })(this)">`;
}

// Return [baseInternal, stages, edgeLabelMap]
function buildEvolutionStages(current: Mon): {
    base: string;
    stages: string[][];
    edgeLabel: Map<string, string>; // childInternal -> method text
} {
    // 1) ascend to base via prevo
    let base = current.internalName;
    const guard = new Set<string>();
    while (true) {
        if (guard.has(base)) break;
        guard.add(base);
        const up = MON_BY_INTERNAL[base]?.prevo;
        if (!up) break;
        base = up;
    }

    // 2) build parent->edges from dataset
    const edgesByParent = new Map<string, EvoEdge[]>();
    Object.values(MON_BY_INTERNAL).forEach(m => {
        const parent = m.internalName;
        const evos = (m.evolutions || []) as any[];
        if (!Array.isArray(evos) || evos.length === 0) return;
        for (const e of evos) {
            const to = String(e.to || "").trim();
            if (!to) continue;
            const edge: EvoEdge = { from: parent, to, method: e.method, param: e.param };
            const arr = edgesByParent.get(parent) || [];
            arr.push(edge);
            edgesByParent.set(parent, arr);
        }
    });

    // 3) BFS layering from base, dedup, keep edge labels for children
    const stages: string[][] = [];
    const visited = new Set<string>();
    const edgeLabel = new Map<string, string>(); // child -> label (first seen)

    let layer: string[] = [base];
    visited.add(base);
    stages.push(layer);

    while (true) {
        const nextSet = new Set<string>();
        for (const parent of layer) {
            const edges = edgesByParent.get(parent) || [];
            for (const e of edges) {
                const child = e.to;
                if (!MON_BY_INTERNAL[child]) continue;  // skip unknown
                if (!edgeLabel.has(child)) {
                    edgeLabel.set(child, formatEvoMethod(e.method, e.param));
                }
                if (!visited.has(child)) {
                    visited.add(child);
                    nextSet.add(child);
                }
            }
        }
        const next = Array.from(nextSet);
        if (!next.length) break;
        stages.push(next);
        layer = next;
    }

    return { base, stages, edgeLabel };
}

function buildEvolutionHTML(current: Mon): string {
    const { stages, edgeLabel } = buildEvolutionStages(current);
    if (!stages.length) return "";

    const stageRows = stages.map((internals, idx) => {
        const items = internals.map(intName => {
            const m = MON_BY_INTERNAL[intName];
            if (!m) return "";
            const link = `#/mon/${encodeURIComponent(m.id)}`;
            const method = idx > 0 ? (edgeLabel.get(intName) || "") : "";
            return `
        <div class="evo-item">
          <a class="evo-link" href="${link}" title="${escapeHTML(m.name)}">
            ${miniIcon48(m.internalName)}
            <div class="evo-name">${escapeHTML(m.name)}</div>
          </a>
          ${method ? `<div class="evo-method">${escapeHTML(method)}</div>` : ``}
        </div>`;
        }).join("");
        return `<div class="evo-stage">${items}</div>`;
    }).join(`<div class="evo-sep">↓</div>`);

    return `
    <section class="panel evo-line">
      <h2>Evolution line</h2>
      <div class="evo-graph">
        ${stageRows}
      </div>
    </section>`;
}

function renderLocationDetail(locId: string) {
    const grid = document.querySelector<HTMLElement>("#grid");
    const count = document.querySelector<HTMLElement>("#count");
    if (!grid || !count) return;

    const loc = LOCS[locId];
    if (!loc) {
        count.innerHTML = `<button class="header-back" aria-label="Back">← Back</button>`;
        grid.innerHTML = `<div style="padding:16px;">Location not found.</div>`;
        count.querySelector<HTMLButtonElement>(".header-back")?.addEventListener("click", navBack);
        return;
    }

    // Header back button (same style as Pokémon)
    count.innerHTML = `<button class="header-back" aria-label="Back">← Back</button>`;
    count.querySelector<HTMLButtonElement>(".header-back")?.addEventListener("click", navBack);

    // For each encounter type, build a small table
    const sections = Object.entries(loc.encounters)
        .sort((a,b)=> a[0].localeCompare(b[0]))
        .map(([etype, rows]) => buildLocationMonSection(etype, rows))
        .join("");

    grid.innerHTML = `
    <article class="detail">
      <h1 class="detail-name">${escapeHTML(loc.name || `#${loc.id}`)}</h1>
      ${sections || `<div style="padding:12px;opacity:.7;">No encounters recorded.</div>`}
    </article>
  `;

    wireIconFallbacks(grid);
    scrollToTopNow?.();
}

function buildLocationMonSection(etype: string, rows: EncounterRow[]): string {
    const { list } = summarizeEncounterType(rows);
    const body = list.map(({ intName, chancePct, minLvl, maxLvl }) => {
        const mon = MON_BY_INTERNAL[intName];
        const name = mon?.name || intName;
        const link = mon ? monHref(mon) : "#";
        return `
      <tr class="rowlink">
        <td class="icon">${miniIconHTML(mon || intName)}</td>
        <td class="name"><a class="plain" href="${link}">${escapeHTML(name)}</a></td>
        <td class="lv">${fmtLv(minLvl, maxLvl)}</td>
        <td class="num">${chancePct}%</td>
      </tr>`;
    }).join("");

    return `
    <section class="panel" style="margin-top:12px;">
      <h2 style="margin:10px 12px 6px; font-size:14px; opacity:.8;">${escapeHTML(etype)}</h2>
      <table class="location-table">
        <thead>
          <tr><th></th><th>Pokémon</th><th>Levels</th><th>Chance</th></tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </section>`;
}



/* ---------- start ---------- */

async function start() {
    initTheme();

    await Promise.all([
        loadIntl(),
        loadAbilities?.(),  // if you already have this
        loadTypes?.(),      // if you already have this
        loadMoves(),
        loadItems(),
        loadEncounters(),
    ]);

    const pokemon = await loadPokemon();
    ALL_POKEMON = pokemon;
    MON_BY_INTERNAL = {};
    MON_BY_ID = {};
    for (const m of ALL_POKEMON) {
        MON_BY_INTERNAL[m.internalName] = m;
        MON_BY_ID[m.id] = m;
    }
    byInternal = new Map(pokemon.map(m => [m.internalName, m]));

    buildFilters(pokemon);
    bindAbilityTooltips()
    bindTypeTooltips()

    buildSearchIndex()
    wireSearchSuggest();

    setupNavStack()

    const grid = document.querySelector<HTMLElement>("#grid");
    if (grid) grid.setAttribute("data-all-pokemon", JSON.stringify(pokemon));

    const q = document.querySelector<HTMLInputElement>("#q");
    const typeSel = document.querySelector<HTMLSelectElement>("#type");
    const rerender = () => renderTable(pokemon);
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

function navBack(){
    if (NAV_STACK.length <= 1) {
        // Nothing to go back to → go to list
        NAV_LOCK = true;
        NAV_STACK = [''];
        location.hash = '';               // triggers hashchange + render
        queueMicrotask(() => { NAV_LOCK = false; });
        return;
    }
    // Pop current and navigate to previous
    NAV_LOCK = true;
    NAV_STACK.pop();                    // drop current
    const prev = NAV_STACK[NAV_STACK.length - 1] || '';
    location.hash = prev;               // triggers hashchange + render
    queueMicrotask(() => { NAV_LOCK = false; });
}


function setupNavStack(){
    // initialize with current route ('' means list)
    NAV_STACK = [currentRoute()];

    window.addEventListener("hashchange", () => {
        const h = currentRoute();
        if (!NAV_LOCK) {
            const last = NAV_STACK[NAV_STACK.length - 1];
            if (h !== last) NAV_STACK.push(h);
        }
        renderCurrent();     // re-render for the new route
        scrollToTopNow();    // always jump to top on route change
    }, { passive: true });
}

function resolveAbilityKey(id: string): string {
    if (ABIL?.[id]) return id;
    const up = id.toUpperCase?.() || id;
    const hit = Object.keys(ABIL || {}).find(k => k === id || k.toUpperCase() === up);
    return hit || id; // fall back, but filters may return empty if not real
}

function getAbilityInfo(id: string): { name?: string; description?: string } | undefined {
    const key = resolveAbilityKey(id);
    return (ABIL as any)?.[key];
}



function renderAbilityDetail(pokemon: Mon[], id: string) {
    const grid  = document.querySelector<HTMLElement>("#grid");
    const count = document.querySelector<HTMLElement>("#count");
    if (!grid || !count) return;

    const aKey  = resolveAbilityKey(id);
    const info  = getAbilityInfo(aKey);
    const title = info?.name || id;

    // Header Back button (same control style used elsewhere, wired to navBack)
    count.innerHTML = `<button class="header-back" aria-label="Back">← Back</button>`;
    count.querySelector<HTMLButtonElement>(".header-back")?.addEventListener("click", navBack);

    // Filter mons that have this ability (regular or hidden)
    const list = pokemon
        .filter(p => (p.abilities?.includes(aKey)) || p.hiddenAbility === aKey)
        .sort((a, b) => a.name.localeCompare(b.name));

    // Page
    grid.innerHTML = `
    <article class="detail">
      <h1 class="detail-name">${escapeHTML(title)}</h1>

      <section class="detail-block">
        ${escapeHTML(info?.description || "—")}
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





// Run in the browser after DOM is ready
if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => void start(), { once: true });

    } else {
        // hide on clicks (e.g., clicking a link) and hash-route changes
        document.addEventListener("click", () => hideTooltip(), { capture: true });
        window.addEventListener("hashchange", () => hideTooltip());

        void start();
    }
}
