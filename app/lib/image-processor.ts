/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Copyright Oxide Computer Company
 */
import type { AsciiSettings } from '~/components/ascii-art-generator'

import { computeShapePlacements, luminanceRec709 } from './shape-placement'
import type { AsciiImageData, EdgeData, ShapeData } from './types'

// Types
export interface CachedMediaData {
  type: 'gif'
  sourceUrl: string
  rawFrames: MediaFrame[]
  processedFrames?: {
    settings: MediaProcessingSettings
    frames: AsciiImageData[]
  }
}

export type MediaFrame = {
  dataUrl: string
  timestamp?: number
}

export type DitheringAlgorithm =
  | 'floydSteinberg'
  | 'atkinson'
  | 'burkes'
  | 'sierra'
  | 'sierraLite'

export type Algorithm = 'standard' | 'sobel'

export type MediaProcessingSettings = {
  characterSet: string
  whitePoint: number
  blackPoint: number
  brightness: number
  invert: boolean
  dithering: boolean
  ditheringAlgorithm: DitheringAlgorithm
  columns: number
  rows: number
  colorMapping: string
}

export type ImageProcessingResult = {
  data: AsciiImageData
  edgeData?: EdgeData
  shapeData?: ShapeData
  width: number
  height: number
  processedImageUrl?: string
  frames?: AsciiImageData[]
  edgeFrames?: EdgeData[]
  shapeFrames?: ShapeData[]
  rawFrames?: MediaFrame[]
  frameCount?: number
  sourceFps?: number
}

// Main processing functions
export async function processAnimatedMedia(
  rawFrames: MediaFrame[],
  settings: AsciiSettings,
  progressCallback?: (frame: number) => void,
): Promise<{
  frames: AsciiImageData[]
  edgeFrames: EdgeData[] | null
  shapeFrames: ShapeData[] | null
  firstFrameData: AsciiImageData
  firstFrameEdgeData: EdgeData | null
  firstFrameShapeData: ShapeData | null
  firstFrameUrl: string | null
}> {
  const processedFrames: AsciiImageData[] = []
  const processedEdgeFrames: EdgeData[] = []
  const processedShapeFrames: ShapeData[] = []
  let firstFrameData: AsciiImageData = {}
  let firstFrameEdgeData: EdgeData | null = null
  let firstFrameShapeData: ShapeData | null = null
  let firstFrameUrl: string | null = null

  for (let i = 0; i < rawFrames.length; i++) {
    if (progressCallback) {
      progressCallback(i)
    }

    const frameResult = await processImage(rawFrames[i].dataUrl, settings)

    if (i === 0) {
      firstFrameData = frameResult.data
      firstFrameEdgeData = frameResult.edgeData || null
      firstFrameShapeData = frameResult.shapeData || null
      firstFrameUrl = frameResult.processedImageUrl || null
    }

    processedFrames.push(frameResult.data)
    if (frameResult.edgeData) {
      processedEdgeFrames.push(frameResult.edgeData)
    }
    if (frameResult.shapeData) {
      processedShapeFrames.push(frameResult.shapeData)
    }
  }

  const useEdges =
    settings.preprocessing.placementMode === 'value' &&
    settings.preprocessing.algorithm === 'sobel' &&
    processedEdgeFrames.length === processedFrames.length
  const useShape =
    settings.preprocessing.placementMode === 'shape' &&
    processedShapeFrames.length === processedFrames.length

  return {
    frames: processedFrames,
    edgeFrames: useEdges ? processedEdgeFrames : null,
    shapeFrames: useShape ? processedShapeFrames : null,
    firstFrameData,
    firstFrameEdgeData,
    firstFrameShapeData,
    firstFrameUrl,
  }
}

