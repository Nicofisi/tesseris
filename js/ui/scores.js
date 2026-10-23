// Local leaderboard in localStorage: one list per mode + board size + game type + clear rule.
const KEY = 'tesseris.scores.v1';
const PLAYERS = 'tesseris.players.v1';
const SETTINGS = 'tesseris.settings.v1';

function read(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode: scores just don't persist */
  }
}

export function categoryOf({ modeId, presetId, gameMode, clearRule }) {
  return [modeId, presetId, gameMode, modeId === '4d' || modeId === '5d' ? clearRule : 'well'].join('|');
}

export function allScores() {
  return read(KEY, []);
}

export function topScores(category, n = 10) {
  return allScores()
    .filter((s) => s.cat === category)
    .sort((a, b) => b.score - a.score || a.date - b.date)
    .slice(0, n);
}

// Saves a result and returns { entry, rank } (rank from 1).
export function saveScore(entry) {
  const list = allScores();
  const e = { ...entry, id: Math.random().toString(36).slice(2), date: Date.now() };
  list.push(e);
  // Keep the file small: the best 30 per category.
  const byCat = new Map();
  for (const s of list) {
    if (!byCat.has(s.cat)) byCat.set(s.cat, []);
    byCat.get(s.cat).push(s);
  }
  const kept = [];
  for (const arr of byCat.values()) kept.push(...arr.sort((a, b) => b.score - a.score).slice(0, 30));
  write(KEY, kept);
  const ranked = kept.filter((s) => s.cat === e.cat).sort((a, b) => b.score - a.score || a.date - b.date);
  return { entry: e, rank: ranked.findIndex((s) => s.id === e.id) + 1 };
}

export function wouldRank(category, score) {
  const top = topScores(category, 10);
  return score > 0 && (top.length < 10 || score > top[top.length - 1].score);
}

// The best result of every category that has one, as [{ cat, entry }].
export function records() {
  const best = new Map();
  for (const s of allScores()) {
    const cur = best.get(s.cat);
    if (!cur || s.score > cur.score) best.set(s.cat, s);
  }
  return [...best.entries()].map(([cat, entry]) => ({ cat, entry }));
}

export function parseCategory(cat) {
  const [modeId, presetId, gameMode, clearRule] = cat.split('|');
  return { modeId, presetId, gameMode, clearRule };
}

export function bestFor(category) {
  return topScores(category, 1)[0] ?? null;
}

export function players() {
  return read(PLAYERS, []);
}
export function rememberPlayer(name) {
  const list = players().filter((p) => p.toLowerCase() !== name.toLowerCase());
  list.unshift(name);
  write(PLAYERS, list.slice(0, 24));
}
export function forgetPlayer(name) {
  write(PLAYERS, players().filter((p) => p !== name));
}

export function clearScores() {
  write(KEY, []);
}

export function loadSettings() {
  return {
    music: 0.6, sfx: 0.8, ghost: true, beams: true, quality: 'auto',
    ...read(SETTINGS, {}),
  };
}
export function saveSettings(s) {
  write(SETTINGS, s);
}
