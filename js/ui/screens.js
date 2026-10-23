// Menus: title, pause, game over with name entry, leaderboard, help and settings.
import { MODES } from '../core/modes.js';
import { MODE_INFO, MODE_NAMES, presetList, presetLabel, categoryLabel } from './text.js';
import * as scores from './scores.js';

const root = () => document.getElementById('screens');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (n) => Number(n).toLocaleString('pl-PL');

function mount(html, cls = '') {
  const el = document.createElement('div');
  el.className = 'screen ' + cls;
  el.innerHTML = html;
  root().innerHTML = '';
  root().appendChild(el);
  return el;
}
export function clearScreens() {
  root().innerHTML = '';
  document.onkeydown = null;
}

function seg(name, options, value) {
  return `<div class="seg" data-seg="${name}">${options
    .map((o) => `<button data-v="${esc(o.id)}" class="${o.id === value ? 'sel' : ''}">${esc(o.label)}</button>`)
    .join('')}</div>`;
}
function bindSeg(el, name, onPick) {
  el.querySelector(`[data-seg="${name}"]`)?.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    onPick(b.dataset.v);
  });
}

// ---------------- title ----------------
export function showMenu(app) {
  const sel = app.selection;
  const render = () => {
    const mode = MODES[sel.modeId];
    if (!mode.presets.some((p) => p.id === sel.presets[sel.modeId])) sel.presets[sel.modeId] = mode.default;
    const presetId = sel.presets[sel.modeId];
    const best = scores.bestFor(scores.categoryOf({ ...sel, presetId }));
    const el = mount(`
      <div class="card">
        <h1 class="logo">${'Tesseris'.split('').map((ch, i) => `<span style="color:${['#ff6f91', '#ffa046', '#ffd166', '#7bdc5a', '#4fd8ee', '#5b8cff', '#b28dff', '#ff85d6'][i]};animation-delay:${i * 0.12}s">${ch}</span>`).join('')}</h1>
        <p class="tagline">przytulny tetris w dwóch, trzech, czterech i pięciu wymiarach</p>
        <div class="dims">
          ${Object.keys(MODES).map((id, i) => `
            <div class="dim-card ${id === sel.modeId ? 'sel' : ''}" data-mode="${id}">
              ${MODE_INFO[id].tag ? `<span class="tag">${MODE_INFO[id].tag}</span>` : ''}
              <div class="big">${MODE_NAMES[id]}</div>
              <div class="name">${MODE_INFO[id].name} <kbd>${i + 1}</kbd></div>
              <div class="desc">${MODE_INFO[id].desc}</div>
            </div>`).join('')}
        </div>
        <div class="row">
          ${presetList(sel.modeId).length > 1 ? `<span class="seg-label">Plansza</span>${seg('preset', presetList(sel.modeId), presetId)}` : ''}
        </div>
        <div class="row">
          <span class="seg-label">Gra</span>
          ${seg('game', [{ id: 'marathon', label: 'Maraton' }, { id: 'timed', label: 'Na czas · 3 min' }], sel.gameMode)}
          ${mode.dim >= 4 ? `<span class="seg-label">Czyszczenie</span>${seg('rule', [{ id: 'well', label: 'w każdej studni' }, { id: 'all', label: 'cała hiperwarstwa' }], sel.clearRule)}` : ''}
        </div>
        <div class="row" style="margin-top:22px">
          <button class="btn big" id="play">Graj!</button>
        </div>
        <p class="hint">${best ? `Rekord: <b>${fmt(best.score)}</b> (${esc(best.name)})` : 'Jeszcze nikt tu nie grał. Bądź pierwszy!'}</p>
        <div class="row">
          <button class="btn ghost small" id="scores">Ranking</button>
          <button class="btn ghost small" id="help">Jak grać</button>
          <button class="btn ghost small" id="settings">Ustawienia</button>
        </div>
      </div>`, 'menu');
    el.querySelectorAll('.dim-card').forEach((c) =>
      c.addEventListener('click', () => {
        sel.modeId = c.dataset.mode;
        app.sound.ui('select');
        app.saveSelection();
        render();
      }),
    );
    bindSeg(el, 'preset', (v) => {
      sel.presets[sel.modeId] = v;
      app.sound.ui('select');
      app.saveSelection();
      render();
    });
    bindSeg(el, 'game', (v) => {
      sel.gameMode = v;
      app.sound.ui('select');
      app.saveSelection();
      render();
    });
    bindSeg(el, 'rule', (v) => {
      sel.clearRule = v;
      app.sound.ui('select');
      app.saveSelection();
      render();
    });
    el.querySelector('#play').addEventListener('click', () => app.startGame());
    el.querySelector('#scores').addEventListener('click', () => showScores(app, { ...sel, presetId }));
    el.querySelector('#help').addEventListener('click', () => showHelp(app, () => showMenu(app)));
    el.querySelector('#settings').addEventListener('click', () => showSettings(app, () => showMenu(app)));
  };
  render();
  document.onkeydown = (e) => {
    if (e.target.tagName === 'INPUT') return;
    const ids = Object.keys(MODES);
    if (/^Digit[1-4]$/.test(e.code)) {
      sel.modeId = ids[Number(e.code.slice(5)) - 1];
      app.saveSelection();
      render();
    } else if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      app.startGame();
    }
  };
}