export async function processImage(
  imageData: string,
  settings: AsciiSettings,
  extractFrames: boolean = false,
): Promise<ImageProcessingResult> {
  return new Promise((resolve) => {
    if (extractFrames && imageData.includes('data:image/gif')) {
      handleGifExtraction(imageData, settings, resolve)
      return
    }

    const img = new Image()

    img.onload = async () => {
      const width = settings.output.columns
      const height = settings.output.rows

      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')!

      canvas.width = img.width
      canvas.height = img.height

      ctx.drawImage(img, 0, 0)

      const result = await processImageData(canvas, settings)

      resolve({
        data: result.data,
        edgeData: result.edgeData,
        shapeData: result.shapeData,
        width,
        height,
        processedImageUrl: result.processedImageUrl,
      })
    }

    img.onerror = (error) => {
      console.error('Error loading image:', error)
      resolve(createFallbackResponse(settings))
    }

    img.src = imageData
  })
}

// Helper functions
function createFallbackResponse(settings: AsciiSettings): ImageProcessingResult {
  const width = settings.output.columns || 80
  const height = settings.output.rows || 40
  const data: AsciiImageData = {}

  for (let x = 0; x < width; x++) {
    data[x] = {}
    for (let y = 0; y < height; y++) {
      data[x][y] = 0.5 // Default to middle density
    }
  }

  return { data, width, height }
}

async function processImageData(
  sourceCanvas: HTMLCanvasElement,
  settings: AsciiSettings,
): Promise<{
  data: AsciiImageData
  edgeData?: EdgeData
  shapeData?: ShapeData
  processedImageUrl?: string
}> {
  const ctx = sourceCanvas.getContext('2d')!
  const width = settings.output.columns
  const height = settings.output.rows

  // Apply preprocessing
  applyImagePreprocessing(ctx, settings.preprocessing)

  // Resize for ASCII conversion
  const resizeCanvas = document.createElement('canvas')
  const resizeCtx = resizeCanvas.getContext('2d')!

  resizeCanvas.width = width
  resizeCanvas.height = height

  configureResizeContext(resizeCtx, settings.preprocessing.blur)

  // Apply center-pixel sampling for better resizing
  const srcWidth = sourceCanvas.width
  const srcHeight = sourceCanvas.height
  const pixelWidth = srcWidth / width
  const pixelHeight = srcHeight / height
  const offsetX = pixelWidth / 2
  const offsetY = pixelHeight / 2

  resizeCtx.drawImage(
    sourceCanvas,
    offsetX,
    offsetY,
    srcWidth - offsetX * 2,
    srcHeight - offsetY * 2,
    0,
    0,
    width,
    height,
  )

  const processedImageUrl = resizeCanvas.toDataURL('image/png')
  const pixelData = resizeCtx.getImageData(0, 0, width, height).data
  const data = convertPixelsToAscii(pixelData, width, height, settings)

  let edgeData: EdgeData | undefined
  let shapeData: ShapeData | undefined
  const placementMode = settings.preprocessing.placementMode

  if (placementMode === 'value' && settings.preprocessing.algorithm === 'sobel') {
    // Acerola dispatches a compute shader at BUFFER_WIDTH/8 × BUFFER_HEIGHT/8
    // with 8×8 workgroups, so every glyph tile is exactly 64 pixels. Resample the
    // preprocessed canvas to (cols*8 × rows*8) so our histogram vote sees the
    // same shape, regardless of the source image's resolution.
    const sobelW = width * 8
    const sobelH = height * 8
    const sobelCanvas = document.createElement('canvas')
    sobelCanvas.width = sobelW
    sobelCanvas.height = sobelH
    const sobelCtx = sobelCanvas.getContext('2d')!
    sobelCtx.imageSmoothingEnabled = true
    sobelCtx.drawImage(sourceCanvas, 0, 0, sobelW, sobelH)
    edgeData = computeSobelEdges(
      sobelCtx.getImageData(0, 0, sobelW, sobelH).data,
      sobelW,
      sobelH,
      width,
      height,
      settings.preprocessing,
    )
  } else if (placementMode === 'shape') {
    // Shape-vector placement (Alex Harri). Reuse the Sobel-style 8× resample
    // to guarantee enough pixels per cell for the 4×4 sampling grid inside
    // each of the 6 circles.
    const shapeW = width * 8
    const shapeH = height * 8
    const shapeCanvas = document.createElement('canvas')
    shapeCanvas.width = shapeW
    shapeCanvas.height = shapeH
    const shapeCtx = shapeCanvas.getContext('2d')!
    shapeCtx.imageSmoothingEnabled = true
    shapeCtx.drawImage(sourceCanvas, 0, 0, shapeW, shapeH)
    const gray = luminanceRec709(
      shapeCtx.getImageData(0, 0, shapeW, shapeH).data,
      shapeW * shapeH,
    )
    shapeData = await computeShapePlacements(
      gray,
      shapeW,
      shapeH,
      width,
      height,
      settings.preprocessing.shapeContrast,
      settings.preprocessing.shapeBlankSpace,
    )
  }

  return { data, edgeData, shapeData, processedImageUrl }
}

