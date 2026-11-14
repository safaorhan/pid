// ---------- Editable text ----------
// Tagged before anything below rewrites the DOM, so the n-th editable element here is
// the n-th one in index.html as it sits on disk. editor.js relies on that to save.
const EDITABLE_SELECTOR = [
  '.slide h1', '.slide h2', '.slide h3', '.slide p', '.slide li', '.slide .kicker',
  '.slide .caption', '.slide .chip', '.slide .badge', '.slide button', '.slide svg text',
  '.slide script[type="text/x-python"]', '.slide aside.notes', '#sim-text [data-key]',
  '.slide .roadmap span', '.slide .slider label', '.slide .bar > span', '.slide .bar .mark span', '.slide .big',
].join(', ');

function editableElements(root) {
  const all = [...root.querySelectorAll(EDITABLE_SELECTOR)];
  const set = new Set(all);
  return all.filter(el => {
    if (el.matches('[data-out]')) return false;             // live readouts
    if (el.matches('svg text') && el.querySelector('tspan')) return false;
    for (let p = el.parentElement; p; p = p.parentElement) if (set.has(p)) return false;
    return true;
  });
}

function editableKind(el) {
  if (el.matches('script')) return 'code';
  if (el.closest('svg')) return 'text';
  return 'html';
}

function editableValue(el) {
  return editableKind(el) === 'html' ? el.innerHTML : el.textContent;
}

const EDITABLES = editableElements(document).map((el, i) => {
  el.dataset.eid = i;
  return { el, kind: editableKind(el), original: editableValue(el) };
});

