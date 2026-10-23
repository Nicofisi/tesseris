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

let toonGradient = null;
export function toonRamp() {
  if (toonGradient) return toonGradient;
  // Four soft steps: core shadow, shadow, lit, highlight.
  const data = new Uint8Array([90, 90, 90, 255, 150, 150, 150, 255, 215, 215, 215, 255, 255, 255, 255, 255]);
  toonGradient = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  toonGradient.minFilter = THREE.NearestFilter;
  toonGradient.magFilter = THREE.NearestFilter;
  toonGradient.generateMipmaps = false;
  toonGradient.needsUpdate = true;
  return toonGradient;
}

let blockGeo = null;
export function blockGeometry() {
  if (!blockGeo) blockGeo = new RoundedBoxGeometry(0.92, 0.92, 0.92, 3, 0.17);
  return blockGeo;
}

let edgeGeo = null;
export function ghostEdgesGeometry() {
  if (!edgeGeo) edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.94, 0.94, 0.94));
  return edgeGeo;
}

// Glossy candy blocks: physical material with clearcoat, tinted per instance.
export function blockMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.42,
    metalness: 0,
    clearcoat: 0.6,
    clearcoatRoughness: 0.35,
    sheen: 0.4,
    sheenColor: new THREE.Color('#ffe6f0'),
    sheenRoughness: 0.6,
  });
}