function applyImagePreprocessing(
  ctx: CanvasRenderingContext2D,
  preprocessing: AsciiSettings['preprocessing'],
) {
  // Apply brightness
  if (preprocessing.brightness !== 0) {
    adjustBrightness(ctx, preprocessing.brightness)
  }

  // Apply inversion
  if (preprocessing.invert) {
    invertColors(ctx)
  }

  // Apply dithering
  if (preprocessing.dithering) {
    applyDithering(ctx, preprocessing.ditheringAlgorithm)
  }
}

function configureResizeContext(ctx: CanvasRenderingContext2D, blur: number) {
  if (blur > 0) {
    ctx.filter = `blur(${blur}px)`
  } else {
    ctx.filter = 'none'
  }
  ctx.imageSmoothingEnabled = false
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rNorm = r / 255
  const gNorm = g / 255
  const bNorm = b / 255

  const max = Math.max(rNorm, gNorm, bNorm)
  const min = Math.min(rNorm, gNorm, bNorm)
  let h = 0,
    s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

    switch (max) {
      case rNorm:
        h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0)
        break
      case gNorm:
        h = (bNorm - rNorm) / d + 2
        break
      case bNorm:
        h = (rNorm - gNorm) / d + 4
        break
    }

    h /= 6
  }

  return [h * 360, s * 100, l * 100]
}

function convertPixelsToAscii(
  pixelData: Uint8ClampedArray,
  width: number,
  height: number,
  settings: AsciiSettings,
): AsciiImageData {
  const colorMapping = settings.output.colorMapping

  const data: AsciiImageData = {}

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelIndex = (y * width + x) * 4

      // Get pixel color values
      const r = pixelData[pixelIndex]
      const g = pixelData[pixelIndex + 1]
      const b = pixelData[pixelIndex + 2]

      let mappingValue = 0

      switch (colorMapping) {
        case 'hue': {
          const [h, _, __] = rgbToHsl(r, g, b)
          mappingValue = (h / 360) * 255 // Map hue (0-360) to 0-255 range
          break
        }
        case 'saturation': {
          const [_, s, __] = rgbToHsl(r, g, b)
          mappingValue = (s / 100) * 255 // Map saturation (0-100) to 0-255 range
          break
        }
        case 'brightness':
        default:
          // Use luminance formula for brightness
          mappingValue = 0.299 * r + 0.587 * g + 0.114 * b
          break
      }

      mappingValue = normalizeWithPointAdjustment(
        mappingValue,
        settings.preprocessing.blackPoint,
        settings.preprocessing.whitePoint,
      )

      // Convert to 0-1 value
      const normalizedValue = mappingValue / 255

      // Initialize column if needed
      if (!data[x]) {
        data[x] = {}
      }

      data[x][y] = normalizedValue
    }
  }

  return data
}