// ---------------- pause ----------------
export function showPause(app) {
  const el = mount(`
    <div class="card narrow">
      <h2>Pauza</h2>
      <p class="hint">Klocki grzecznie czekają.</p>
      <div class="row">
        <button class="btn mint" id="resume">Wróć do gry</button>
      </div>
      <div class="row">
        <button class="btn ghost small" id="restart">Od nowa</button>
        <button class="btn ghost small" id="help">Jak grać</button>
        <button class="btn ghost small" id="settings">Ustawienia</button>
        <button class="btn ghost small" id="menu">Menu</button>
      </div>
    </div>`, 'dim');
  el.querySelector('#resume').addEventListener('click', () => app.resume());
  el.querySelector('#restart').addEventListener('click', () => app.startGame());
  el.querySelector('#menu').addEventListener('click', () => app.toMenu());
  el.querySelector('#help').addEventListener('click', () => showHelp(app, () => showPause(app)));
  el.querySelector('#settings').addEventListener('click', () => showSettings(app, () => showPause(app)));
  document.onkeydown = null;
}

// ---------------- game over ----------------
export function showGameOver(app, result) {
  const cat = scores.categoryOf(result.cfg);
  const ranks = scores.wouldRank(cat, result.score);
  const known = scores.players();
  let chosen = known[0] ?? '';
  const title = result.reason === 'time' ? 'Koniec czasu!' : 'Koniec gry';
  const el = mount(`
    <div class="card narrow">
      <h2>${title}</h2>
      <div class="final">${fmt(result.score)}</div>
      <p class="final-sub">${categoryLabel(result.cfg)}<br>
        ${result.dim === 2 ? 'linie' : 'warstwy'}: <b>${result.lines}</b> · poziom: <b>${result.level}</b> · klocki: <b>${result.pieces}</b>
        ${result.stats.tetrises ? ` · ${result.dim === 2 ? 'tetrisy' : 'tesserisy'}: <b>${result.stats.tetrises}</b>` : ''}
        ${result.stats.hyper ? ` · hiper: <b>${result.stats.hyper}</b>` : ''}
      </p>
      ${result.score > 0 ? `
      <h3 style="text-align:center">${ranks ? 'Wchodzisz do rankingu! Kto grał?' : 'Kto grał?'}</h3>
      <div class="chips" id="chips">${known.slice(0, 12).map((n) => `<button class="chip ${n === chosen ? 'sel' : ''}" data-n="${esc(n)}">${esc(n)}</button>`).join('')}</div>
      <div class="row"><input class="name" id="name" maxlength="16" placeholder="Twoje imię" value="${esc(chosen)}" autocomplete="off"></div>
      <div class="row"><button class="btn mint" id="save">Zapisz wynik</button><button class="btn ghost small" id="skip">Nie zapisuj</button></div>
      ` : `<div class="row"><button class="btn" id="again">Jeszcze raz</button><button class="btn ghost small" id="menu">Menu</button></div>`}
    </div>`, 'dim');
  const input = el.querySelector('#name');
  const chips = el.querySelector('#chips');
  chips?.addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    chosen = b.dataset.n;
    input.value = chosen;
    chips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('sel', c === b));
  });
  input?.addEventListener('input', () => chips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('sel', c.dataset.n === input.value.trim())));
  const save = () => {
    const name = input.value.trim().slice(0, 16) || 'Anonim';
    scores.rememberPlayer(name);
    const { entry, rank } = scores.saveScore({
      cat, name, score: result.score, lines: result.lines, level: result.level, pieces: result.pieces, time: Math.round(result.time),
    });
    app.sound.ui('save');
    showScores(app, result.cfg, { highlight: entry.id, rank, afterGame: true });
  };
  el.querySelector('#save')?.addEventListener('click', save);
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') save();
    e.stopPropagation();
  });
  el.querySelector('#skip')?.addEventListener('click', () => showScores(app, result.cfg, { afterGame: true }));
  el.querySelector('#again')?.addEventListener('click', () => app.startGame());
  el.querySelector('#menu')?.addEventListener('click', () => app.toMenu());
  setTimeout(() => {
    input?.focus();
    input?.select();
  }, 300);
  document.onkeydown = null;
}

