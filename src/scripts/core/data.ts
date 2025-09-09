import { normKey, num, slugify, toArray } from "../util/fmt";
import { AbilityMap, EncounterLocation, IntlPack, Item, Mon, Stats, SuggestItem, TypeInfo } from "./types";

// GLOBAL VARIBALES
export let ALL_POKEMON: Mon[] = [];
export let byInternal = new Map<string, Mon>()
export let LOCS: Record<string, EncounterLocation> = {};
export let typeData: Record<string, TypeInfo> = {};
export let ITEMS: Record<string, Item> = {};
export let movesIndex: Record<string, any> = {};
export let ABIL: AbilityMap = {};
export let INTL: IntlPack = {};
export let INTL_IDX = {
    moveTargets: new Map<string, string>(),
    moveFlags: new Map<string, string>(),
    evoMethods: new Map<string, string>()    // ← NEW
};
export let EVO_TPL: Record<string, string>
export let MON_BY_INTERNAL: Record<string, Mon> = {};
export let MON_BY_ID: Record<string, Mon> = {};


let GAME_ID = 'main';
let DATA_ROOT = `./data/${GAME_ID}`;
export function setGameId(id: string){
    GAME_ID = id;
    DATA_ROOT = `./data/${id}`;
}
export function getGameId(){
    return GAME_ID;
}


// NAME GETTERS
export const locationName = (locId?: string): string =>
    (locId && LOCS[locId]?.name) ? LOCS[locId].name : (locId ? `#${locId}` : "");

export const itemName = (itemId?: string): string =>
    (itemId && ITEMS[itemId]?.name) ? ITEMS[itemId].name : (itemId ? itemId : "")

export function moveInfo(moveId: string) {
    return movesIndex?.[moveId] || null;
}
export function moveDisplayName(moveId: string) {
    const m = moveInfo(moveId);
    return (m?.name) || moveId;
}

export function abilityName(id?: string | null): string {
    if (!id) return "";
    return ABIL[id]?.name || id; // fallback to internal id if missing
}

export function _asMon(m: Mon | string): Mon {
    if (typeof m !== "string") return m;
    const byInternal = (window as any).MON_BY_INTERNAL?.[m];
    const byId = (window as any).MON_BY_ID?.[m];
    return byInternal || byId || ({ internalName: m, id: String(m), name: m, types: [], stats:{hp:0,atk:0,def:0,spa:0,spd:0,spe:0}, abilities:[] } as unknown as Mon);
}

export function moveNameFromId(id?: string): string {
    if (!id) return "";
    const m = movesIndex[id];
    return m?.name || id;
}

export function resolveAbilityKey(id: string): string {
    if (ABIL?.[id]) return id;
    const up = id.toUpperCase?.() || id;
    const hit = Object.keys(ABIL || {}).find(k => k === id || k.toUpperCase() === up);
    return hit || id; // fall back, but filters may return empty if not real
}

export function getAbilityInfo(id: string): { name?: string; description?: string } | undefined {
    const key = resolveAbilityKey(id);
    return (ABIL as any)?.[key];
}

// LOADERS
async function loadEncounters(): Promise<void> {
    const url = new URL(`${DATA_ROOT}/encounters.json`, document.baseURI).toString();
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

async function loadItems(): Promise<void> {
    const url = new URL(`${DATA_ROOT}/items.json`, document.baseURI).toString();
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

async function loadMoves() {
    const dataUrl = new URL(`${DATA_ROOT}/moves.json`, document.baseURI).toString();
    const res = await fetch(dataUrl, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${dataUrl}`);
    movesIndex = await res.json();
}

async function loadAbilities() {
    const url = new URL(`${DATA_ROOT}/abilities.json`, document.baseURI).toString();
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    ABIL = await res.json();
}

async function loadTypes() {
    const dataUrl = new URL(`${DATA_ROOT}/types.json`, document.baseURI).toString();
    const res = await fetch(dataUrl, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${dataUrl}`);
    typeData = await res.json();
}

async function loadPokemon() {
    const dataUrl = new URL(`${DATA_ROOT}/pokemon.json`, document.baseURI).toString();
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

            num: e.num,
        };
    });

    // compute and attach unique pre-evolutions
    attachPrevos(list);

    console.log("Loaded pokemon:", { url: dataUrl, count: list.length, sample: list[0] });
    ALL_POKEMON = list;

    MON_BY_INTERNAL = {};
        MON_BY_ID = {};
        for (const m of ALL_POKEMON) {
            MON_BY_INTERNAL[m.internalName] = m;
            MON_BY_ID[m.id] = m;
        }
        byInternal = new Map(ALL_POKEMON.map(m => [m.internalName, m]));
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

async function loadIntl() {
    const url = new URL(`${DATA_ROOT}/intl.json`, document.baseURI).toString();
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

async function loadEvos() {
    EVO_TPL = (window as any).INTL?.evoMethods || {};
}

export async function loadAll() {
    await Promise.all([
        loadIntl(),
        loadAbilities?.(),  // if you already have this
        loadTypes?.(),      // if you already have this
        loadMoves(),
        loadItems(),
        loadEncounters(),
        loadPokemon(),
        loadEvos(),
    ]);
}

// HELPERS

// All type ids, from your TYPES dataset
export function allTypes(): string[] {
    return Object.keys(typeData || {});
}

export function chainRoot(mon: Mon): Mon {
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

export function eggMovesFromRoot(mon: Mon): string[] {
    const root = chainRoot(mon);
    return Array.isArray(root.eggMoves) ? root.eggMoves : [];
}

export function pokemonLearnersOf(moveId: string): Mon[] {
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