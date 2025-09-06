import { eggMovesFromRoot, MON_BY_INTERNAL, moveDisplayName, moveInfo } from "../core/data";
import { EvoEdge, Mon, Stats } from "../core/types";
import { escapeHTML } from "../ui/suggest";
import { abilityLinkHTML, categoryIconTag, frontCandidates, miniIcon48, moveLinkHTML, typeLinkIconTag, typingIconsLinkedHTML } from "../util/assets";
import { formatEvoMethod } from "../util/fmt";
import { buildMonLocationsHTML } from "./location";
import { buildMovesTableNoLv } from "./move";

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


// --- stat bar helpers ---
// Using a broader range keeps tall stats from capping visually too early.
const STAT_MAX = 200; // 0..200 → 10 is VERY low, 181 ≈ 90% width

export function statBarHTML(v: number) {
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

export function bst(s: Stats) {
    return s.hp + s.atk + s.def + s.spa + s.spd + s.spe;
}

export function buildDetailHTML(p: Mon) {
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

// Return [baseInternal, stages, edgeLabelMap]
export function buildEvolutionStages(current: Mon): {
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
                    edgeLabel.set(child, formatEvoMethod(e.method || "", e.param));
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

export function buildEvolutionHTML(current: Mon): string {
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