export type ThemeMode = "light" | "dark";

export function resolveInitialTheme(): ThemeMode {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved as ThemeMode;
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "dark" : "light";
}

export function applyTheme(mode: ThemeMode) {
    document.documentElement.setAttribute("data-theme", mode === "dark" ? "dark" : "light");
    const btn = document.querySelector<HTMLButtonElement>("#theme-toggle");
    if (btn) btn.textContent = mode === "dark" ? "☀️" : "🌙";
}

export function initTheme() {
    let mode = resolveInitialTheme();
    applyTheme(mode);
    localStorage.setItem("theme", mode);

    // Toggle handler
    const btn = document.querySelector<HTMLButtonElement>("#theme-toggle");
    btn?.addEventListener("click", () => {
        mode = (document.documentElement.getAttribute("data-theme") === "dark") ? "light" : "dark";
        applyTheme(mode);
        localStorage.setItem("theme", mode);
    });

    // If user hasn't chosen manually, you could react to OS changes:
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", (e) => {
      if (!localStorage.getItem("theme")) { mode = e.matches ? "dark" : "light"; applyTheme(mode); }
    });
}