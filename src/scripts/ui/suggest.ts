import { ALL_POKEMON, movesIndex, ABIL, typeData, LOCS } from "../core/data";
import { navigateToMon } from "../core/router";
import { SuggestItem } from "../core/types";
import { miniIconHTML, moveSmallIcon, typeIconTag } from "../util/assets";
import { escapeHtml } from "../util/fmt";

export let SEARCH_INDEX: SuggestItem[] = [];

export const escapeHTML = escapeHtml;

export function highlight(label:string, q:string){
    if (!q) return escapeHTML(label);
    const i = label.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return escapeHTML(label);
    return escapeHTML(label.slice(0,i)) + '<mark>' + escapeHTML(label.slice(i, i+q.length)) + '</mark>' + escapeHTML(label.slice(i+q.length));
}

export function scoreMatch(label:string, q:string){
    const L = label.toLowerCase(), Q = q.toLowerCase();
    const i = L.indexOf(Q);
    if (i < 0) return -1;
    // startsWith gets a big boost; earlier position better; shorter label slightly better
    return 1000 - i*2 - Math.max(0, L.length - Q.length);
}

export function buildSearchIndex(){
    const out: SuggestItem[] = [];

    // Pokémon
    for (const p of ALL_POKEMON){
        out.push({
            kind: 'mon',
            id: p.id,                          // hash route uses slug id
            label: p.name,
            sub: p.types?.join(' • ') || '',
            iconHTML: miniIconHTML(p.internalName),
            search: makeSearchKey(p.name)
        });
    }

    // Moves
    for (const [mid, mv] of Object.entries(movesIndex || {})){
        out.push({
            kind:'move',
            id: mid,
            label: mv.name || mid,
            sub: (mv.type || mv.category) ? [mv.type, mv.category].filter(Boolean).join(' • ') : '',
            iconHTML: moveSmallIcon(mid),
            search: makeSearchKey(mv.name || mid),
        });
    }

    // Abilities
    for (const [aid, a] of Object.entries(ABIL || {})){
        out.push({
            kind:'ability',
            id: aid,
            label: a.name || aid,
            sub: a.description || '',
            search: makeSearchKey(a.name || aid),
        });
    }

    // Types
    for (const tid of Object.keys(typeData || {})){
        out.push({
            kind:'type',
            id: tid,
            label: typeData[tid]?.name || tid,
            iconHTML: typeIconTag(tid).replace('class="type-icon"', 'class="type-icon" style="width:18px;height:18px"'),
            search: typeData[tid]?.name || tid,
        });
    }

    // Locations
    for (const [lid, loc] of Object.entries(LOCS || {})) {
        const name = (loc?.name || `#${lid}`).trim();
        out.push({
            kind: 'loc',
            id: lid,
            label: name,
            sub: Object.keys(loc?.encounters || {}).join(', '), // e.g., "Land, Water"
            iconHTML: `<span class="suggest-pin" aria-hidden="true">📍</span>`,
            search: makeSearchKey(name),
        });
    }

    SEARCH_INDEX = out;
}

export function ensureSuggestBox(){
    let box = document.getElementById('search-suggest');
    if (!box){
        box = document.createElement('div');
        box.id = 'search-suggest';
        box.innerHTML = `<ul id="search-suggest-list" class="suggest-list" role="listbox"></ul>`;
        document.querySelector('.controls')?.appendChild(box);
    }
    return box as HTMLDivElement;
}

export function positionSuggestBox(){
    const input = document.querySelector<HTMLInputElement>('#q');
    const box = document.getElementById('search-suggest') as HTMLDivElement | null;
    if (!input || !box) return;
    const r = input.getBoundingClientRect();
    box.style.top = `${r.bottom + 6}px`;   // 6px gap below input
    box.style.left = `${r.left}px`;
    box.style.width = `${r.width}px`;
}

export function navigateFromSuggestion(s: SuggestItem){
    if (s.kind === 'mon')      navigateToMon(s.id);
    else if (s.kind === 'ability') location.hash = `#/ability/${encodeURIComponent(s.id)}`;
    else if (s.kind === 'move')    location.hash = `#/move/${encodeURIComponent(s.id)}`;
    else if (s.kind === 'type')    location.hash = `#/type/${encodeURIComponent(s.id)}`;
    else if (s.kind === 'loc')     location.hash = `#/loc/${encodeURIComponent(s.id)}`;
}