// ---------- Deck: navigation, fragments, notes, scaling ----------
const Deck = (() => {
  const stage = document.getElementById('stage');
  const slides = [...document.querySelectorAll('.slide')];
  const notesEl = document.getElementById('notes');
  const progress = document.getElementById('progress');
  const counter = document.getElementById('counter');
  const hooks = new Map();   // slide -> [{start, stop}]
  let index = -1;
  let startedAt = null;

  function fit() {
    const s = Math.min(innerWidth / 1280, innerHeight / 720);
    stage.style.transform = `translate(-50%, -50%) scale(${s})`;
    document.dispatchEvent(new Event('deckresize'));
  }

  function frags(slide) { return [...slide.querySelectorAll('.frag')]; }

  function go(i, showAllFrags = false) {
    i = Math.max(0, Math.min(slides.length - 1, i));
    if (i !== index) {
      if (index >= 0) {
        slides[index].classList.remove('active');
        (hooks.get(slides[index]) || []).forEach(h => h.stop && h.stop());
      }
      index = i;
      const s = slides[index];
      s.classList.add('active');
      frags(s).forEach(f => f.classList.toggle('shown', showAllFrags));
      requestAnimationFrame(() => (hooks.get(s) || []).forEach(h => h.start && h.start()));
      history.replaceState(null, '', '#' + (index + 1));
    }
    progress.style.width = ((index + 1) / slides.length * 100) + '%';
    counter.textContent = `${index + 1} / ${slides.length}`;
    renderNotes();
  }

  function next() {
    if (startedAt === null) startedAt = Date.now();
    const hidden = frags(slides[index]).filter(f => !f.classList.contains('shown'));
    if (hidden.length) { hidden[0].classList.add('shown'); return; }
    go(index + 1);
  }

  function prev() {
    const shown = frags(slides[index]).filter(f => f.classList.contains('shown'));
    if (shown.length) { shown[shown.length - 1].classList.remove('shown'); return; }
    go(index - 1, true);
  }

  function renderNotes() {
    if (notesEl.hidden) return;
    const aside = slides[index].querySelector('aside.notes');
    notesEl.querySelector('.body').innerHTML = aside ? aside.innerHTML : '<p class="muted">Not yok.</p>';
    notesEl.querySelector('.where').textContent = `Slayt ${index + 1}/${slides.length}`;
  }

  setInterval(() => {
    if (notesEl.hidden) return;
    const t = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
    notesEl.querySelector('.timer').textContent =
      `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  }, 500);

  addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    switch (e.key) {
      case 'ArrowRight': case 'PageDown': case ' ': case 'Enter': e.preventDefault(); next(); break;
      case 'ArrowLeft': case 'PageUp': case 'Backspace': e.preventDefault(); prev(); break;
      case 'Home': go(0); break;
      case 'End': go(slides.length - 1, true); break;
      case 'f': case 'F':
        document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
        break;
      case 'n': case 'N': notesEl.hidden = !notesEl.hidden; renderNotes(); break;
      case 't': case 'T': startedAt = Date.now(); break;
    }
  });

  // Let the clicker work again right after a slider or button was used
  document.addEventListener('change', e => e.target.blur && e.target.blur());
  document.addEventListener('click', e => {
    if (document.body.classList.contains('editing')) return;
    if (e.target.closest('button')) e.target.closest('button').blur();
  });

  addEventListener('resize', fit);

  return {
    slides,
    // Run start/stop with the slide that contains `el`
    on(el, h) {
      const s = el.closest('.slide');
      if (!hooks.has(s)) hooks.set(s, []);
      hooks.get(s).push(h);
      if (s === slides[index]) h.start && h.start();
    },
    init() {
      fit();
      const n = parseInt(location.hash.slice(1), 10);
      go(Number.isFinite(n) ? n - 1 : 0, Number.isFinite(n));
    },
  };
})();

// ---------- Python syntax highlighting ----------
function highlightPython(src) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const re = /(#.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|\b(from|import|def|class|return|if|elif|else|while|for|in|not|and|or|True|False|None|async|await|global)\b|\b(self)\b|\b(\d+\.?\d*)\b|\b([A-Za-z_]\w*)(?=\()/gm;
  let out = '', last = 0, m;
  while ((m = re.exec(src))) {
    out += esc(src.slice(last, m.index));
    const cls = m[1] ? 'com' : m[2] ? 'str' : m[3] ? 'kw' : m[4] ? 'self' : m[5] ? 'num' : 'fn';
    out += `<span class="tok-${cls}">${esc(m[0])}</span>`;
    last = re.lastIndex;
  }
  return out + esc(src.slice(last));
}

function parseLines(spec) {
  const set = new Set();
  (spec || '').split(',').filter(Boolean).forEach(part => {
    const [a, b] = part.split('-').map(Number);
    for (let n = a; n <= (b || a); n++) set.add(n);
  });
  return set;
}

// <script type="text/x-python" data-new="3,5-7" data-dim="1-2" data-start="20">
document.querySelectorAll('script[type="text/x-python"]').forEach(s => {
  const src = s.textContent.replace(/^\n/, '').replace(/\s+$/, '');
  const fresh = parseLines(s.dataset.new), dim = parseLines(s.dataset.dim);
  const start = parseInt(s.dataset.start || '1', 10);
  const lines = highlightPython(src).split('\n');
  const pre = document.createElement('pre');
  pre.className = 'code ' + (s.dataset.class || '');
  pre.innerHTML = lines.map((l, k) => {
    const n = k + 1;
    const cls = ['ln', fresh.has(n) ? 'new' : '', dim.has(n) ? 'dim' : ''].join(' ').trim();
    return `<span class="${cls}" data-n="${start + k}"><span class="src">${l || ' '}</span></span>`;
  }).join('');
  if (s.dataset.eid) {
    pre.dataset.eid = s.dataset.eid;
    EDITABLES[s.dataset.eid].el = pre;
  }
  s.replaceWith(pre);
});

// ---------- LED matrix, the hub's 5x5 display ----------
const GLYPHS = {
  P: ['####.', '#...#', '####.', '#....', '#....'],
  I: ['.###.', '..#..', '..#..', '..#..', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '####.'],
  1: ['..#..', '.##..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '..##.', '.#...', '#####'],
  3: ['####.', '....#', '.###.', '....#', '####.'],
  4: ['#..#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '####.'],
  ' ': ['..', '..', '..', '..', '..'],
};

function ledColumns(text) {
  const cols = [];
  [...text].forEach(ch => {
    const g = GLYPHS[ch] || GLYPHS[' '];
    for (let c = 0; c < g[0].length; c++) cols.push(g.map(r => r[c] === '#'));
    cols.push([false, false, false, false, false]);
  });
  return cols;
}

document.querySelectorAll('.led').forEach(el => {
  el.innerHTML = '<span></span>'.repeat(25);
  const cells = [...el.children];
  const draw = cols => cells.forEach((c, k) => c.classList.toggle('on', !!(cols[k % 5] && cols[k % 5][Math.floor(k / 5)])));
  const text = el.dataset.text || '';
  if (el.dataset.scroll === undefined) { draw(ledColumns(text)); return; }
  // Scroll like hub.display.text()
  const cols = ledColumns(text + ' ');
  let offset = 0, timer = null;
  Deck.on(el, {
    start() { timer = setInterval(() => { draw([0, 1, 2, 3, 4].map(k => cols[(offset + k) % cols.length])); offset++; }, 140); },
    stop() { clearInterval(timer); },
  });
});

// ---------- Xbox controller drawing ----------
const PAD_SVG = `
<svg viewBox="0 0 400 270" class="pad">
  <rect class="part" data-part="lt" x="62" y="6" width="58" height="26" rx="9"/>
  <rect class="part" data-part="rt" x="280" y="6" width="58" height="26" rx="9"/>
  <rect class="part" data-part="lb" x="52" y="34" width="86" height="18" rx="9"/>
  <rect class="part" data-part="rb" x="262" y="34" width="86" height="18" rx="9"/>
  <path class="body" d="M70 52 H330 C372 52 392 96 398 150 C404 206 392 262 352 262 C318 262 306 222 284 204 H116 C94 222 82 262 48 262 C8 262 -4 206 2 150 C8 96 28 52 70 52 Z"/>
  <circle class="part" data-part="ls" cx="96" cy="112" r="28"/>
  <circle class="part" data-part="rs" cx="250" cy="176" r="28"/>
  <g class="part" data-part="dpad">
    <rect x="138" y="160" width="18" height="52" rx="3"/>
    <rect x="121" y="177" width="52" height="18" rx="3"/>
  </g>
  <circle class="part" data-part="y" cx="304" cy="88" r="14"/>
  <circle class="part" data-part="x" cx="278" cy="113" r="14"/>
  <circle class="part" data-part="b" cx="330" cy="113" r="14"/>
  <circle class="part" data-part="a" cx="304" cy="138" r="14"/>
  <circle cx="200" cy="96" r="14" fill="#2a3238" stroke="#4c5a63" stroke-width="2"/>
  <g font-family="ui-monospace,Menlo,monospace" font-size="13" font-weight="700" fill="#e9eef1" text-anchor="middle" pointer-events="none">
    <text x="304" y="93">Y</text><text x="278" y="118">X</text><text x="330" y="118">B</text><text x="304" y="143">A</text>
    <text x="91" y="24">LT</text><text x="309" y="24">RT</text><text x="95" y="47">LB</text><text x="305" y="47">RB</text>
  </g>
</svg>`;

document.querySelectorAll('[data-pad]').forEach(el => {
  el.innerHTML = PAD_SVG;
  (el.dataset.pad || '').split(',').filter(Boolean).forEach(spec => {
    const [part, color] = spec.split(':');
    const p = el.querySelector(`[data-part="${part}"]`);
    if (p) p.classList.add('hot', color || 'teal');
  });
});
