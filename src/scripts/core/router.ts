import { renderAbilityDetail } from "../pages/ability";
import { renderLocationDetail } from "../pages/location";
import { renderMoveDetail } from "../pages/move";
import { renderTypeDetail } from "../pages/type";
import { renderDetail, renderTable } from "../ui/table";
import { scrollToTopNow } from "../util/dom";
import { Mon } from "./types";

export type Route = { kind: "list" } | { kind: "mon"; id: string } | { kind: "ability"; id: string };

export function parseHash(): {type:'list'|'mon'|'ability'|'move'|'type', id?:string} {
    const m = location.hash.match(/^#\/(mon|ability|move|type)\/(.+)$/);
    if (m) return { type: m[1] as any, id: decodeURIComponent(m[2]) };
    return { type: 'list' };
}

export function parseRoute(): { kind: 'mon'|'ability'|'move'|'type'|'loc'|'list'; id?: string } {
    const h = location.hash;
    let m = h.match(/^#\/mon\/(.+)$/);  if (m) return { kind:'mon',  id: decodeURIComponent(m[1]) };
    m = h.match(/^#\/ability\/(.+)$/);     if (m) return { kind:'ability', id: decodeURIComponent(m[1]) };
    m = h.match(/^#\/move\/(.+)$/);     if (m) return { kind:'move', id: decodeURIComponent(m[1]) };
    m = h.match(/^#\/type\/(.+)$/);     if (m) return { kind:'type', id: decodeURIComponent(m[1]) };
    m = h.match(/^#\/loc\/(.+)$/);      if (m) return { kind:'loc',  id: decodeURIComponent(m[1]) };
    return { kind:'list' };
}

export function navigateToAbility(id: string) {
    location.hash = `#/ability/${encodeURIComponent(id)}`;
}

export function hashToId(): string | null {
    const m = location.hash.match(/^#\/mon\/(.+)$/);
    return m ? decodeURIComponent(m[1]) : null;
}

export function navigateToMon(id: string) {
    location.hash = `#/mon/${encodeURIComponent(id)}`;
}

export function navigateToList() {
    location.hash = '';
    history.pushState("", document.title, window.location.pathname + window.location.search); // clear hash
    renderCurrent();
    scrollToTopNow();
}

export let NAV_STACK: string[] = [];
export let NAV_LOCK = false; // suppress push while we programmatically go back

export const currentRoute = () => (location.hash || "");

export function renderCurrent() {
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

export function navBack(){
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

export function setupNavStack(){
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

// Small helper to standardize the header back button across pages
export function setHeaderBack() {
    const count = document.querySelector<HTMLElement>("#count");
    if (!count) return;
    count.innerHTML = `<button class="header-back" aria-label="Back">← Back</button>`;
    count.querySelector<HTMLButtonElement>(".header-back")?.addEventListener("click", navBack);
}
