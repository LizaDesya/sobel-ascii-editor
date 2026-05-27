/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Copyright Oxide Computer Company
 */

// Shape-vector ASCII placement, ported from Alex Harri's article
// (https://alexharri.com/blog/ascii-rendering) and the reference Python
// implementation at ascii-renderer-main/ascii_renderer/shape.py.
//
// Each cell is described by a 6-D "shape vector" sampled from six circles
// arranged in a staggered 2×3 grid. The same circles are sampled inside each
// candidate glyph (rasterized via Canvas2D in DepartureMono) to produce the
// character's reference vector. The cell's character is the glyph whose
// vector is nearest in Euclidean distance.
//
// Directional contrast enhancement (per the article) is intentionally
// omitted. A single optional global-contrast exponent is supported.

import type { ShapeData } from './types'

interface SamplingCircle {
  cx: number
  cy: number
  r: number
}

// Verbatim from ascii_renderer/shape.py: 6 circles in a staggered 2×3 grid.
// Left column slightly lowered, right slightly raised — staggering closes the
// gaps between rows so punctuation in the cell middle still gets captured.
const INTERNAL_CIRCLES: readonly SamplingCircle[] = [
  { cx: 0.3, cy: 0.2, r: 0.22 },
  { cx: 0.7, cy: 0.15, r: 0.22 },
  { cx: 0.3, cy: 0.5, r: 0.22 },
  { cx: 0.7, cy: 0.5, r: 0.22 },
  { cx: 0.3, cy: 0.8, r: 0.22 },
  { cx: 0.7, cy: 0.85, r: 0.22 },
]

const VEC_DIM = INTERNAL_CIRCLES.length

// Full printable ASCII (0x21..0x7E). Space is excluded — its zero vector
// dominates flat regions for the wrong reasons (we want chars whose shape
// matches uniform low-luminance cells, not just "nothing here"). The empty
// regions of the image still pick `.` / `'` / `` ` `` etc., which look fine.
const PRINTABLE_ASCII: string = (() => {
  let s = ''
  for (let c = 0x21; c <= 0x7e; c++) s += String.fromCharCode(c)
  return s
})()

// 4×4 stratified offsets in [-1, 1]² that fall inside the unit circle.
// Precomputed once — every per-cell and per-glyph sample reuses these.
const UNIT_OFFSETS: ReadonlyArray<readonly [number, number]> = (() => {
  const offsets: Array<[number, number]> = []
  const n = 4
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const fx = ((i + 0.5) / n) * 2 - 1
      const fy = ((j + 0.5) / n) * 2 - 1
      if (fx * fx + fy * fy <= 1) offsets.push([fx, fy])
    }
  }
  return offsets
})()

interface CharShapeTable {
  chars: string[]
  // Flat row-major Float32Array of length chars.length * VEC_DIM
  vectors: Float32Array
}

const shapeCache = new Map<string, Promise<CharShapeTable>>()

// Rec. 709 luma, used only by the shape-mode pipeline. Sobel keeps Rec. 601
// in image-processor.ts to stay byte-faithful to Acerola's shader.
export function luminanceRec709(rgba: Uint8ClampedArray, count: number): Float32Array {
  const out = new Float32Array(count)
  for (let i = 0, j = 0; j < count; i += 4, j++) {
    out[j] = (0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]) / 255
  }
  return out
}

function sampleCircleAvg(
  gray: Float32Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
): number {
  let total = 0
  let count = 0
  for (let k = 0; k < UNIT_OFFSETS.length; k++) {
    const [fx, fy] = UNIT_OFFSETS[k]
    let px = (cx + fx * radius) | 0
    let py = (cy + fy * radius) | 0
    if (px < 0) px = 0
    else if (px >= width) px = width - 1
    if (py < 0) py = 0
    else if (py >= height) py = height - 1
    total += gray[py * width + px]
    count += 1
  }
  return count > 0 ? total / count : 0
}

