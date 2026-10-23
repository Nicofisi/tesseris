// Shared geometry, materials and colours for the blocks.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Cozy, saturated candy palette (index = piece colour).
export const PALETTE = [
  '#4fd8ee', // aqua (I)
  '#ffd166', // butter (O)
  '#b28dff', // lavender (T)
  '#7bdc5a', // leaf (S)
  '#ff6f91', // strawberry (Z, mirrored screw)
  '#5b8cff', // cornflower (J, tricube)
  '#ffa046', // apricot (L)
  '#ff85d6', // bubblegum (tripod)
  '#2fd6a6', // mint (screw)
  '#c8ea5c', // lime (corner tricube)
].map((c) => new THREE.Color(c));

// Locked blocks in 3D+ are coloured by height, so the layers read like a contour map.
export const LAYER_PALETTE = [
  '#ff8fab', // rose
  '#ffa94d', // apricot
  '#ffd43b', // butter
  '#a9e34b', // lime
  '#51cf66', // leaf
  '#38d9a9', // mint
  '#3bc9db', // aqua
  '#4dabf7', // sky
  '#748ffc', // periwinkle
  '#b197fc', // lavender
  '#e599f7', // orchid
  '#f783ac', // pink
].map((c) => new THREE.Color(c));

let blockGeo = null;
export function blockGeometry() {
  if (!blockGeo) blockGeo = new RoundedBoxGeometry(0.92, 0.92, 0.92, 3, 0.17);
  return blockGeo;
}
