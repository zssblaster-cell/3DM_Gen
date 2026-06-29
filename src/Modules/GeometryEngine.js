// ── GeometryEngine.js ─────────────────────────────────────────────────────────
// Builds a full triangle mesh BufferGeometry from a param object.
// Depends on: noise.js, bufferUtils.js

import { makeNoise }        from '../Dependencies/noise.js';
import { computeNormals }   from '../Dependencies/bufferUtils.js';

// Schema for all 11 geometry parameters
export const PARAM_SCHEMA = {
  baseShape:       { min: 0,   max: 5,    default: 0,    integer: true  }, // 0=sphere 1=cylinder 2=box 3=torus 4=cone 5=organic
  subdivisions:    { min: 16,  max: 96,   default: 64,   integer: true  },
  noiseScale:      { min: 0.1, max: 4.0,  default: 1.0,  integer: false },
  noiseAmplitude:  { min: 0.0, max: 0.6,  default: 0.15, integer: false },
  noiseOctaves:    { min: 1,   max: 6,    default: 4,    integer: true  },
  scaleX:          { min: 0.2, max: 3.0,  default: 1.0,  integer: false },
  scaleY:          { min: 0.2, max: 3.0,  default: 1.0,  integer: false },
  scaleZ:          { min: 0.2, max: 3.0,  default: 1.0,  integer: false },
  twist:           { min: 0.0, max: 6.28, default: 0.0,  integer: false },
  taper:           { min: 0.0, max: 2.0,  default: 1.0,  integer: false },
  ridges:          { min: 0,   max: 8,    default: 0,    integer: true  },
};

const SHAPE_NAMES = ['sphere','cylinder','box','torus','cone','organic'];

export function paramDefaults() {
  const out = {};
  for (const [k, v] of Object.entries(PARAM_SCHEMA)) out[k] = v.default;
  out.seed = 42;
  out.label = 'Generated Model';
  out.description = '';
  return out;
}

export function validateParams(params) {
  const out = { ...paramDefaults(), ...params };
  for (const [k, s] of Object.entries(PARAM_SCHEMA)) {
    let v = Number(out[k]);
    if (isNaN(v)) v = s.default;
    v = Math.max(s.min, Math.min(s.max, v));
    if (s.integer) v = Math.round(v);
    out[k] = v;
  }
  return out;
}

// Rescale a normalized [0,1] value to the param's real range
export function decodeParam(key, normalized) {
  const s = PARAM_SCHEMA[key];
  if (!s) return normalized;
  const v = s.min + normalized * (s.max - s.min);
  return s.integer ? Math.round(v) : v;
}

// Encode a real param value to [0,1]
export function encodeParam(key, value) {
  const s = PARAM_SCHEMA[key];
  if (!s) return value;
  return (value - s.min) / (s.max - s.min);
}

// Decode all 11 outputs from network prediction (Float32Array[11]) to ParamObject
export function decodeParams(normalized) {
  const keys = Object.keys(PARAM_SCHEMA);
  const out  = { seed: Math.floor(Math.random() * 9999) };
  for (let i = 0; i < keys.length; i++) {
    out[keys[i]] = decodeParam(keys[i], Math.max(0, Math.min(1, normalized[i])));
  }
  return out;
}

// Encode a ParamObject to Float32Array[11]
export function encodeParams(params) {
  const keys = Object.keys(PARAM_SCHEMA);
  const out  = new Float32Array(11);
  for (let i = 0; i < keys.length; i++) {
    out[i] = encodeParam(keys[i], params[keys[i]] ?? PARAM_SCHEMA[keys[i]].default);
  }
  return out;
}

// ── Core mesh builder ─────────────────────────────────────────────────────────

