import { start } from './app';
import { hideTooltip } from './ui/tooltip';

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
