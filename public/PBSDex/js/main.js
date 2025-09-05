// src/scripts/main.ts
var toArray = (x) => {
  if (Array.isArray(x)) return x.filter(Boolean);
  if (typeof x === "string") return x.split(",").map((s) => s.trim()).filter(Boolean);
  if (x && typeof x === "object") return Object.values(x).map(String).filter(Boolean);
  return [];
};
var num = (x, d = 0) => {
  const n = typeof x === "number" ? x : parseInt(String(x), 10);
  return Number.isFinite(n) ? n : d;
};
var slugify = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
function normalizeEntry(e, idx) {
  const name = e.name ?? e.Name ?? e.internalName ?? e.InternalName ?? `Pokemon ${idx + 1}`;
  const id = e.id ?? (e.internalName ? slugify(e.internalName) : slugify(name) || `pokemon-${idx + 1}`);
  let types = [];
  if (Array.isArray(e.types)) types = e.types;
  else if (typeof e.types === "string") types = toArray(e.types);
  else if (e.type || e.Type) types = toArray(e.type || e.Type);
  else if (e.types && typeof e.types === "object") types = toArray(e.types);
  types = types.filter(Boolean);
  const s = e.stats || e.BaseStats || e.baseStats || {};
  const stats = {
    hp: num(s.hp ?? s.HP ?? s[0]),
    atk: num(s.atk ?? s.Atk ?? s[1]),
    def: num(s.def ?? s.Def ?? s[2]),
    spa: num(s.spa ?? s.SpA ?? s[3]),
    spd: num(s.spd ?? s.SpD ?? s[4]),
    spe: num(s.spe ?? s.Spe ?? s[5])
  };
  const abilities = toArray(e.abilities || e.Abilities);
  const hiddenAbility = (e.hiddenAbility ?? e.HiddenAbility) || void 0;
  return {
    id,
    internalName: e.internalName || e.InternalName || id,
    name,
    types,
    stats,
    abilities,
    hiddenAbility,
    summary: e.summary ?? e.pokedex ?? e.Pokedex ?? e.kind ?? "",
    moves: Array.isArray(e.moves) ? e.moves : []
  };
}
function bst(s) {
  return s.hp + s.atk + s.def + s.spa + s.spd + s.spe;
}
async function loadData() {
  const dataUrl = new URL("./data/pokemon.json", document.baseURI).toString();
  const res = await fetch(dataUrl, { cache: "no-cache" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${dataUrl}`);
  const data = await res.json();
  let raw = [];
  if (Array.isArray(data)) raw = data;
  else if (Array.isArray(data.pokemon)) raw = data.pokemon;
  else if (data && typeof data.pokemon === "object") raw = Object.values(data.pokemon);
  else if (data && typeof data === "object") raw = Object.values(data);
  console.log("Loaded dataset:", { url: dataUrl, count: raw.length, sample: raw[0] });
  return raw.map(normalizeEntry);
}
function measureWidths(pokemon) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
  const w = (s) => Math.ceil(ctx.measureText(s ?? "").width);
  const maxName = Math.max(...pokemon.map((p) => w(p.name)), w("Name"));
  const typeStrings = /* @__PURE__ */ new Set(["Type1", "Type2"]);
  pokemon.forEach((p) => p.types.forEach((t) => typeStrings.add(t)));
  const maxType = Math.max(...[...typeStrings].map(w));
  const abilityStrings = /* @__PURE__ */ new Set(["Ability1", "Ability2"]);
  pokemon.forEach((p) => p.abilities.forEach((a) => abilityStrings.add(a)));
  const maxAbility = Math.max(...[...abilityStrings].map(w));
  const hiddenStrings = /* @__PURE__ */ new Set(["Hidden Ability"]);
  pokemon.forEach((p) => {
    if (p.hiddenAbility) hiddenStrings.add(p.hiddenAbility);
  });
  const maxHidden = Math.max(...[...hiddenStrings].map(w));
  const bstStrings = /* @__PURE__ */ new Set(["BST"]);
  pokemon.forEach((p) => bstStrings.add(String(bst(p))));
  const maxBST = Math.max(...[...bstStrings].map(w));
  const statStrings = /* @__PURE__ */ new Set(["HP", "Atk", "Def", "SpA", "SpD", "Spe"]);
  pokemon.forEach((p) => {
    const s = p.stats;
    ["hp", "atk", "def", "spa", "spd", "spe"].forEach((k) => statStrings.add(String(s[k])));
  });
  const maxStat = Math.max(...[...statStrings].map(w));
  const fudge = 6;
  const cap = { name: 120, type: 70, ability: 95, hidden: 100, bst: 36, stat: 30 };
  return {
    name: Math.min(maxName + fudge, cap.name),
    type: Math.min(maxType + fudge, cap.type),
    ability: Math.min(maxAbility + fudge, cap.ability),
    hidden: Math.min(maxHidden + fudge, cap.hidden),
    bst: Math.min(maxBST + fudge, cap.bst),
    stat: Math.min(maxStat + fudge, cap.stat)
  };
}
function buildTableHTML(list) {
  return `
<table class="dex-table">
  <thead>
    <tr>
      <th>Name</th>
      <th>Type1</th>
      <th>Type2</th>
      <th>Ability1</th>
      <th>Ability2</th>
      <th>Hidden Ability</th>
      <th>BST</th>
      <th>HP</th>
      <th>Atk</th>
      <th>Def</th>
      <th>SpA</th>
      <th>SpD</th>
      <th>Spe</th>
    </tr>
  </thead>
  <tbody>
    ${list.map((p) => {
    const type1 = p.types[0] ?? "";
    const type2 = p.types[1] ?? "";
    const ability1 = p.abilities[0] ?? "";
    const ability2 = p.abilities[1] ?? "";
    const hidden = p.hiddenAbility ?? "";
    const sum = bst(p.stats);
    return `
      <tr class="rowlink" tabindex="0" data-id="${p.id}">
        <td title="${p.name}">${p.name}</td>
        <td title="${type1}">${type1}</td>
        <td title="${type2}">${type2}</td>
        <td title="${ability1}">${ability1}</td>
        <td title="${ability2}">${ability2}</td>
        <td title="${hidden}">${hidden}</td>
        <td>${sum}</td>
        <td>${p.stats.hp}</td>
        <td>${p.stats.atk}</td>
        <td>${p.stats.def}</td>
        <td>${p.stats.spa}</td>
        <td>${p.stats.spd}</td>
        <td>${p.stats.spe}</td>
      </tr>`;
  }).join("")}
  </tbody>
</table>`;
}
function buildFilters(pokemon) {
  const typeSel = document.querySelector("#type");
  if (!typeSel) return;
  typeSel.innerHTML = '<option value="">All types</option>';
  const typeSet = /* @__PURE__ */ new Set();
  pokemon.forEach((p) => p.types.forEach((t) => typeSet.add(t)));
  [...typeSet].sort().forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    typeSel.appendChild(opt);
  });
}
function renderTable(pokemon) {
  const grid = document.querySelector("#grid");
  const q = document.querySelector("#q");
  const typeSel = document.querySelector("#type");
  const sortSel = document.querySelector("#sort");
  const count = document.querySelector("#count");
  if (!grid || !q || !typeSel || !sortSel || !count) return;
  const query = q.value.trim().toLowerCase();
  const typeFilter = typeSel.value;
  const list = pokemon.filter((p) => {
    const inType = !typeFilter || p.types.includes(typeFilter);
    const hay = (p.name + " " + p.types.join(" ") + " " + (p.abilities || []).join(" ")).toLowerCase();
    return inType && (!query || hay.includes(query));
  }).sort((a, b) => {
    if (sortSel.value === "name") return a.name.localeCompare(b.name);
    if (sortSel.value === "bst") return bst(b.stats) - bst(a.stats);
    return 0;
  });
  count.textContent = `${list.length} result${list.length === 1 ? "" : "s"}`;
  grid.innerHTML = buildTableHTML(list);
  const table = grid.querySelector(".dex-table");
  if (table) {
    const allDataJson = grid.getAttribute("data-all-pokemon");
    if (allDataJson) {
      const allData = JSON.parse(allDataJson);
      const widths = measureWidths(allData);
      table.style.setProperty("--col-name", `${widths.name}px`);
      table.style.setProperty("--col-type", `${widths.type}px`);
      table.style.setProperty("--col-ability", `${widths.ability}px`);
      table.style.setProperty("--col-hidden", `${widths.hidden}px`);
      table.style.setProperty("--col-bst", `${widths.bst}px`);
      table.style.setProperty("--col-stat", `${widths.stat}px`);
    }
  }
}
function buildDetailHTML(p) {
  const type1 = p.types[0] ?? "";
  const type2 = p.types[1] ?? "";
  const ability1 = p.abilities[0] ?? "";
  const ability2 = p.abilities[1] ?? "";
  const hidden = p.hiddenAbility ?? "";
  return `
  <article class="detail">
    <button class="back" aria-label="Back to list">\u2190 Back</button>
    <h1 class="detail-name">${p.name}</h1>

    <section class="detail-block">
      <h2>Info</h2>
      <div class="kv">
        <div><span>Type1</span><strong>${type1 || "\u2014"}</strong></div>
        <div><span>Type2</span><strong>${type2 || "\u2014"}</strong></div>
        <div><span>Ability1</span><strong>${ability1 || "\u2014"}</strong></div>
        <div><span>Ability2</span><strong>${ability2 || "\u2014"}</strong></div>
        <div><span>Hidden Ability</span><strong>${hidden || "\u2014"}</strong></div>
      </div>
    </section>

    <section class="detail-block">
      <h2>Base Stats</h2>
      <table class="stats">
        <tbody>
          <tr><td>HP</td><td class="num">${p.stats.hp}</td></tr>
          <tr><td>Atk</td><td class="num">${p.stats.atk}</td></tr>
          <tr><td>Def</td><td class="num">${p.stats.def}</td></tr>
          <tr><td>SpA</td><td class="num">${p.stats.spa}</td></tr>
          <tr><td>SpD</td><td class="num">${p.stats.spd}</td></tr>
          <tr><td>Spe</td><td class="num">${p.stats.spe}</td></tr>
          <tr class="bst"><td>BST</td><td class="num">${bst(p.stats)}</td></tr>
        </tbody>
      </table>
    </section>
  </article>`;
}
function renderDetail(pokemon, id) {
  const grid = document.querySelector("#grid");
  const count = document.querySelector("#count");
  if (!grid || !count) return;
  const mon = pokemon.find((m) => m.id === id);
  if (!mon) {
    grid.innerHTML = `<div style="padding:16px;">Not found.</div>`;
    return;
  }
  count.textContent = "Details";
  grid.innerHTML = buildDetailHTML(mon);
  const backBtn = grid.querySelector(".back");
  backBtn?.addEventListener("click", () => navigateToList());
}
function hashToId() {
  const m = location.hash.match(/^#\/mon\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}
function navigateToMon(id) {
  location.hash = `#/mon/${encodeURIComponent(id)}`;
}
function navigateToList() {
  history.pushState("", document.title, window.location.pathname + window.location.search);
  renderCurrent();
}
function renderCurrent() {
  const grid = document.querySelector("#grid");
  if (!grid) return;
  const allDataJson = grid.getAttribute("data-all-pokemon");
  if (!allDataJson) return;
  const pokemon = JSON.parse(allDataJson);
  const id = hashToId();
  if (id) renderDetail(pokemon, id);
  else renderTable(pokemon);
}
async function start() {
  const pokemon = await loadData();
  buildFilters(pokemon);
  const grid = document.querySelector("#grid");
  if (grid) grid.setAttribute("data-all-pokemon", JSON.stringify(pokemon));
  const q = document.querySelector("#q");
  const typeSel = document.querySelector("#type");
  const sortSel = document.querySelector("#sort");
  const rerender = () => renderTable(pokemon);
  q?.addEventListener("input", rerender);
  typeSel?.addEventListener("change", rerender);
  sortSel?.addEventListener("change", rerender);
  grid?.addEventListener("click", (e) => {
    const tr = e.target.closest("tr.rowlink");
    if (tr?.dataset.id) navigateToMon(tr.dataset.id);
  });
  grid?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      const tr = e.target.closest("tr.rowlink");
      if (tr?.dataset.id) {
        e.preventDefault();
        navigateToMon(tr.dataset.id);
      }
    }
  });
  window.addEventListener("hashchange", renderCurrent);
  renderCurrent();
}
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void start(), { once: true });
  } else {
    void start();
  }
}
