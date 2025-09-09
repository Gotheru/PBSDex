import { allTypes, typeData } from "../core/data";

// ---- combined defensive matchup for 1–2 types ----
export function combineDefense(types: string[]) {
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
export function defendingBuckets(defType: string) {
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
export function attackingBuckets(atkType: string) {
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

const BASE = (import.meta as any).env?.BASE_URL || '/';
export function typeCandidates(tRaw: string): string[] {
    const base = `${BASE}images/types/`;
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

export function typingIconsHTML(types: string[]): string {
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
