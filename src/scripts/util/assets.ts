import { _asMon, ABIL, abilityName, moveDisplayName, movesIndex, typeData, getGameId } from "../core/data";
import { Mon } from "../core/types";
import { typeCandidates } from "./typing";
import { escapeAttr } from "./fmt";

const BASE = (import.meta as any).env?.BASE_URL || '/';
// Resolve under Vite's base (works in dev and on GH Pages)
export const assetUrl = (rel: string) => `${BASE}${rel.replace(/^\/+/, '')}`;

// Mini sprite (left 64px of a 128×64 sheet) — suggestions dropdown
export function miniIconHTML(monOrName: Mon | string) {
  const p = _asMon(monOrName);
  const urls = iconCandidates(p);

  // tiny helpers
  const esc = (s: string) =>
    String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const name = String(p.id ?? "").trim();
  const href = `#/mon/${encodeURIComponent(name)}`.toLowerCase();

  const all = urls.join("|").replace(/"/g, "&quot;");

  return `<a class="suggest-icon-link" href="${href}" aria-label="${esc(name)}" title="${esc(name)}">
    <img class="suggest-icon"
         src="${urls[0]}"
         data-srcs="${all}"
         data-si="0"
         alt="${esc(name)}"
         loading="lazy"
         onerror="(function(el){
           var a=(el.getAttribute('data-srcs')||'').split('|');
           var i=+el.getAttribute('data-si')||0; i++;
           if(i<a.length){el.setAttribute('data-si',i); el.src=a[i];}
           else{el.style.display='none';}
         })(this)">
  </a>`;
}


// Convenience wrapper identical to miniIconHTML (link + icon)
export function miniIconLinkHTML(monOrName: Mon | string) {
    return miniIconHTML(monOrName);
}

export function smallTypeIcons(types: string[]){
    return `<span class="suggest-typeicons">${types.map(t => typeIconTag(t).replace('class="type-icon"', 'class="type-icon"')).join('')}</span>`;
}

export function moveSmallIcon(moveId: string){
    const mv = movesIndex?.[moveId];
    if (!mv) return '';
    // prefer type icon; could also show category badge if you prefer
    return mv.type ? typeIconTag(mv.type).replace('class="type-icon"', 'class="type-icon" style="width:18px;height:18px"') : '';
}

export function typeIconTag(typeId: string) {
    const srcs = typeCandidates(typeId);
    const title = typeData[typeId]?.name || typeId;
    return `<img class="type-icon"
               src="${srcs[0]}" data-srcs="${srcs.join("|")}" data-idx="0"
               alt="${typeId}" title="${title}" loading="lazy" decoding="async">`;
}

export function iconRow(list: string[]) {
    if (!list.length) return "";
    return `<span class="tip-icons">${list.map(typeLinkIconTag).join("")}</span>`;
}

// ── Category icon helpers (PHYSICAL / SPECIAL / STATUS) ────────────────
export function categoryIconCandidates(catRaw: string | undefined): string[] {
    const base = `${BASE}images/categories/`;
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
export function categoryIconTag(catRaw: string | undefined) {
    if (!catRaw) return "";
    const srcs = categoryIconCandidates(catRaw);
    const alt = String(catRaw);
    return `<img class="cat-icon"
               src="${srcs[0]}" data-srcs="${srcs.join("|")}" data-idx="0"
               alt="${alt}" title="${alt}" loading="lazy" decoding="async">`;
}

// escapeAttr moved to util/fmt

export function abilityLinkHTML(id?: string | null, opts?: { hidden?: boolean }) {
    if (!id) return "";
    const name = abilityName(id);
    const tip  = ABIL[id]?.description ? ` data-tip="${escapeAttr(ABIL[id].description!)}"` : "";
    const a = `<a href="#/ability/${encodeURIComponent(id)}" class="abil-link"${tip}>${name}</a>`;
    return opts?.hidden ? `<em>${a}</em>` : a;
}

export function moveLinkHTML(moveId: string) {
    const name = moveDisplayName(moveId);
    return `<a href="#/move/${encodeURIComponent(moveId)}" class="move-link" data-move="${moveId}" title="${name}">${name}</a>`;
}


export function formatAbilities(abilities: string[], hidden?: string): string {
    const parts: string[] = [];
    if (abilities?.[0]) parts.push(abilityLinkHTML(abilities[0]));
    if (abilities?.[1]) parts.push(abilityLinkHTML(abilities[1]));
    if (hidden) parts.push(abilityLinkHTML(hidden, { hidden: true }));
    return parts.length ? parts.join(" | ") : "—";
}

export const locHref = (id: string) => `#/loc/${encodeURIComponent(id)}`;
export const monHref = (m: Mon) => `#/mon/${encodeURIComponent(m.id)}`;

export function frontCandidates(p: Mon): string[] {
    const base = `${BASE}images/${getGameId()}/front/`;
    const names = [p.internalName, p.internalName.toLowerCase(), p.id, p.id.toUpperCase()];
    return buildCandidates(base, names);
}

export function iconUrl(internalName: string): string {
    // public/images/icons/<InternalName>.png
    // document.baseURI keeps it working at /PBSDex/ in prod and / in dev
    return `${BASE}images/${getGameId()}/icons/${encodeURIComponent(internalName)}.png`;
}

export function iconCandidates(p: Mon): string[] {
    const base = `${BASE}images/${getGameId()}/icons/`;
    const names = [p.internalName, p.internalName.toLowerCase(), p.id, p.id.toUpperCase()];
    return buildCandidates(base, names);
}

export function typeLinkIconTag(t: string) {
    return `<a href="#/type/${encodeURIComponent(t)}" class="type-link" data-type="${t}">${typeIconTag(t)}</a>`;
}

export function typingIconsLinkedHTML(types: string[]) {
    return `<span class="type-icons">${types.map(typeLinkIconTag).join("")}</span>`;
}

export function miniIcon64(monOrName: Mon | string) {
    const p = _asMon(monOrName);
    const urls = iconCandidates(p);
    const all = urls.join("|").replace(/"/g, "&quot;");
    return `<img class="evo-mini"
               src="${urls[0]}"
               data-srcs="${all}"
               data-si="0"
               alt=""
               loading="lazy"
               style="width:64px;height:64px;object-fit:cover;object-position:left center;image-rendering:pixelated;border-radius:8px;"
               onerror="(function(el){
                 var a=(el.getAttribute('data-srcs')||'').split('|');
                 var i=+el.getAttribute('data-si')||0; i++;
                 if(i<a.length){el.setAttribute('data-si',i); el.src=a[i];}
                 else{el.style.display='none';}
               })(this)">`;
}

// Shared URL candidate builder
function buildCandidates(base: string, names: string[], exts: string[] = ["png", "PNG"]): string[] {
    const seen = new Set<string>();
    const urls: string[] = [];
    for (const n of names) for (const ext of exts) {
        const u = base + encodeURIComponent(n) + "." + ext;
        if (!seen.has(u)) { urls.push(u); seen.add(u); }
    }
    return urls;
}
