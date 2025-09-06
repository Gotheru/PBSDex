import { iconRow } from "../util/assets";
import { wireFallbacks } from "../util/dom";
import { combineDefense } from "../util/typing";

export function typeMatchupTooltipHTML(types: string[]) {
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

export function ensureTooltip(): HTMLElement {
    let el = document.getElementById("tooltip");
    if (!el) {
        el = document.createElement("div");
        el.id = "tooltip";
        document.body.appendChild(el);
    }
    return el;
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

export function bindAbilityTooltips() {
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
export function hideTooltip() {
    const tip = document.getElementById("tooltip");
    if (tip) tip.classList.remove("show");
}



export function bindTypeTooltips() {
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