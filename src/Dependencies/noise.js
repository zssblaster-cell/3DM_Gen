// ── noise.js ─────────────────────────────────────────────────────────────────
// Perlin noise + fractional Brownian motion (FBM)
// No external dependencies. Pure math.

export function makePerm(seed = 42) {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = seed >>> 0;
  for (let i = 255; i > 0; i--) {
    s = Math.imul(s, 1664525) + 1013904223 >>> 0;
    const j = s % (i + 1);
    const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  return perm;
}

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(a, b, t) { return a + t * (b - a); }

function grad(h, x, y, z) {
  h &= 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
  return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
}

export function perlin(x, y, z, perm) {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const Z = Math.floor(z) & 255;
  x -= Math.floor(x);
  y -= Math.floor(y);
  z -= Math.floor(z);
  const u = fade(x), v = fade(y), w = fade(z);
  const A  = perm[X]     + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z;
  const B  = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z;
  return lerp(
    lerp(
      lerp(grad(perm[AA],     x,     y,     z),
           grad(perm[BA],     x - 1, y,     z), u),
      lerp(grad(perm[AB],     x,     y - 1, z),
           grad(perm[BB],     x - 1, y - 1, z), u), v),
    lerp(
      lerp(grad(perm[AA + 1], x,     y,     z - 1),
           grad(perm[BA + 1], x - 1, y,     z - 1), u),
      lerp(grad(perm[AB + 1], x,     y - 1, z - 1),
           grad(perm[BB + 1], x - 1, y - 1, z - 1), u), v),
    w);
}

export function fbm(x, y, z, perm, octaves = 4, scale = 1.0, amplitude = 0.5) {
  let val = 0;
  let amp = amplitude;
  let freq = scale;
  for (let o = 0; o < octaves; o++) {
    val += perlin(x * freq, y * freq, z * freq, perm) * amp;
    freq *= 2.1;
    amp  *= 0.48;
  }
  return val;
}

export function makeNoise(seed = 42) {
  const perm = makePerm(seed);
  return {
    perlin: (x, y, z) => perlin(x, y, z, perm),
    fbm:    (x, y, z, octaves, scale, amplitude) =>
              fbm(x, y, z, perm, octaves, scale, amplitude),
  };
}
