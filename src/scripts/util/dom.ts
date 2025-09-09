export function scrollToTopNow() {
    // Window/body scroll:
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    // The main content area (it’s scrollable via overflow:auto):
    const grid = document.getElementById('grid');
    if (grid) grid.scrollTop = 0;
}

export function wireFallbacks(root: HTMLElement, selector: string) {
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

export function wireIconFallbacks(root: HTMLElement) {
    // Thin wrapper for consistency
    wireFallbacks(root, "img.dex-icon");
}