export function renderSuggestions(q: string){
    const nq = makeSearchKey(q);
    const box = ensureSuggestBox();
    const ul  = box.querySelector('.suggest-list') as HTMLUListElement;

    if (!nq || !nq.trim()){
        box.style.display = 'none';
        ul.innerHTML = '';
        return;
    }

    // score & pick top N (score against normalized label)
    const scored: SuggestItem[] = [];
    for (const it of SEARCH_INDEX){
        const hay = (it as any).search || makeSearchKey(it.label);   // ← normalized
        const s   = scoreMatch(hay, nq);                              // ← use normalized haystack
        if (s >= 0) scored.push({ ...it, score: s } as any);
    }

    // prefer Pokémon > Moves > Abilities > Types > Locations on ties
    const kindOrder: Record<string, number> = { mon:0, move:1, ability:2, type:3, loc:4, location:4 };
    scored.sort((a:any,b:any)=>
        (b.score - a.score) ||
        ((kindOrder[a.kind] ?? 999) - (kindOrder[b.kind] ?? 999)) ||
        a.label.localeCompare(b.label)
    );

    const top = scored.slice(0, 12);

    ul.innerHTML = top.map((s:any, idx:number) => `
    <li class="suggest-item" role="option" data-kind="${s.kind}" data-id="${escapeHTML(s.id)}" data-idx="${idx}">
      ${s.iconHTML || ''}
      <div class="suggest-main">
        <div class="suggest-label">${highlight(s.label, q)}</div>
        ${s.sub ? `<div class="suggest-sub">${escapeHTML(s.sub)}</div>` : ``}
      </div>
      <div class="suggest-kind">${s.kind}</div>
    </li>
  `).join('');

    // click
    ul.querySelectorAll<HTMLLIElement>('.suggest-item').forEach(li => {
        li.addEventListener('click', () => {
            const idx = Number(li.dataset.idx);
            const chosen = top[idx];
            if (chosen) {
                navigateFromSuggestion(chosen);
                hideSuggestions();
            }
        });
    });

    // inside renderSuggestions()
    const hasResults = top.length > 0;
    (document.querySelector('#q') as HTMLInputElement)?.setAttribute('aria-expanded', String(hasResults));


    // show & position
    box.style.display = top.length ? 'block' : 'none';
    positionSuggestBox();
}

export function hideSuggestions(){
    const box = document.getElementById('search-suggest') as HTMLDivElement | null;
    if (box){
        box.style.display = 'none';
        const ul = box.querySelector('.suggest-list') as HTMLUListElement | null;
        if (ul) ul.innerHTML = '';
    }
}

// tiny debounce so we don't recompute on every keystroke
export function debounce<T extends (...args:any[]) => void>(fn: T, wait = 120){
    let t: number | undefined;
    return (...args: Parameters<T>) => {
        if (t) window.clearTimeout(t);
        t = window.setTimeout(() => fn(...args), wait);
    };
}