function rasterizeGlyphLuminance(
  ctx: CanvasRenderingContext2D,
  char: string,
  width: number,
  height: number,
  fontPx: number,
): Float32Array {
  ctx.fillStyle = 'black'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = 'white'
  ctx.font = `${fontPx}px DepartureMono, monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // textBaseline 'middle' centers vertically on the em box midline, which is
  // close enough for shape comparison; we sample the rendered ink, not the
  // glyph's typographic baseline.
  ctx.fillText(char, width / 2, height / 2)
  const data = ctx.getImageData(0, 0, width, height).data
  // The canvas is grayscale (black bg + white ink), so any channel works;
  // use red for the per-pixel ink fraction in [0, 1].
  const out = new Float32Array(width * height)
  for (let i = 0, j = 0; j < out.length; i += 4, j++) out[j] = data[i] / 255
  return out
}

async function generateCharacterShapes(
  cellPxW: number,
  cellPxH: number,
): Promise<CharShapeTable> {
  // Render glyphs at 8× the per-cell pixel size for crisp shape sampling, as
  // in the Mayz reference (cell × 8). The absolute size of the rasterization
  // only affects sampling accuracy — circles are normalized.
  const renderW = Math.max(40, cellPxW * 8)
  const renderH = Math.max(72, cellPxH * 8)
  const fontPx = Math.floor(renderH * 0.75)

  // Ensure DepartureMono is parsed before any fillText, otherwise the first
  // few glyphs render in the fallback monospace and produce mismatched
  // vectors that never recover (the cache freezes them).
  if (typeof document !== 'undefined' && document.fonts) {
    try {
      await document.fonts.load(`${fontPx}px DepartureMono`)
    } catch {
      // If font loading fails the canvas will fall back to the system
      // monospace; vectors will still be self-consistent.
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = renderW
  canvas.height = renderH
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    throw new Error('Could not get 2D context for shape vector rasterization')
  }

  const chars: string[] = []
  const raw = new Float32Array(PRINTABLE_ASCII.length * VEC_DIM)
  let written = 0
  for (let i = 0; i < PRINTABLE_ASCII.length; i++) {
    const ch = PRINTABLE_ASCII[i]
    const gray = rasterizeGlyphLuminance(ctx, ch, renderW, renderH, fontPx)
    for (let c = 0; c < VEC_DIM; c++) {
      const circle = INTERNAL_CIRCLES[c]
      raw[written * VEC_DIM + c] = sampleCircleAvg(
        gray,
        renderW,
        renderH,
        circle.cx * renderW,
        circle.cy * renderH,
        circle.r * Math.min(renderW, renderH),
      )
    }
    chars.push(ch)
    written++
  }

  // Per-dimension max-normalize, 1e-6 floor to avoid divide-by-zero on
  // dimensions where no glyph ever has ink.
  const maxes = new Float32Array(VEC_DIM)
  for (let d = 0; d < VEC_DIM; d++) maxes[d] = 1e-6
  for (let i = 0; i < written; i++) {
    for (let d = 0; d < VEC_DIM; d++) {
      const v = raw[i * VEC_DIM + d]
      if (v > maxes[d]) maxes[d] = v
    }
  }
  for (let i = 0; i < written; i++) {
    for (let d = 0; d < VEC_DIM; d++) raw[i * VEC_DIM + d] /= maxes[d]
  }

  return { chars, vectors: raw }
}

export function getCharacterShapes(
  cellPxW: number,
  cellPxH: number,
): Promise<CharShapeTable> {
  const key = `${cellPxW}x${cellPxH}`
  const cached = shapeCache.get(key)
  if (cached) return cached
  const pending = generateCharacterShapes(cellPxW, cellPxH)
  shapeCache.set(key, pending)
  return pending
}

function applyGlobalContrast(vec: Float32Array, exponent: number): void {
  if (exponent <= 1.0) return
  let max = 0
  for (let i = 0; i < vec.length; i++) if (vec[i] > max) max = vec[i]
  if (max < 1e-6) return
  for (let i = 0; i < vec.length; i++) {
    vec[i] = Math.pow(vec[i] / max, exponent) * max
  }
}

function findNearestChar(table: CharShapeTable, vec: Float32Array): string {
  const { chars, vectors } = table
  let bestIdx = 0
  let bestDist = Infinity
  for (let i = 0; i < chars.length; i++) {
    let d = 0
    const base = i * VEC_DIM
    for (let c = 0; c < VEC_DIM; c++) {
      const diff = vectors[base + c] - vec[c]
      d += diff * diff
    }
    if (d < bestDist) {
      bestDist = d
      bestIdx = i
    }
  }
  return chars[bestIdx]
}

export async function computeShapePlacements(
  gray: Float32Array,
  srcWidth: number,
  srcHeight: number,
  cols: number,
  rows: number,
  contrastExp: number,
): Promise<ShapeData> {
  if (cols <= 0 || rows <= 0) return {}
  const cellPxW = srcWidth / cols
  const cellPxH = srcHeight / rows
  const table = await getCharacterShapes(
    Math.max(1, Math.round(cellPxW)),
    Math.max(1, Math.round(cellPxH)),
  )

  const cellVec = new Float32Array(VEC_DIM)
  const result: ShapeData = {}
  for (let col = 0; col < cols; col++) {
    const cellOriginX = col * cellPxW
    const column: { [y: number]: string } = {}
    for (let row = 0; row < rows; row++) {
      const cellOriginY = row * cellPxH
      for (let c = 0; c < VEC_DIM; c++) {
        const circle = INTERNAL_CIRCLES[c]
        cellVec[c] = sampleCircleAvg(
          gray,
          srcWidth,
          srcHeight,
          cellOriginX + circle.cx * cellPxW,
          cellOriginY + circle.cy * cellPxH,
          circle.r * Math.min(cellPxW, cellPxH),
        )
      }
      applyGlobalContrast(cellVec, contrastExp)
      column[row] = findNearestChar(table, cellVec)
    }
    result[col] = column
  }
  return result
}