// ---------------- leaderboard ----------------
export function showScores(app, cfg, { highlight = null, rank = 0, afterGame = false } = {}) {
  const view = { modeId: cfg.modeId, presetId: cfg.presetId, gameMode: cfg.gameMode, clearRule: cfg.clearRule ?? 'well' };
  const render = () => {
    const cat = scores.categoryOf(view);
    const top = scores.topScores(cat, 10);
    const presets = presetList(view.modeId);
    if (!presets.some((p) => p.id === view.presetId)) view.presetId = MODES[view.modeId].default;
    const el = mount(`
      <div class="card">
        <h2>Ranking</h2>
        ${rank ? `<p class="hint" style="margin-top:-6px">${rank <= 10 ? `Miejsce <b>${rank}</b>!` : `Miejsce ${rank}. Prawie!`}</p>` : ''}
        <div class="row">${seg('mode', Object.keys(MODES).map((id) => ({ id, label: MODE_NAMES[id] })), view.modeId)}
          ${seg('game', [{ id: 'marathon', label: 'Maraton' }, { id: 'timed', label: '3 min' }], view.gameMode)}</div>
        <div class="row">${presets.length > 1 ? seg('preset', presets, view.presetId) : ''}
          ${MODES[view.modeId].dim >= 4 ? seg('rule', [{ id: 'well', label: 'zwykłe' }, { id: 'all', label: 'hardkor' }], view.clearRule) : ''}</div>
        ${top.length ? `
        <table class="scores" style="margin-top:14px">
          <tr><th>#</th><th>Gracz</th><th class="num">Wynik</th><th class="num">${view.modeId === '2d' ? 'Linie' : 'Warstwy'}</th><th class="num">Poziom</th><th class="num">Kiedy</th></tr>
          ${top.map((s, i) => `<tr class="${s.id === highlight ? 'me' : ''}">
            <td class="medal-${i + 1}">${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</td><td>${esc(s.name)}</td>
            <td class="num"><b>${fmt(s.score)}</b></td><td class="num">${s.lines}</td><td class="num">${s.level}</td>
            <td class="num">${new Date(s.date).toLocaleString('pl-PL', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}</td></tr>`).join('')}
        </table>` : `<p class="empty">Pusto. Pierwszy wynik będzie rekordem!</p>`}
        <div class="row" style="margin-top:18px">
          ${afterGame ? `<button class="btn" id="again">Jeszcze raz</button>` : ''}
          <button class="btn ${afterGame ? 'ghost small' : ''}" id="back">${afterGame ? 'Menu' : 'Wróć'}</button>
        </div>
      </div>`, afterGame ? 'dim' : '');
    bindSeg(el, 'mode', (v) => ((view.modeId = v), (view.presetId = MODES[v].default), render()));
    bindSeg(el, 'game', (v) => ((view.gameMode = v), render()));
    bindSeg(el, 'preset', (v) => ((view.presetId = v), render()));
    bindSeg(el, 'rule', (v) => ((view.clearRule = v), render()));
    el.querySelector('#again')?.addEventListener('click', () => app.startGame());
    el.querySelector('#back').addEventListener('click', () => app.toMenu());
  };
  render();
  document.onkeydown = (e) => {
    if (e.code === 'Escape') app.toMenu();
    if (afterGame && e.code === 'Enter') app.startGame();
  };
}