export function wireSearchSuggest(){
    const input = document.querySelector<HTMLInputElement>('#q');
    if (!input) return;

    // Kill native suggestions/autofill
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('spellcheck', 'false');

    // ARIA combobox semantics (optional but nice)
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', 'search-suggest-list'); // make sure your UL uses this id
    // Some Chrome builds still show history unless name is “unfamiliar”
    if (!input.name) input.name = 'site-search-' + Math.random().toString(36).slice(2);

    let activeIndex = -1;

    const getListEl = () =>
        document.querySelector('#search-suggest .suggest-list') as HTMLUListElement | null;

    const getItems = () => {
        const ul = getListEl();
        return ul ? Array.from(ul.querySelectorAll<HTMLLIElement>('.suggest-item')) : [];
    };

    const setActive = (i:number) => {
        const ul = getListEl();
        if (!ul) return;
        const items = getItems();
        items.forEach(el => el.classList.remove('active'));
        if (i >= 0 && i < items.length){
            items[i].classList.add('active');
            (items[i] as HTMLElement).scrollIntoView({ block: 'nearest' });
        }
        activeIndex = i;
    };

    const debouncedRender = debounce((val:string) => {
        renderSuggestions(val);    // renders dropdown only (main table stays untouched)
        setActive(-1);
        positionSuggestBox();
    }, 120);

    // show suggestions as you type
    input.addEventListener('input', () => {
        debouncedRender(input.value);
    });

    // also show when focusing an already-typed query
    input.addEventListener('focus', () => {
        if (input.value.trim()){
            renderSuggestions(input.value);
            setActive(-1);
            positionSuggestBox();
        }
    });

    // keyboard navigation
    input.addEventListener('keydown', (e) => {
        const items = getItems();
        if (e.key === 'ArrowDown'){
            e.preventDefault(); e.stopPropagation();
            if (!items.length) return;
            setActive((activeIndex + 1) % items.length);
        } else if (e.key === 'ArrowUp'){
            e.preventDefault(); e.stopPropagation();
            if (!items.length) return;
            setActive((activeIndex - 1 + items.length) % items.length);
        } else if (e.key === 'Enter'){
            const box = document.getElementById('search-suggest');
            if (box && box.style.display !== 'none' && items.length){
                e.preventDefault(); e.stopPropagation();
                const pick = items[activeIndex >= 0 ? activeIndex : 0];
                pick?.click();   // navigateFromSuggestion() is wired in renderSuggestions()
            }
        } else if (e.key === 'Escape'){
            hideSuggestions();
        }
    });

    // hide when clicking elsewhere
    document.addEventListener('click', (e) => {
        const box = document.getElementById('search-suggest');
        if (!box) return;
        if (e.target === input || box.contains(e.target as Node)) return;
        hideSuggestions();
    }, { capture: true });

    window.addEventListener('resize', positionSuggestBox);
    window.addEventListener('scroll', positionSuggestBox, { passive: true });
    window.addEventListener('hashchange', hideSuggestions);
}

export function makeSearchKey(s: string): string {
    if (!s) return "";
    s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // strip accents
    s = s.replace(/[-–—]/g, " ");                           // hyphens to spaces
    const lower = s.toLowerCase();

    // replace roman numerals (standalone tokens) with digits
    const romanized = lower.replace(/\b[mcdlxvi]+\b/gi, (t) => {
        const n = romanToInt(t);
        return n ? String(n) : t.toLowerCase();
    });

    // replace number words up to 99 (handles "twenty one", "twenty-one", "sixteen")
    return wordsToDigits(romanized).replace(/\s+/g, " ").trim();
}

function romanToInt(str: string): number {
    const map: Record<string, number> = {i:1,v:5,x:10,l:50,c:100,d:500,m:1000};
    let n = 0, prev = 0;
    for (let i = str.length - 1; i >= 0; i--) {
        const v = map[str[i].toLowerCase()] || 0;
        n += v < prev ? -v : v;
        prev = v;
    }
    return n;
}

function wordsToDigits(s: string): string {
    const ones: Record<string, number> = {
        zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9,
        ten:10, eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16, seventeen:17, eighteen:18, nineteen:19
    };
    const tens: Record<string, number> = {
        twenty:20, thirty:30, forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90
    };

    const tok = s.split(/\s+/);
    const out: string[] = [];
    for (let i = 0; i < tok.length; i++) {
        const t = tok[i];
        if (t in ones) { out.push(String(ones[t])); continue; }

        if (t in tens) {
            let val = tens[t];
            const next = tok[i+1] || "";
            if (next in ones) { val += ones[next]; i++; }
            out.push(String(val));
            continue;
        }

        // handle hyphenated tens-ones like "twenty-one"
        const m = t.match(/^([a-z]+)-([a-z]+)$/i);
        if (m && (m[1].toLowerCase() in tens) && (m[2].toLowerCase() in ones)) {
            out.push(String(tens[m[1].toLowerCase()] + ones[m[2].toLowerCase()]));
            continue;
        }

        out.push(t);
    }
    return out.join(" ");
}