function normalizeWithPointAdjustment(
  value: number,
  blackPoint: number,
  whitePoint: number,
): number {
  const range = whitePoint - blackPoint
  if (range <= 0) return value

  let valueNorm = Math.max(0, value - blackPoint)
  valueNorm = Math.min(255, value)
  return (valueNorm / range) * 255
}

// Image processing utilities
export function adjustBrightness(ctx: CanvasRenderingContext2D, brightness: number) {
  const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height)
  const data = imageData.data
  const factor = brightness < 0 ? 1 + brightness / 100 : 1 + brightness / 50

  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, data[i] * factor)
    data[i + 1] = Math.min(255, data[i + 1] * factor)
    data[i + 2] = Math.min(255, data[i + 2] * factor)
  }

  ctx.putImageData(imageData, 0, 0)
}

export function invertColors(ctx: CanvasRenderingContext2D) {
  const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height)
  const data = imageData.data

  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 - data[i]
    data[i + 1] = 255 - data[i + 1]
    data[i + 2] = 255 - data[i + 2]
  }

  ctx.putImageData(imageData, 0, 0)
}

export function applyDithering(
  ctx: CanvasRenderingContext2D,
  algorithm: string = 'floydSteinberg',
) {
  const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height)
  const data = imageData.data
  const width = ctx.canvas.width
  const height = ctx.canvas.height

  const ditheringAlgorithms = {
    floydSteinberg: applyFloydSteinberg,
    atkinson: applyAtkinson,
    ordered: applyOrdered,
    bayer: applyBayer,
  }

  const selectedAlgorithm =
    ditheringAlgorithms[algorithm as keyof typeof ditheringAlgorithms] ||
    ditheringAlgorithms.floydSteinberg

  selectedAlgorithm(data, width, height)
  ctx.putImageData(imageData, 0, 0)
}

// Dithering algorithm implementations
function applyFloydSteinberg(data: Uint8ClampedArray, width: number, height: number) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4

      // Convert to grayscale
      const oldGray = Math.round(
        0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2],
      )
      const newGray = oldGray < 128 ? 0 : 255
      const error = oldGray - newGray

      // Set new pixel value
      data[idx] = newGray
      data[idx + 1] = newGray
      data[idx + 2] = newGray

      // Distribute error to neighboring pixels
      distributeError(data, width, height, x, y, error, [
        { dx: 1, dy: 0, factor: 7 / 16 },
        { dx: -1, dy: 1, factor: 3 / 16 },
        { dx: 0, dy: 1, factor: 5 / 16 },
        { dx: 1, dy: 1, factor: 1 / 16 },
      ])
    }
  }
}

function applyAtkinson(data: Uint8ClampedArray, width: number, height: number) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4

      // Convert to grayscale
      const oldGray = Math.round(
        0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2],
      )
      const newGray = oldGray < 128 ? 0 : 255
      const error = Math.floor((oldGray - newGray) / 8)

      // Set new pixel value
      data[idx] = newGray
      data[idx + 1] = newGray
      data[idx + 2] = newGray

      // Distribute error to neighboring pixels
      distributeError(data, width, height, x, y, error, [
        { dx: 1, dy: 0, factor: 1 },
        { dx: 2, dy: 0, factor: 1 },
        { dx: -1, dy: 1, factor: 1 },
        { dx: 0, dy: 1, factor: 1 },
        { dx: 1, dy: 1, factor: 1 },
        { dx: 0, dy: 2, factor: 1 },
      ])
    }
  }
}

function distributeError(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  error: number,
  distribution: { dx: number; dy: number; factor: number }[],
) {
  for (const { dx, dy, factor } of distribution) {
    const nx = x + dx
    const ny = y + dy

    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
      const nidx = (ny * width + nx) * 4
      const errorAmount = error * factor

      data[nidx] = Math.max(0, Math.min(255, data[nidx] + errorAmount))
      data[nidx + 1] = Math.max(0, Math.min(255, data[nidx + 1] + errorAmount))
      data[nidx + 2] = Math.max(0, Math.min(255, data[nidx + 2] + errorAmount))
    }
  }
}