export function buildMesh(params) {
  const p = validateParams(params);
  const {
    baseShape: baseShapeIdx, subdivisions,
    noiseScale, noiseAmplitude, noiseOctaves,
    scaleX, scaleY, scaleZ,
    twist, taper, ridges, seed,
    frontProfile, sideProfile,
  } = p;

  const noise     = makeNoise(seed);
  const baseShape = SHAPE_NAMES[baseShapeIdx] || 'sphere';
  const U = subdivisions * 2;
  const V = subdivisions;

  const positions = [];
  const uvs       = [];

  for (let vi = 0; vi <= V; vi++) {
    const vv  = vi / V;
    const phi = vv * Math.PI;

    for (let ui = 0; ui <= U; ui++) {
      const uu    = ui / U;
      const theta = uu * Math.PI * 2;

      // Base unit sphere
      let x = Math.sin(phi) * Math.cos(theta);
      let y = Math.cos(phi);
      let z = Math.sin(phi) * Math.sin(theta);
      let r = 1;

      // Shape deformation
      if (baseShape === 'cylinder') {
        x = Math.cos(theta); z = Math.sin(theta);
      } else if (baseShape === 'cone') {
        r = 1 - (y * 0.5 + 0.5) * 0.85;
        x = Math.cos(theta) * r; z = Math.sin(theta) * r; r = 1;
      } else if (baseShape === 'torus') {
        const R = 1, rs = 0.38;
        x = (R + rs * Math.cos(phi)) * Math.cos(theta);
        y = rs * Math.sin(phi);
        z = (R + rs * Math.cos(phi)) * Math.sin(theta);
        r = 1;
      } else if (baseShape === 'box') {
        const mx = Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) || 1;
        x /= mx; y /= mx; z /= mx;
      } else if (baseShape === 'organic') {
        const w = 0.35;
        x += noise.fbm(x * 0.8, y * 0.8, z * 0.8, 2, 1.2, w);
        z += noise.fbm(z * 0.8, x * 0.8, y * 0.8, 2, 1.2, w);
      } else if (baseShape === 'revolution' && frontProfile && sideProfile) {
        const normY = y * 0.5 + 0.5;
        const fi = Math.floor(normY * (frontProfile.length - 1));
        const si = Math.min(fi + 1, frontProfile.length - 1);
        const t  = normY * (frontProfile.length - 1) - fi;
        const fR = frontProfile[fi] * (1 - t) + frontProfile[si] * t;
        const sR = sideProfile[fi]  * (1 - t) + sideProfile[si]  * t;
        x = Math.cos(theta) * fR;
        z = Math.sin(theta) * sR;
        r = 1;
      }

      // Taper
      if (baseShape !== 'torus' && taper !== 1) {
        const tf = 1 + (y * 0.5 + 0.5) * (taper - 1);
        x *= tf; z *= tf;
      }

      // Twist
      if (twist !== 0 && baseShape !== 'torus') {
        const angle = twist * (y * 0.5 + 0.5);
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const tx = x * cos - z * sin;
        const tz = x * sin + z * cos;
        x = tx; z = tz;
      }

      // Ridges
      if (ridges > 0) {
        r += Math.pow(Math.abs(Math.sin(theta * ridges)), 0.3) * 0.2;
      }

      // Noise displacement
      const disp = noise.fbm(x * noiseScale, y * noiseScale, z * noiseScale, noiseOctaves, 1, noiseAmplitude);
      x = (x * r + x * disp) * scaleX;
      y = (y * r + y * disp) * scaleY;
      z = (z * r + z * disp) * scaleZ;

      positions.push(x, y, z);
      uvs.push(uu, vv);
    }
  }

  // Triangle indices
  const indices = [];
  for (let vi = 0; vi < V; vi++) {
    for (let ui = 0; ui < U; ui++) {
      const a = vi * (U + 1) + ui;
      const b = a + 1;
      const c = a + (U + 1);
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const pos  = new Float32Array(positions);
  const idx  = new Uint32Array(indices);
  const norm = computeNormals(pos, idx);

  return { positions: pos, indices: idx, normals: norm, uvs: new Float32Array(uvs) };
}

// Apply tag-based param corrections for training targets
export function applyTagCorrections(params, tags, direction = 'positive') {
  const p = { ...params };

  const corrections = {
    // Positive tag corrections
    'surface_more_detail':    () => { p.noiseAmplitude = Math.min(0.6, p.noiseAmplitude * 1.3); p.noiseOctaves = Math.min(6, p.noiseOctaves + 1); p.noiseScale = Math.min(4, p.noiseScale * 1.2); },
    'surface_less_detail':    () => { p.noiseAmplitude = Math.max(0, p.noiseAmplitude * 0.7); p.noiseOctaves = Math.max(1, p.noiseOctaves - 1); },
    'surface_smoother':       () => { p.noiseAmplitude = Math.max(0, p.noiseAmplitude * 0.6); p.noiseScale = Math.max(0.1, p.noiseScale * 0.8); },
    'surface_sharper_ridges': () => { p.ridges = Math.min(8, p.ridges + 1); p.noiseAmplitude = Math.max(0, p.noiseAmplitude * 0.8); },
    'surface_softer_ridges':  () => { p.ridges = Math.max(0, p.ridges - 1); p.noiseAmplitude = Math.min(0.6, p.noiseAmplitude * 1.1); },
    'surface_organic':        () => { p.noiseOctaves = Math.min(6, p.noiseOctaves + 1); p.baseShape = 5; },
    'surface_grain':          () => { p.noiseScale = Math.min(4, p.noiseScale * 1.4); p.noiseOctaves = Math.min(6, p.noiseOctaves + 1); },
    'prop_taller':            () => { p.scaleY = Math.min(3, p.scaleY * 1.3); },
    'prop_shorter':           () => { p.scaleY = Math.max(0.2, p.scaleY * 0.75); },
    'prop_wider':             () => { p.scaleX = Math.min(3, p.scaleX * 1.2); },
    'prop_narrower':          () => { p.scaleX = Math.max(0.2, p.scaleX * 0.8); },
    'prop_deeper':            () => { p.scaleZ = Math.min(3, p.scaleZ * 1.2); },
    'prop_shallower':         () => { p.scaleZ = Math.max(0.2, p.scaleZ * 0.8); },
    'prop_larger':            () => { ['scaleX','scaleY','scaleZ'].forEach(k => { p[k] = Math.min(3, p[k] * 1.2); }); },
    'prop_smaller':           () => { ['scaleX','scaleY','scaleZ'].forEach(k => { p[k] = Math.max(0.2, p[k] * 0.8); }); },
    'prop_top_heavy':         () => { p.taper = Math.min(2, p.taper + 0.3); },
    'prop_bottom_heavy':      () => { p.taper = Math.max(0, p.taper - 0.3); },
    'base_rounder':           () => { p.baseShape = 0; },
    'base_angular':           () => { p.baseShape = 2; },
    'base_cylindrical':       () => { p.baseShape = 1; p.taper = 1; },
    'base_boxy':              () => { p.baseShape = 2; },
    'base_spherical':         () => { p.baseShape = 0; p.scaleX = p.scaleY; p.scaleZ = p.scaleY; },
    'base_organic':           () => { p.baseShape = 5; p.noiseAmplitude = Math.min(0.6, p.noiseAmplitude * 1.3); },
    'twist_add':              () => { p.twist = Math.min(6.28, p.twist + 0.8); },
    'twist_reduce':           () => { p.twist = Math.max(0, p.twist - 0.8); },
    'taper_top':              () => { p.taper = Math.max(0, p.taper - 0.3); },
    'taper_bottom':           () => { p.taper = Math.min(2, p.taper + 0.3); },
    'org_shell_spiral':       () => { p.twist = Math.min(6.28, p.twist + 2); p.taper = Math.max(0, p.taper - 0.4); p.ridges = Math.min(8, Math.max(3, p.ridges)); },
    'mech_sharp_edges':       () => { p.noiseAmplitude = Math.max(0, p.noiseAmplitude * 0.5); p.subdivisions = Math.min(96, p.subdivisions + 16); },
    'mech_thread':            () => { p.ridges = Math.min(8, p.ridges + 2); p.twist = Math.min(6.28, p.twist + 1); p.noiseAmplitude = Math.max(0, p.noiseAmplitude * 0.5); },
    'res_higher':             () => { p.subdivisions = Math.min(96, p.subdivisions + 16); },
    'res_lower':              () => { p.subdivisions = Math.max(16, p.subdivisions - 16); },
    'print_flat_base':        () => { p.taper = Math.max(0, p.taper - 0.2); p.noiseAmplitude = Math.max(0, p.noiseAmplitude * 0.7); },
    'print_walls_thicker':    () => { p.scaleX = Math.min(3, p.scaleX * 1.1); p.scaleZ = Math.min(3, p.scaleZ * 1.1); p.noiseAmplitude = Math.max(0, p.noiseAmplitude * 0.8); },
  };

  for (const tag of tags) {
    if (corrections[tag]) corrections[tag]();
  }

  return validateParams(p);
}
