import { locationName, LOCS, MON_BY_INTERNAL } from "../core/data";
import { navBack, setHeaderBack } from "../core/router";
import { EncounterRow, Mon } from "../core/types";
import { escapeHtml } from "../util/fmt";
import { locHref, miniIconHTML, monHref } from "../util/assets";
import { scrollToTopNow, wireIconFallbacks } from "../util/dom";
import { findMonLocations, fmtLv, summarizeEncounterType } from "../util/fmt";

export function buildMonLocationsHTML(mon: Mon): string {
    const rows = findMonLocations(mon);
    if (!rows.length) return "";
    const body = rows.map(r => `
    <tr>
      <td class="loc"><a class="plain" href="${locHref(r.locId)}" title="${escapeHtml(locationName(r.locId))}">${escapeHtml(locationName(r.locId))}</a></td>
      <td class="etype">${escapeHtml(r.etype)}</td>
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

export function renderLocationDetail(locId: string) {
    const grid = document.querySelector<HTMLElement>("#grid");
    const count = document.querySelector<HTMLElement>("#count");
    if (!grid || !count) return;

    const loc = LOCS[locId];
    if (!loc) {
        setHeaderBack();
        grid.innerHTML = `<div style="padding:16px;">Location not found.</div>`;
        return;
    }

    // Header back button
    setHeaderBack();

    // For each encounter type, build a small table
    const sections = Object.entries(loc.encounters)
        .sort((a,b)=> a[0].localeCompare(b[0]))
        .map(([etype, rows]) => buildLocationMonSection(etype, rows))
        .join("");

    grid.innerHTML = `
    <article class="detail">
      <h1 class="detail-name">${escapeHtml(loc.name || `#${loc.id}`)}</h1>
      ${sections || `<div style="padding:12px;opacity:.7;">No encounters recorded.</div>`}
    </article>
  `;

    wireIconFallbacks(grid);
    scrollToTopNow?.();
}

export function buildLocationMonSection(etype: string, rows: EncounterRow[]): string {
    const { list } = summarizeEncounterType(rows);
    const body = list.map(({ intName, chancePct, minLvl, maxLvl }) => {
        const mon = MON_BY_INTERNAL[intName];
        const name = mon?.name || intName;
        const link = mon ? monHref(mon) : "#";
        return `
      <tr class="rowlink">
        <td class="icon">${miniIconHTML(mon || intName)}</td>
        <td class="name"><a class="plain" href="${link}">${escapeHtml(name)}</a></td>
        <td class="lv">${fmtLv(minLvl, maxLvl)}</td>
        <td class="num">${chancePct}%</td>
      </tr>`;
    }).join("");

    return `
    <section class="panel" style="margin-top:12px;">
      <h2 style="margin:10px 12px 6px; font-size:14px; opacity:.8;">${escapeHtml(etype)}</h2>
      <table class="location-table">
        <thead>
          <tr><th></th><th>Pokémon</th><th>Levels</th><th>Chance</th></tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </section>`;
}