// Other dithering algorithms...
function applyOrdered(data: Uint8ClampedArray, width: number, height: number) {
  const threshold = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ]

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      const gray = Math.round(
        0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2],
      )

      const tx = x % 4
      const ty = y % 4
      const threshold_value = threshold[ty][tx] * 16

      const newGray = gray < threshold_value ? 0 : 255

      data[idx] = newGray
      data[idx + 1] = newGray
      data[idx + 2] = newGray
    }
  }
}

// --- Sobel / Difference-of-Gaussians edge detection ---------------------------
// Ported from Garrett Gunnell's AcerolaFX_ASCII.fx ("I Tried Turning Games Into
// Text"). The pipeline is: luminance → two separable Gaussians at σ and σ·k →
// binarize `(blurA - τ·blurB) ≥ threshold` → separable Scharr (3,10,3 / 3,0,-3)
// on the 0/1 mask → atan2(Gy, Gx) → bucket angle into 4 directions → per-tile
// majority vote over an 8×8 cell.

// Direction index → glyph. Derived from first principles in screen Y-down
// coordinates: a positive atan2(Gy, Gx) near +π/4 means the gradient points
// down-right, so the perpendicular edge runs bottom-left → top-right, which
// is `/`. See the bin assignment in computeSobelEdges for the full mapping.
const EDGE_CHARS = ['|', '_', '/', '\\'] as const

// Grayscale in [0, 1] using Rec. 601 luma weights, matching Acerola's
// Common::Luminance on saturated RGB.
function toGrayscale(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Float32Array {
  const out = new Float32Array(width * height)
  for (let i = 0, j = 0; i < data.length; i += 4, j += 1) {
    out[j] = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255
  }
  return out
}

function gaussianKernel1D(sigma: number, radius: number): Float32Array {
  const size = radius * 2 + 1
  const kernel = new Float32Array(size)
  const twoSigmaSq = 2 * sigma * sigma
  let sum = 0
  for (let i = 0; i < size; i++) {
    const x = i - radius
    kernel[i] = Math.exp(-(x * x) / twoSigmaSq)
    sum += kernel[i]
  }
  for (let i = 0; i < size; i++) kernel[i] /= sum
  return kernel
}

// Separable two-sigma Gaussian blur in one allocation pass. Returns the pair
// (blurA, blurB) blurred at σ and σ·k respectively. Acerola packs these into
// the R/G channels of an intermediate texture; we just return two arrays.
function gaussianBlurPair(
  src: Float32Array,
  width: number,
  height: number,
  sigma: number,
  kRatio: number,
  radius: number,
): { a: Float32Array; b: Float32Array } {
  const kA = gaussianKernel1D(sigma, radius)
  const kB = gaussianKernel1D(sigma * kRatio, radius)
  const tmpA = new Float32Array(width * height)
  const tmpB = new Float32Array(width * height)
  const outA = new Float32Array(width * height)
  const outB = new Float32Array(width * height)

  // Horizontal
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      let accA = 0
      let accB = 0
      for (let k = -radius; k <= radius; k++) {
        const xx = x + k < 0 ? 0 : x + k >= width ? width - 1 : x + k
        const v = src[row + xx]
        accA += v * kA[k + radius]
        accB += v * kB[k + radius]
      }
      tmpA[row + x] = accA
      tmpB[row + x] = accB
    }
  }

  // Vertical
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let accA = 0
      let accB = 0
      for (let k = -radius; k <= radius; k++) {
        const yy = y + k < 0 ? 0 : y + k >= height ? height - 1 : y + k
        const idx = yy * width + x
        accA += tmpA[idx] * kA[k + radius]
        accB += tmpB[idx] * kB[k + radius]
      }
      outA[y * width + x] = accA
      outB[y * width + x] = accB
    }
  }

  return { a: outA, b: outB }
}

