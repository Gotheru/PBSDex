import { MON_BY_INTERNAL, LOCS, locationName, INTL, itemName, moveNameFromId } from "../core/data";
import { EncounterRow, Mon, Stats } from "../core/types";

export const toArray = (x: unknown): string[] => {
    if (Array.isArray(x)) return x.filter(Boolean) as string[];
    if (typeof x === "string") return x.split(",").map(s => s.trim()).filter(Boolean);
    if (x && typeof x === "object") return Object.values(x as Record<string, unknown>).map(String).filter(Boolean);
    return [];
};

export const num = (x: unknown, d = 0): number => {
    const n = typeof x === "number" ? x : parseInt(String(x), 10);
    return Number.isFinite(n) ? n : d;
};

export const slugify = (s: string) =>
    (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// HTML escaping helpers shared across modules
export function escapeHtml(s: string): string {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function escapeAttr(s: string): string {
    return escapeHtml(s).replace(/\s+/g, " ");
}

export function summarizeEncounterType(rows: EncounterRow[]): {
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

export const fmtLv = (min:number, max:number) => (min === max ? `Lv. ${min}` : `Lv. ${min}–${max}`);

export function normalizeEntry(e: any, idx: number): Mon {
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

export function findMonLocations(mon: Mon): { locId: string; etype: string; chancePct: number; minLvl: number; maxLvl: number }[] {
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

export const normKey = (s: string) => String(s || "").replace(/[\s_-]+/g, "").toLowerCase();
export const humanize = (s: string) =>
    String(s || "")
        .replace(/[_-]+/g, " ")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, c => c.toUpperCase());

export function tpl(str: string, ctx: Record<string, string | number | undefined>) {
    return str.replace(/\{(\w+)\}/g, (_, k) => String(ctx[k] ?? ""));
}

export function formatEvoMethod(method: string, param?: string): string {
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
        return tem.replace(/\{(\w+)\}/g, (_: any, k: any) => tokens[k] ?? "");
    }

    // Fallbacks (keep your previous behavior)
    if (/^Location$/i.test(method) && tokens.location) return `Level up at ${tokens.location}`;
    return tokens.param ? `${method} ${tokens.param}` : method;
}
