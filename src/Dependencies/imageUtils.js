// ── imageUtils.js ─────────────────────────────────────────────────────────────
// Canvas and image utilities for MobileNet preprocessing.
// Browser APIs only — no external dependencies.

// Load a File object into an HTMLCanvasElement
export function loadImageToCanvas(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });
}

// Load a base64 data URL string into a canvas
export function loadDataURLToCanvas(dataURL) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error('DataURL load failed'));
    img.src = dataURL;
  });
}

// Resize a canvas to exact dimensions (MobileNet requires 224×224)
export function resizeCanvas(source, width = 224, height = 224) {
  const canvas = document.createElement('canvas');
  canvas.width  = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(source, 0, 0, width, height);
  return canvas;
}

// Get aspect ratio
export function getAspectRatio(canvas) {
  return canvas.width / canvas.height;
}

// Collapse pixel brightness along an axis to produce a 1D silhouette profile
// axis: 'x' = vertical profile, 'y' = horizontal profile
export function getBrightnessProfile(canvas, axis = 'x', bins = 64) {
  const ctx  = canvas.getContext('2d');
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const profile = new Float32Array(bins);

  if (axis === 'x') {
    const binH = canvas.height / bins;
    for (let b = 0; b < bins; b++) {
      let sum = 0, count = 0;
      const yStart = Math.floor(b * binH);
      const yEnd   = Math.floor((b + 1) * binH);
      for (let y = yStart; y < yEnd; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4;
          sum += (data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114) / 255;
          count++;
        }
      }
      profile[b] = count > 0 ? sum / count : 0;
    }
  } else {
    const binW = canvas.width / bins;
    for (let b = 0; b < bins; b++) {
      let sum = 0, count = 0;
      const xStart = Math.floor(b * binW);
      const xEnd   = Math.floor((b + 1) * binW);
      for (let y = 0; y < canvas.height; y++) {
        for (let x = xStart; x < xEnd; x++) {
          const i = (y * canvas.width + x) * 4;
          sum += (data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114) / 255;
          count++;
        }
      }
      profile[b] = count > 0 ? sum / count : 0;
    }
  }
  return profile;
}

// Simple edge detection for silhouette extraction (Sobel-like)
export function extractSilhouette(canvas, bins = 20) {
  const resized = resizeCanvas(canvas, 64, 64);
  const ctx  = resized.getContext('2d');
  const data = ctx.getImageData(0, 0, 64, 64).data;
  const gray = new Float32Array(64 * 64);

  // Convert to grayscale
  for (let i = 0; i < 64 * 64; i++) {
    const p = i * 4;
    gray[i] = (data[p] * 0.299 + data[p+1] * 0.587 + data[p+2] * 0.114) / 255;
  }

  // Compute column-wise average brightness (silhouette proxy)
  const binWidth = 64 / bins;
  const profile = new Float32Array(bins);
  for (let b = 0; b < bins; b++) {
    let sum = 0;
    const xStart = Math.floor(b * binWidth);
    const xEnd   = Math.floor((b + 1) * binWidth);
    for (let y = 0; y < 64; y++) {
      for (let x = xStart; x < xEnd; x++) {
        sum += gray[y * 64 + x];
      }
    }
    profile[b] = sum / (64 * (xEnd - xStart));
  }

  // Normalize 0-1
  const mx = Math.max(...profile) || 1;
  return profile.map(v => v / mx);
}

// Parse unit metadata from PLY or OBJ file headers
export function parseUnitMetadata(headerText, extension) {
  const ext = extension.toLowerCase();

  if (ext === 'ply') {
    // PLY comment-based unit hints: "comment units mm" or "element unit millimeter"
    const match = headerText.match(/comment\s+(?:units?|scale)\s+(\w+)/i);
    if (match) {
      const unit = match[1].toLowerCase();
      if (unit.includes('mm') || unit.includes('millimeter')) return { units: 'mm', detected: true };
      if (unit.includes('cm') || unit.includes('centimeter')) return { units: 'cm', detected: true };
      if (unit.includes('in') || unit.includes('inch'))       return { units: 'in', detected: true };
      if (unit.includes('m')  && !unit.includes('mm'))        return { units: 'cm', detected: true }; // meters → treat as cm scale
    }
  }

  if (ext === 'obj') {
    // OBJ may have a companion .mtl or inline scale comment
    const match = headerText.match(/#\s*(?:units?|scale)\s*[=:]?\s*(\w+)/i);
    if (match) {
      const unit = match[1].toLowerCase();
      if (unit.includes('mm')) return { units: 'mm', detected: true };
      if (unit.includes('cm')) return { units: 'cm', detected: true };
      if (unit.includes('in')) return { units: 'in', detected: true };
    }
  }

  return { units: null, detected: false };
}

// Convert a canvas to a pixel data array suitable for TF.js
// Returns { width, height, data: Uint8ClampedArray }
export function canvasToPixelData(canvas) {
  const ctx  = resizeCanvas(canvas, 224, 224).getContext('2d');
  const data = ctx.getImageData(0, 0, 224, 224);
  return { width: 224, height: 224, data: data.data };
}