function computeSobelEdges(
  rgba: Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  cols: number,
  rows: number,
  preprocessing: AsciiSettings['preprocessing'],
): EdgeData {
  const gray = toGrayscale(rgba, srcWidth, srcHeight)

  const sigma = Math.max(0.1, preprocessing.sobelDogSigma)
  const kRatio = Math.max(1.0, preprocessing.sobelDogK)
  const tau = preprocessing.sobelDogTau
  const dogThreshold = preprocessing.sobelDogThreshold
  const radius = Math.max(1, Math.floor(preprocessing.sobelKernelSize))

  // Pass 1: two horizontal+vertical Gaussian blurs.
  const { a: blurA, b: blurB } = gaussianBlurPair(
    gray,
    srcWidth,
    srcHeight,
    sigma,
    kRatio,
    radius,
  )

  // Pass 2: weighted difference, binarized at the user threshold. This is
  // Acerola's `D = (blur.x - τ·blur.y) >= _Threshold ? 1 : 0`.
  const mask = new Float32Array(gray.length)
  for (let i = 0; i < gray.length; i++) {
    mask[i] = blurA[i] - tau * blurB[i] >= dogThreshold ? 1 : 0
  }

  // Pass 3a: separable Scharr on the binary mask — store Gx, Gy fields so we
  // can run non-maximum suppression in 3b.
  //   Gx = [-3 0 3; -10 0 10; -3 0 3]
  //   Gy = [-3 -10 -3; 0 0 0; 3 10 3]
  const gxField = new Float32Array(mask.length)
  const gyField = new Float32Array(mask.length)
  for (let y = 1; y < srcHeight - 1; y++) {
    const rowAbove = (y - 1) * srcWidth
    const rowCur = y * srcWidth
    const rowBelow = (y + 1) * srcWidth
    for (let x = 1; x < srcWidth - 1; x++) {
      const tl = mask[rowAbove + x - 1]
      const tc = mask[rowAbove + x]
      const tr = mask[rowAbove + x + 1]
      const ml = mask[rowCur + x - 1]
      const mr = mask[rowCur + x + 1]
      const bl = mask[rowBelow + x - 1]
      const bc = mask[rowBelow + x]
      const br = mask[rowBelow + x + 1]
      gxField[rowCur + x] = -3 * tl + 3 * tr - 10 * ml + 10 * mr - 3 * bl + 3 * br
      gyField[rowCur + x] = -3 * tl - 10 * tc - 3 * tr + 3 * bl + 10 * bc + 3 * br
    }
  }

  // Pass 3b: non-maximum suppression. For each edge pixel, look at its two
  // neighbors along the gradient direction (rounded to the nearest 45°) and
  // keep this pixel only if its magnitude is ≥ both. Thins the 2-3 px wide
  // edge band the binary DoG leaves behind, eliminating the "double slash"
  // artifact where both sides of a thick edge get marked. Standard Canny step.
  // We compute mag² (no sqrt) since we only need ordinal comparisons.

  // Tile geometry: glyph cells are exactly 8×8 src pixels because
  // processImageData resampled the source to (cols*8 × rows*8). Each cell
  // therefore has 64 pixels, matching Acerola's 8×8 compute workgroup.
  const cellPx = 8
  const cellCounts = new Int32Array(cols * rows * 4)

  for (let y = 1; y < srcHeight - 1; y++) {
    const rowCur = y * srcWidth
    const cellY = Math.min(rows - 1, (y / cellPx) | 0)
    for (let x = 1; x < srcWidth - 1; x++) {
      const i = rowCur + x
      const gx = gxField[i]
      const gy = gyField[i]

      // HLSL's `1 - isnan(atan2(0,0))` flag — in JS Math.atan2(0,0) returns 0,
      // so we have to test the inputs directly instead.
      if (gx === 0 && gy === 0) continue

      // NMS — pick the two neighbors along the gradient direction. Round the
      // angle to the nearest 45° so the offset is one of 8 cardinal/diagonal
      // unit vectors.
      const absGx = gx < 0 ? -gx : gx
      const absGy = gy < 0 ? -gy : gy
      const sx = gx < 0 ? -1 : 1
      const sy = gy < 0 ? -1 : 1
      let dx: number
      let dy: number
      // tan(22.5°) ≈ 0.4142. We approximate with 0.4 to bias the cardinal
      // (E/W/N/S) wedges very slightly wider, which matches the DoG mask's
      // tendency to produce axis-aligned edges most cleanly.
      if (absGy < 0.4 * absGx) {
        dx = sx
        dy = 0
      } else if (absGx < 0.4 * absGy) {
        dx = 0
        dy = sy
      } else {
        dx = sx
        dy = sy
      }
      const mag2 = gx * gx + gy * gy
      const fwd = i + dy * srcWidth + dx
      const bwd = i - dy * srcWidth - dx
      const gxF = gxField[fwd]
      const gyF = gyField[fwd]
      const gxB = gxField[bwd]
      const gyB = gyField[bwd]
      if (mag2 < gxF * gxF + gyF * gyF) continue
      if (mag2 < gxB * gxB + gyB * gyB) continue

      // Quantize angle into a glyph direction. Acerola's tight-band scheme.
      const theta = Math.atan2(gy, gx)
      const absTheta = Math.abs(theta) / Math.PI

      let dir = -1
      if (absTheta <= 0.05 || absTheta > 0.9) {
        dir = 0 // vertical edge `|`
      } else if (absTheta > 0.45 && absTheta < 0.55) {
        dir = 1 // horizontal edge `_`
      } else if (absTheta > 0.05 && absTheta < 0.45) {
        // θ near +π/4 → gradient down-right → edge `/` (dir 2)
        // θ near −π/4 → gradient up-right   → edge `\` (dir 3)
        dir = theta > 0 ? 2 : 3
      } else if (absTheta > 0.55 && absTheta < 0.9) {
        // θ near +3π/4 → gradient down-left → edge `\` (dir 3)
        // θ near −3π/4 → gradient up-left   → edge `/` (dir 2)
        dir = theta > 0 ? 3 : 2
      }
      if (dir < 0) continue

      const cellX = Math.min(cols - 1, (x / cellPx) | 0)
      cellCounts[(cellY * cols + cellX) * 4 + dir] += 1
    }
  }

  // Per-tile vote, matching Acerola's groupshared histogram + maxBucket logic,
  // but explicitly ignoring the -1 ("no direction") entries that Acerola's
  // shader leaks into `buckets[-1]` via undefined indexing.
  const tileThreshold = Math.max(0, Math.floor(preprocessing.sobelTileThreshold))
  const edges: EdgeData = {}
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const base = (cy * cols + cx) * 4
      let bestDir = -1
      let bestCount = 0
      for (let d = 0; d < 4; d++) {
        const c = cellCounts[base + d]
        if (c > bestCount) {
          bestCount = c
          bestDir = d
        }
      }
      if (bestDir >= 0 && bestCount >= tileThreshold) {
        if (!edges[cx]) edges[cx] = {}
        edges[cx][cy] = EDGE_CHARS[bestDir]
      }
    }
  }
  return edges
}

