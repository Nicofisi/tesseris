// Polish UI texts for modes and board sizes.
export const MODE_NAMES = { '2d': '2D', '3d': '3D', '4d': '4D', '5d': '5D' };

export const MODE_INFO = {
  '2d': { name: 'Klasyk', desc: 'Stary dobry tetris, 10 × 20. Rozgrzewka.' },
  '3d': { name: 'Studnia', desc: 'Klocki z sześcianów. Zapełnij całą warstwę podłogi.' },
  '4d': { name: 'Hiperstudnia', desc: 'Kilka studni obok siebie to jedna przestrzeń 4D.' },
  '5d': { name: 'Szaleństwo', desc: 'Siatka studni. Raczej dla beki niż dla wyniku.', tag: 'dla beki' },
};

const PRESETS = {
  '2d': { classic: '10 × 20' },
  '3d': { cozy: 'mała 4 × 4', classic: 'zwykła 5 × 5', big: 'duża 7 × 7', ten: 'ogromna 10 × 10' },
  '4d': { four: '4 studnie 4 × 4', six: '6 studni 4 × 4', ten: '10 studni 4 × 4' },
  '5d': { three: '3 × 3 studnie 3 × 3', four: '4 × 4 studnie 3 × 3', hundred: '10 × 10 = 100 studni' },
};

export function presetLabel(modeId, presetId) {
  return PRESETS[modeId]?.[presetId] ?? presetId;
}

export function presetList(modeId) {
  return Object.entries(PRESETS[modeId]).map(([id, label]) => ({ id, label }));
}

export function categoryLabel({ modeId, presetId, gameMode, clearRule }) {
  const parts = [MODE_NAMES[modeId], presetLabel(modeId, presetId), gameMode === 'timed' ? '3 min' : 'maraton'];
  if ((modeId === '4d' || modeId === '5d') && clearRule === 'all') parts.push('hardkor');
  return parts.join(' · ');
}
