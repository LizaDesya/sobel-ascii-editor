# CLAUDE.md

Project context for future Claude sessions. Start here.

## What this is

Fork of Oxide Computer's "mitos" image-to-ASCII editor. The upstream tool converts images to ASCII via luminance density mapping. **This fork adds an Acerola-style Sobel edge algorithm** that overlays directional glyphs (`| _ / \`) on top of the density pass, ported from Garrett Gunnell's [AcerolaFX_ASCII.fx](https://github.com/GarrettGunnell/AcerolaFX/blob/main/Shaders/AcerolaFX_ASCII.fx) HLSL shader (the one from his "I Tried Turning Games Into Text" video). Goal: faithful CPU-side port of the image-only path of that shader.

The original AcerolaFX repo is cloned locally to `AcerolaFX-main/` for reference. `.gitignore`'d. Treat it as read-only — it's the spec.

## Quickstart

```sh
bun install              # or `npm install`
bun run dev              # vite dev server
bun run tsc              # type-check (uses pinned typescript 5.7.2)
bun run lint             # eslint
```

Bun is the canonical runtime. On Windows without bun on PATH, use `npx --package=typescript@5.7.2 tsc --noEmit` for type-checks.

## How to test the Sobel algorithm

1. `bun run dev`, open the URL it prints.
2. Drag `test-images/ascii-test-1.png` onto the canvas (or use the "Upload image" demo card).
3. Defaults should already be: algorithm = Sobel, charset = acerola, 400 × 110, σ=2.0, k=1.6, τ=1.0, threshold=0.005, kernel=2, tile=8. If not, the file is `app/templates.ts → DEFAULT_SETTINGS`.
4. Compare against Acerola's video stills around the 3-4 minute mark. Vertical building/mast edges should be `|`, sloped rooflines `/` or `\`, horizon transitions `_`.
5. Reference: `AcerolaFX-main/acerola-transcript.md` is the full YouTube transcript, useful for verifying algorithm intent vs. what the shader actually does (they sometimes disagree — the shader is authoritative).

Quick sanity sweep for parameter behavior:

| Slider | Try | Expected |
| --- | --- | --- |
| `sobelDogSigma` | 0.5 → 5 | Broader, smoother contours as σ grows. |
| `sobelDogTau` | 0 → 1.1 | 0 makes the DoG mask vanish; 1.0 is Acerola default; 1.1 widens edges. |
| `sobelDogK` | 1.0 → 3.0 | Bandpass width. 1.6 = canonical Mexican-hat. |
| `sobelDogThreshold` | 0.001 → 0.05 | Gates how much of the image counts as edge-candidate. |
| `sobelKernelSize` | 1 → 10 | Half-width of the Gaussian. Higher = slower, smoother. |
| `sobelTileThreshold` | 0 → 64 | Of 64 px per 8×8 cell, min directional-pixel count to emit an edge glyph. |

## The algorithm (faithful port of AcerolaFX_ASCII.fx)

All in [app/lib/image-processor.ts](app/lib/image-processor.ts) → `computeSobelEdges`. Pipeline:

1. **Resample** the preprocessed source to `(cols·8 × rows·8)` in `processImageData` so every glyph tile is exactly 64 pixels. Matches Acerola's 8×8 compute workgroup.
2. **Luminance** to `[0, 1]` via Rec. 601 (`toGrayscale`).
3. **Two separable Gaussian blurs** at σ and σ·k, kernel half-width `sobelKernelSize` (`gaussianBlurPair`).
4. **Binarized DoG**: `mask = (blurA - τ·blurB) ≥ threshold ? 1 : 0`. This is Acerola's `PS_VerticalBlurAndDifference`. The binarization is critical — running Sobel on a continuous DoG produces near-zero gradients that fail any reasonable threshold (this was the original bug that hid edges entirely).
5. **Separable Scharr** (`[3, 10, 3]` / `[3, 0, -3]`) on the binary mask → `gxField`, `gyField`. Note: Acerola's shader has a literal typo `Gy = 3 + lum1 + …`; correct form is `3 * lum1`. Don't replicate.
6. **Non-maximum suppression** (Canny-style, our addition, not in Acerola). Round each pixel's gradient direction to nearest 45°, keep the pixel only if its `Gx²+Gy²` ≥ both neighbors along that axis. Suppresses the "double slash" doubling that appears because the binary DoG produces a 2-3 px wide edge band whose two sides have opposite-sign Scharr response.
7. **Angle quantization** into 4 directions via Acerola's tight-band scheme:
   - `|θ|/π ∈ [0, 0.05] ∪ (0.9, 1]` → `|`
   - `|θ|/π ∈ (0.45, 0.55)` → `_`
   - `|θ|/π ∈ (0.05, 0.45)` → `/` if θ>0 else `\`
   - `|θ|/π ∈ (0.55, 0.9)` → `\` if θ>0 else `/`
8. **Per-tile vote** over the 64 pixels of each 8×8 cell. If the dominant direction count ≥ `sobelTileThreshold`, emit that glyph in `EdgeData[col][row]`. Unlike Acerola, we explicitly skip the `-1` (no-direction) entries when tallying — Acerola's shader leaks those into `buckets[-1]` via undefined indexing.

### Why our direction-to-glyph table differs from Acerola's source

Acerola's `edgesASCII.png` texture stores glyphs in order `| - / \` (cols 8/16/24/32), but the shader samples it with `localUV.y = 8 - (tid.y % 8)` — a vertical flip that mirrors each glyph on screen. A vertically-mirrored `/` is `\`, and vice versa. We render through a real font (no texture flip), so Acerola's literal `direction = sign(theta) > 0 ? 3 : 2` mapping in HLSL would put slashes the wrong way around. Our bin assignment is derived from first principles in screen-Y-down coordinates instead — see the comments in `computeSobelEdges`.

## Edge overlay rendering

`EdgeData` is a sparse 2D map `{ [col]: { [row]: char } }` populated only at cells where an edge was confidently detected. The overlay is **not** in user code — it happens in [ascii-program.ts](app/lib/ascii-program.ts) → `createProgramFromProcessor`. The wrapped `main` runs the user's `main()` to get a luminance-density char, then if the cell has an edge override in `EdgeData`, replaces `result.char` with the edge glyph. Activated only when `settings.preprocessing.algorithm === 'sobel'` (gated in [ascii-art-generator.tsx](app/components/ascii-art-generator.tsx) before passing `edgeOverlay`).

Doing the overlay in the program wrapper (instead of in `generateImageCode()`) means edges work for all three of: freshly generated code, old generated code, and arbitrary user code.

## Reprocessing — when the preview re-renders

Two layers, both in [ascii-art-generator.tsx](app/components/ascii-art-generator.tsx):

1. `useEffect` keyed on `settings` calls `processCurrentSettings()` when `getRelevantSettings(prev)` deep-differs from `getRelevantSettings(next)`. `getRelevantSettings` passes the entire `preprocessing` object, so any preprocessing field change triggers it.
2. Inside `processCurrentSettings`, `haveProcessingSettingsChanged()` decides whether to actually rerun `processImage` (image pipeline) vs. just re-evaluate user code against the cached `currentImageData` / `currentEdgeData`.

**If you add a new preprocessing field that affects the pixel output, add it to `haveProcessingSettingsChanged()` or the image won't reprocess.**

## Key files

- [app/lib/image-processor.ts](app/lib/image-processor.ts) — image pipeline, `computeSobelEdges`, `gaussianBlurPair`, `toGrayscale`. The Sobel algorithm lives here.
- [app/lib/ascii-program.ts](app/lib/ascii-program.ts) — `createProgramFromProcessor` wraps the user program and applies the edge overlay.
- [app/lib/types.ts](app/lib/types.ts) — `AsciiImageData`, `EdgeData`. Tiny.
- [app/lib/localUtils/image.ts](app/lib/localUtils/image.ts) — `valueToChar`, `getImageValue`, `getEdgeChar`. **Public surface for user scripts** — renaming or changing signatures will silently break user projects.
- [app/components/ascii-art-generator.tsx](app/components/ascii-art-generator.tsx) — top-level state, `AsciiSettings` type, reprocessing effect.
- [app/components/preprocessing-options.tsx](app/components/preprocessing-options.tsx) — Sobel sliders.
- [app/components/output-options.tsx](app/components/output-options.tsx) — `predefinedCharacterSets` (incl. `acerola: ' .icoP0?@■'`).
- [app/templates.ts](app/templates.ts) — `DEFAULT_SETTINGS` and demo templates.
- [app/components/ascii-preview.tsx](app/components/ascii-preview.tsx) — preview viewport with zoom/pan/auto-fit.
- [AcerolaFX-main/](AcerolaFX-main/) — the upstream shader source, gitignored, treat as read-only reference. The relevant file is `Shaders/AcerolaFX_ASCII.fx`. `acerola-transcript.md` is the YouTube transcript.

## Settings shape

`AsciiSettings.preprocessing` in [ascii-art-generator.tsx](app/components/ascii-art-generator.tsx#L54):

| Field | Default | Range | Acerola uniform |
| --- | --- | --- | --- |
| `algorithm` | `'sobel'` | `'standard' \| 'sobel'` | n/a |
| `sobelDogSigma` | 2.0 | 0.1–5 | `_Sigma` |
| `sobelDogK` | 1.6 | 1–5 | `_SigmaScale` |
| `sobelDogTau` | 1.0 | 0–1.1 | `_Tau` |
| `sobelDogThreshold` | 0.005 | 0.001–0.1 | `_Threshold` |
| `sobelKernelSize` | 2 | 1–10 | `_KernelSize` |
| `sobelTileThreshold` | 8 | 0–64 | `_EdgeThreshold` |

## Pending work — TODOs

In rough priority order. Listed here so a future session can pick up cleanly.

### Algorithm fidelity / quality

- **[P2] Hysteresis thresholding (Canny dual-threshold).** Two DoG cutoffs (high/low); high-threshold pixels are definite edges, low-threshold pixels only count if they're 8-connected to a high one. Cuts speckle noise without losing weak connected contours. Insert between the binarize step and the Scharr pass; need a small flood-fill or two-pass labeling.
- **[P2] Edge tangent flow (ETF).** Acerola implements this in his *separate* `AcerolaFX_DifferenceOfGaussians.fx` shader (not the ASCII one), but it's the strongest known improvement for hair/fabric/wood-grain scenes. Adds a structure-tensor pass + flow-aligned DoG. Bigger lift; defer unless we want hair to look perfect.
- **[P3] Monocular depth estimation.** For 2D-image input, run something like MiDaS (ONNX, ~10 MB) once per upload to produce a depth map, then enable Acerola's `PS_CalculateNormals` + `PS_EdgeDetect` depth/normal branch. Would let us draw edges on objects with no luminance contrast (e.g. blonde hair against bright sky). Heavyweight integration — onnxruntime-web in the bundle.
- **[P3] LAB-space luminance.** Marginal perceptual improvement over Rec. 601 for fill characters. Easy to add in `toGrayscale`.
- **[P3] Fill quantization match.** Acerola uses `lum = max(0, floor(lum*10) - 1) / 10`, which collapses buckets 0 and 1 so the darkest character only appears for genuinely-dark pixels. We use `floor(value * (charSet.length - 1))` straight. For exact byte parity in fill regions, port the clamp into `valueToChar` when `algorithm === 'sobel'`.

### UX / perf

- **[P1] Preview viewport cropping at large dimensions.** Already partially fixed in [ascii-preview.tsx](app/components/ascii-preview.tsx) (flex-center + overflow → flex-center inside a min-h-full/min-w-full wrapper), but the user reported it still misbehaves at 400+. Probable culprits: `overflow-hidden` on the inner `transform-gpu` wrapper, or the `transform: scale(...)` not contributing to scroll content size. Likely fix: ditch CSS transform for zoom in favor of explicit width/height scaling on the inner element.
- **[P2] Cap or downsample the Sobel resample at very high resolutions.** At `cols=1000`, `processImageData` resamples to 8000×8000 = 64 MP and allocates several Float32Arrays the same size (~256 MB transient). Could clamp to `min(cols, 200)*8` for the Sobel pipeline only, since the per-tile vote averages anyway.
- **[P2] Optional debug overlays mirroring Acerola's `_ViewDog` / `_ViewEdges` / `_ViewUncompressed`.** Render the binarized DoG, the per-pixel direction bin, or the NMS result as a preview image. Useful for tuning.
- **[P3] `drawEdges` / `drawFill` UI toggles** mirroring Acerola's `_Edges` / `_Fill`. Trivial.

### Code health

- **[P3] Remove `// mc` placeholder comment in the Scharr.** Now that 3a writes the gradient fields and 3b does NMS+bin, the original "mc unused" comment is stale. The center pixel is genuinely unused in the separable Scharr by construction — note that more concisely.
- **[P3] `handleLoadProject` exhaustive-deps warning** in [ascii-art-generator.tsx:701](app/components/ascii-art-generator.tsx#L701). Pre-existing, not introduced by this work.

## Gotchas (will trip you up if you don't know)

- **The `before.md` / `after.md` smoke test.** Earlier diagonals were rendered with the wrong slash. The fix needs **exactly one** of (a) swap `EDGE_CHARS[2]`/`[3]`, or (b) swap the `theta > 0 ? 3 : 2` ternary. Doing **both** cancels out — I made that mistake. The current code keeps `EDGE_CHARS = ['|', '_', '/', '\\']` and uses the corrected ternaries. Verify by counting `/` vs. `\` before and after a change — if the counts are nearly identical when they should swap, your fix double-flipped.
- **Acerola's HLSL `atan2(0, 0) = NaN`; JS `Math.atan2(0, 0) = 0`.** Acerola gates on `1 - isnan(theta)`; we have to gate on `Gx === 0 && Gy === 0` explicitly. If you remove that guard, flat regions of the binary mask will all be assigned direction 0 (vertical) and the histogram collapses.
- **The two image-bucket caches.** For >10 frames, image data goes into `window.__MITOS_IMAGE_DATA` / `__MITOS_FRAMES` / `__MITOS_EDGE_DATA` / `__MITOS_EDGE_FRAMES` instead of being embedded in compiled JS (would bloat the bundle). `clearStaleImageData()` resets these. If you add a new processed-data type, you probably need a new bucket and a new clear-call.
- **`AcerolaFX_DifferenceOfGaussians.fx` is a different shader.** It's the artistic NPR DoG shader, not part of the ASCII path. `AcerolaFX_EdgeDetect.fx` is depth-only edges, also not directly relevant. The entire ASCII pipeline (including its embedded DoG/edge-detect/Sobel passes) lives in `AcerolaFX_ASCII.fx` alone.
- **The shader's edge-LUT Y-flip** (`localUV.y = 8 - (tid.y % 8)`) is irrelevant to us — we render through a real font — but it changes what direction-index → glyph mapping you'd derive from reading the texture file directly. Always reason from first principles in screen-Y-down coordinates, not from the texture file.
- **`generateImageCode()` is only called once per image.** New capabilities added there won't benefit existing projects. Prefer the program wrapper in `createProgramFromProcessor`.
- **Public user-script surface.** `valueToChar`, `getImageValue`, `getEdgeChar`, `imageData`, `frames`, `edgeData`, `edgeFrames`, `characterSet` are all referenced in user code in templates and saved projects. Renaming = silent breakage.

## What's intentionally not implemented

For an image-only port, these Acerola features are dead weight (the shader needs them for 3D scenes):

- `PS_CalculateNormals` + the depth/normal branch of `PS_EdgeDetect`. We pass `output = 0` implicitly, so `Edges = D` (the binarized DoG alone).
- `_DepthThreshold`, `_NormalThreshold`, `_DepthCutoff`, `_DepthFalloff`, `_DepthOffset`. All depth-buffer dependent.
- `_Exposure`, `_Attenuation`, `_InvertLuminance`, `_ASCIIColor`, `_BackgroundColor`, `_BlendWithBase`. These are post-processing tweaks on the fill pass; we expose color/contrast controls elsewhere in the app already.
- `_Zoom`, `_Offset`. The preview already has its own zoom/pan.

If you ever wire up monocular depth estimation (see TODOs), the first four lines become relevant — port the depth/normal pass from `AcerolaFX_ASCII.fx` lines 319–379.