function applyBayer(data: Uint8ClampedArray, width: number, height: number) {
  // 8x8 Bayer matrix implementation
  const bayerMatrix = [
    [0, 48, 12, 60, 3, 51, 15, 63],
    [32, 16, 44, 28, 35, 19, 47, 31],
    [8, 56, 4, 52, 11, 59, 7, 55],
    [40, 24, 36, 20, 43, 27, 39, 23],
    [2, 50, 14, 62, 1, 49, 13, 61],
    [34, 18, 46, 30, 33, 17, 45, 29],
    [10, 58, 6, 54, 9, 57, 5, 53],
    [42, 26, 38, 22, 41, 25, 37, 21],
  ]

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      const gray = Math.round(
        0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2],
      )

      const tx = x % 8
      const ty = y % 8
      const threshold = (bayerMatrix[ty][tx] / 64) * 255

      const newGray = gray < threshold ? 0 : 255

      data[idx] = newGray
      data[idx + 1] = newGray
      data[idx + 2] = newGray
    }
  }
}

// GIF handling
function handleGifExtraction(
  imageData: string,
  settings: AsciiSettings,
  resolve: (value: ImageProcessingResult) => void,
) {
  const img = new Image()
  img.onload = async () => {
    try {
      const initialFrame = await extractFirstGifFrame(img, settings)
      const frames = await extractMultipleGifFrames(img, initialFrame, settings)

      resolve({
        data: initialFrame.data,
        edgeData: initialFrame.edgeData,
        width: settings.output.columns,
        height: settings.output.rows,
        processedImageUrl: initialFrame.processedImageUrl,
        frames,
        frameCount: frames.length,
        sourceFps: 10, // Default assumption for GIFs
      })
    } catch (error) {
      console.error('Error processing GIF:', error)
      resolve(createFallbackResponse(settings))
    }
  }

  img.onerror = (error) => {
    console.error('Error loading GIF:', error)
    resolve(createFallbackResponse(settings))
  }

  img.src = imageData
}