// ---------------- help ----------------
export function showHelp(app, back) {
  const el = mount(`
    <div class="card">
      <h2>Jak grać</h2>
      <div class="help-grid">
        <div>
          <h3>2D: klasyk</h3>
          <p>Zapełnij cały rząd, a zniknie. Cztery naraz to <b>Tetris</b>.</p>
          <p><kbd>←</kbd> <kbd>→</kbd> ruch, <kbd>↑</kbd> lub <kbd>X</kbd> obrót, <kbd>Z</kbd> w drugą stronę, <kbd>↓</kbd> szybciej, <kbd>Spacja</kbd> zrzut, <kbd>C</kbd> schowek.</p>
          <h3>3D: studnia</h3>
          <p>Patrzysz do studni z góry. Znika cała zapełniona <b>warstwa</b> podłogi. Przezroczysty klocek na dnie i jasne kolumny pokazują, gdzie spadnie klocek.</p>
          <p><kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> ruch (zawsze tak, jak widzisz na ekranie), <kbd>Q</kbd> <kbd>E</kbd> obrót wokół pionu, <kbd>W</kbd> <kbd>S</kbd> przechył od siebie i do siebie, <kbd>A</kbd> <kbd>D</kbd> przechył w lewo i w prawo, <kbd>F</kbd> szybciej, <kbd>Spacja</kbd> zrzut.</p>
          <p>Kamera: przeciągnij myszą, kółko przybliża, <kbd>Z</kbd> <kbd>X</kbd> obraca o 90°, <kbd>V</kbd> widok z góry.</p>
        </div>
        <div>
          <h3>4D: hiperstudnia</h3>
          <p>Studnie obok siebie to jedna przestrzeń: czwarty wymiar biegnie <b>między studniami</b>. Klocek może leżeć w kilku studniach naraz (świecą się wtedy ramki), a spada, gdy w <b>którejkolwiek</b> na coś trafi.</p>
          <p><kbd>⇧ Shift</kbd> + <kbd>←</kbd> <kbd>→</kbd> przenosi klocek do sąsiedniej studni. <kbd>⇧</kbd> + <kbd>A</kbd> <kbd>D</kbd> przewraca go w studnie obok, a <kbd>⇧</kbd> + <kbd>Q</kbd> <kbd>E</kbd> i <kbd>⇧</kbd> + <kbd>W</kbd> <kbd>S</kbd> obracają jego część w 4. wymiar.</p>
          <p>Warstwa znika w każdej studni osobno. Klocek przez kilka studni może wyczyścić kilka naraz: to <b>Hiper</b> i duży bonus. W trybie hardkor znika tylko warstwa pełna we wszystkich studniach.</p>
          <h3>5D: szaleństwo</h3>
          <p>Studnie tworzą siatkę: <kbd>⇧</kbd> + <kbd>↑</kbd> <kbd>↓</kbd> przenosi do studni wyżej i niżej, <kbd>⇧</kbd> + <kbd>W</kbd> <kbd>S</kbd> obraca w piąty wymiar. Powodzenia.</p>
          <h3>Punkty</h3>
          <p>Więcej linii naraz, combo (czyszczenie raz za razem), back-to-back i T-spiny dają więcej. Co kilka warstw rośnie poziom: klocki spadają szybciej, a niebo zmienia porę dnia.</p>
        </div>
      </div>
      <div class="row"><button class="btn" id="back">Wróć</button></div>
    </div>`, 'dim');
  el.querySelector('#back').addEventListener('click', back);
  document.onkeydown = (e) => e.code === 'Escape' && back();
}

// ---------------- settings ----------------
export function showSettings(app, back) {
  const s = app.settings;
  const el = mount(`
    <div class="card narrow">
      <h2>Ustawienia</h2>
      <div class="settings-row"><span>Muzyka</span><input type="range" id="music" min="0" max="1" step="0.05" value="${s.music}"></div>
      <div class="settings-row"><span>Dźwięki</span><input type="range" id="sfx" min="0" max="1" step="0.05" value="${s.sfx}"></div>
      <div class="settings-row"><span>Grafika</span>${seg('quality', [{ id: 'auto', label: 'auto' }, { id: 'high', label: 'ładna' }, { id: 'low', label: 'szybka' }], s.quality)}</div>
      <div class="settings-row"><span>Gracze na liście</span><span class="chips" id="pl">${scores.players().map((n) => `<button class="chip" data-n="${esc(n)}" title="Usuń">${esc(n)} ✕</button>`).join('') || '<span class="hint">nikogo</span>'}</span></div>
      <div class="settings-row"><span>Ranking</span><button class="btn ghost small" id="wipe">Wyczyść wszystkie wyniki</button></div>
      <div class="row"><button class="btn" id="back">Gotowe</button></div>
    </div>`, 'dim');
  const upd = () => {
    app.saveSettings();
    app.sound.setVolumes(s);
  };
  el.querySelector('#music').addEventListener('input', (e) => ((s.music = Number(e.target.value)), upd()));
  el.querySelector('#sfx').addEventListener('input', (e) => ((s.sfx = Number(e.target.value)), upd(), app.sound.ui('select')));
  bindSeg(el, 'quality', (v) => {
    s.quality = v;
    app.saveSettings();
    app.applyQuality();
    showSettings(app, back);
  });
  el.querySelector('#pl').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    scores.forgetPlayer(b.dataset.n);
    b.remove();
  });
  el.querySelector('#wipe').addEventListener('click', (e) => {
    if (e.target.dataset.sure) {
      scores.clearScores();
      e.target.textContent = 'Wyczyszczone';
      e.target.disabled = true;
    } else {
      e.target.dataset.sure = '1';
      e.target.textContent = 'Na pewno? Kliknij jeszcze raz';
    }
  });
  el.querySelector('#back').addEventListener('click', back);
  document.onkeydown = (e) => e.code === 'Escape' && back();
}

export { presetLabel };
