// Board sizes per dimension. A 3D layer has to be filled completely to clear, so floors stay
// small (a 10×10 floor is 100 cells, about 25 pieces per layer: offered, but as a marathon).
import { pieceSet } from './pieces.js';

const BUFFER = 5; // hidden rows above the rim where pieces spawn

export const MODES = {
  '2d': {
    dim: 2,
    presets: [{ id: 'classic', floor: [10], height: 20 }],
    default: 'classic',
  },
  '3d': {
    dim: 3,
    presets: [
      { id: 'cozy', floor: [4, 4], height: 12 },
      { id: 'classic', floor: [5, 5], height: 14 },
      { id: 'big', floor: [7, 7], height: 16 },
      { id: 'ten', floor: [10, 10], height: 20 },
    ],
    default: 'classic',
  },
  '4d': {
    dim: 4,
    presets: [
      { id: 'four', floor: [4, 4], wells: [4], height: 12 },
      { id: 'six', floor: [4, 4], wells: [6], height: 12 },
      { id: 'ten', floor: [4, 4], wells: [10], height: 12 },
    ],
    default: 'six',
  },
  '5d': {
    dim: 5,
    presets: [
      { id: 'three', floor: [3, 3], wells: [3, 3], height: 10 },
      { id: 'four', floor: [3, 3], wells: [4, 4], height: 10 },
      { id: 'hundred', floor: [3, 3], wells: [10, 10], height: 10 },
    ],
    default: 'three',
  },
};

export function modeConfig(modeId, presetId) {
  const mode = MODES[modeId];
  const preset = mode.presets.find((p) => p.id === presetId) ?? mode.presets.find((p) => p.id === mode.default);
  const { dim } = mode;
  const size = new Array(dim);
  size[0] = preset.floor[0];
  size[1] = preset.height + BUFFER;
  if (dim >= 3) size[2] = preset.floor[1];
  if (dim >= 4) size[3] = preset.wells[0];
  if (dim >= 5) size[4] = preset.wells[1];
  return {
    modeId,
    presetId: preset.id,
    dim,
    size,
    height: preset.height,
    pieces: pieceSet(dim),
    preview: dim === 2 ? 5 : 3,
    hyperSpawn: dim >= 4 ? 0.3 : 0,
  };
}