async function extractFirstGifFrame(img: HTMLImageElement, settings: AsciiSettings) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!

  canvas.width = img.width
  canvas.height = img.height

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  return await processImageData(canvas, settings)
}

async function extractMultipleGifFrames(
  img: HTMLImageElement,
  initialFrame: { data: AsciiImageData; processedImageUrl?: string },
  settings: AsciiSettings,
): Promise<AsciiImageData[]> {
  const frames: AsciiImageData[] = [initialFrame.data]
  const totalFrames = Math.min(24, settings.animation.animationLength)

  try {
    for (let i = 1; i < totalFrames; i++) {
      const frameImg = new Image()
      frameImg.crossOrigin = 'Anonymous'

      const frameData = await loadGifFrame(frameImg, img, i, initialFrame, settings)

      if (frameData && Object.keys(frameData).length > 0) {
        frames.push(frameData)
      }
    }
  } catch (error) {
    console.error('Error extracting GIF frames:', error)
    // If extraction fails and we have no frames, create duplicates of first frame
    if (frames.length <= 1) {
      for (let i = 1; i < totalFrames; i++) {
        frames.push(JSON.parse(JSON.stringify(initialFrame.data)))
      }
    }
  }

  // Ensure we have at least one frame
  if (frames.length === 0) {
    frames.push(initialFrame.data)
  }

  return frames
}

async function loadGifFrame(
  frameImg: HTMLImageElement,
  originalImg: HTMLImageElement,
  frameIndex: number,
  initialFrame: { data: AsciiImageData; processedImageUrl?: string },
  settings: AsciiSettings,
): Promise<AsciiImageData> {
  return new Promise((resolveFrame) => {
    frameImg.onload = async () => {
      const frameCanvas = document.createElement('canvas')
      const frameCtx = frameCanvas.getContext('2d')

      if (!frameCtx) {
        resolveFrame({})
        return
      }

      frameCanvas.width = frameImg.width
      frameCanvas.height = frameImg.height

      frameCtx.drawImage(frameImg, 0, 0, frameCanvas.width, frameCanvas.height)

      const processed = await processImageData(frameCanvas, settings)
      resolveFrame(processed.data)
    }

    frameImg.onerror = () => {
      resolveFrame(initialFrame.data)
    }

    // Try to force browser to reload the image with cache bypass
    const cacheBuster = `?frame=${frameIndex}&t=${Date.now()}`
    frameImg.src = originalImg.src + cacheBuster
  })
}
