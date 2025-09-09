interface GameInfo { id: string; name: string }

const BASE = (import.meta as any).env?.BASE_URL || '/';
async function init() {
  try {
    const res = await fetch(`${BASE}data/games.json`, { cache: 'no-cache' });
    if (!res.ok) return;
    const games: GameInfo[] = await res.json();
    const list = document.querySelector<HTMLUListElement>('#games');
    if (!list) return;
    for (const g of games) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `dex.html?game=${encodeURIComponent(g.id)}`;
      a.textContent = g.name;
      li.appendChild(a);
      list.appendChild(li);
    }
  } catch (err) {
    console.error('Failed to load games', err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  void init();
}
