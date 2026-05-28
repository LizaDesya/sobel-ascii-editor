/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Copyright Oxide Computer Company
 */
import { useEffect, useState } from 'react'

import { Algorithm, DitheringAlgorithm } from '~/lib/image-processor'
import { InputButton, InputSwitch } from '~/lib/ui/src'
import { InputNumber } from '~/lib/ui/src/components/InputNumber/InputNumber'
import { InputSelect } from '~/lib/ui/src/components/InputSelect/InputSelect'
import { InputText } from '~/lib/ui/src/components/InputText/InputText'
import { PencilIcon } from '~/assets/icons/PencilIcon'

import type { PlacementMode } from './ascii-art-generator'
import { Container } from './container'
import { predefinedCharacterSets } from './output-options'

type CharacterSet = keyof typeof predefinedCharacterSets | 'custom'

const characterSets: CharacterSet[] = [
  'acerola',
  'standard',
  'light',
  'boxes',
  'binaryBoxes',
  'binary',
  'binaryDirection',
  'steps',
  'intersect',
  'numbers',
  'custom',
]

const findMatchingCharacterSet = (characterSet: string): CharacterSet => {
  for (const [key, value] of Object.entries(predefinedCharacterSets)) {
    if (value === characterSet) {
      return key as CharacterSet
    }
  }
  return 'custom'
}

interface PreprocessingOptionsProps {
  drawMode: boolean
  brushChar: string
  onDrawModeChange: (active: boolean) => void
  onBrushCharChange: (char: string) => void
  onResetDrawing: () => void
  settings: {
    brightness: number
    contrast: number
    whitePoint: number
    blackPoint: number
    blur: number
    invert: boolean
    dithering: boolean
    ditheringAlgorithm: DitheringAlgorithm
    algorithm: Algorithm
    edgeSmoothness: number
    edgeSensitivity: number
    edgeDensity: number
    placementMode: PlacementMode
    shapeContrast: number
    shapeBlankSpace: boolean
  }
  updateSettings: (
    settings: Partial<PreprocessingOptionsProps['settings']>,
  ) => void
  characterSet: string
  onCharacterSetChange: (characterSet: string) => void
}

export function PreprocessingOptions({
  settings,
  updateSettings,
  characterSet,
  onCharacterSetChange,
  drawMode,
  brushChar,
  onDrawModeChange,
  onBrushCharChange,
  onResetDrawing,
}: PreprocessingOptionsProps) {
  const [selectedCharSet, setSelectedCharSet] = useState<CharacterSet>('standard')

  useEffect(() => {
    setSelectedCharSet(findMatchingCharacterSet(characterSet))
  }, [characterSet])

  const handleCharacterSetChange = (value: string) => {
    setSelectedCharSet(value as CharacterSet)
    if (value === 'custom') return
    onCharacterSetChange(
      predefinedCharacterSets[value as keyof typeof predefinedCharacterSets],
    )
  }

  const handleCustomCharacterSetChange = (val: string) => {
    onCharacterSetChange(val)
    setSelectedCharSet('custom')
  }

  return (
    <Container>
      <InputSelect<PlacementMode>
        value={settings.placementMode}
        onChange={(value) => updateSettings({ placementMode: value })}
        options={['value', 'shape']}
        labelize={(mode) => (mode === 'value' ? 'Value' : 'Shape')}
      >
        Placement mode
      </InputSelect>

      {/* Draw tool */}
      <div className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-wider text-secondary">Draw</div>
        <div className="flex items-center gap-2">
          <InputButton
            variant={drawMode ? 'default' : 'secondary'}
            icon
            onClick={() => onDrawModeChange(!drawMode)}
            className="!w-8 shrink-0"
          >
            <PencilIcon className="h-3.5 w-3.5" />
          </InputButton>
          <input
            type="text"
            maxLength={1}
            value={brushChar}
            onChange={(e) => {
              const val = e.target.value
              if (val.length === 0) return
              const ch = val[val.length - 1]
              const code = ch.charCodeAt(0)
              // Restrict to printable ASCII — non-ASCII glyphs (e.g. ✚) fall back to
              // a non-monospace font and shove the rest of the row right.
              if (code >= 0x20 && code <= 0x7e) onBrushCharChange(ch)
            }}
            className="h-8 w-full rounded border bg-transparent px-2 font-mono text-sm text-default border-default focus:outline-none focus:ring-1 focus:ring-[--mt-highlight]"
          />
        </div>
        <InputButton variant="secondary" onClick={onResetDrawing}>
          Reset drawing
        </InputButton>
        <p className="text-xs text-tertiary">
          Changing canvas resolution will remove all drawn changes.
        </p>
      </div>

      {/* Contrast — value mode uses pixel-level contrast, shape mode uses shape-vector contrast */}
      {settings.placementMode === 'value' && (
        <InputNumber
          min={0.5}
          max={3}
          step={0.05}
          value={settings.contrast}
          onChange={(value) => updateSettings({ contrast: value })}
        >
          Contrast
        </InputNumber>
      )}

      {settings.placementMode === 'shape' && (
        <InputNumber
          min={1}
          max={5}
          step={0.1}
          value={settings.shapeContrast}
          onChange={(value) => updateSettings({ shapeContrast: value })}
        >
          Contrast
        </InputNumber>
      )}

      <InputNumber
        min={-255}
        max={255}
        value={settings.brightness}
        onChange={(value) => updateSettings({ brightness: value })}
      >
        Brightness
      </InputNumber>

      {/* <InputNumber
        min={0}
        max={255}
        value={settings.whitePoint}
        onChange={(value) => updateSettings({ whitePoint: value })}
      >
        White point
      </InputNumber>

      <InputNumber
        min={0}
        max={255}
        value={settings.blackPoint}
        onChange={(value) => updateSettings({ blackPoint: value })}
      >
        Black point
      </InputNumber>

      <InputNumber
        min={0}
        max={20}
        step={0.1}
        value={settings.blur}
        onChange={(value) => updateSettings({ blur: value })}
        disabled
      >
        Blur
      </InputNumber> */}

      {/* Value mode: Edge Detection sits above Invert */}
      {settings.placementMode === 'value' && (
        <>
          <InputSwitch
            checked={settings.algorithm === 'sobel'}
            onChange={(checked) =>
              updateSettings({ algorithm: checked ? 'sobel' : 'standard' })
            }
          >
            Edge Detection
          </InputSwitch>

          {settings.algorithm === 'sobel' && (
            <div className="dedent">
              <InputNumber
                min={0.1}
                max={5}
                step={0.1}
                value={settings.edgeSmoothness}
                onChange={(value) => updateSettings({ edgeSmoothness: value })}
              >
                Edge Smoothness
              </InputNumber>

              <InputNumber
                min={0}
                max={100}
                step={1}
                value={settings.edgeSensitivity}
                onChange={(value) => updateSettings({ edgeSensitivity: value })}
              >
                Sensitivity
              </InputNumber>

              <InputNumber
                min={0}
                max={100}
                step={1}
                value={settings.edgeDensity}
                onChange={(value) => updateSettings({ edgeDensity: value })}
              >
                Edge Density
              </InputNumber>
            </div>
          )}
        </>
      )}

      <InputSwitch
        checked={settings.invert}
        onChange={(checked) => updateSettings({ invert: checked })}
      >
        Invert Colors
      </InputSwitch>

      {settings.placementMode === 'value' && (
        <>
          <InputSwitch
            checked={settings.dithering}
            onChange={(checked) => updateSettings({ dithering: checked })}
          >
            Dithering
          </InputSwitch>

          {settings.dithering && (
            <div className="dedent">
              <InputSelect
                value={settings.ditheringAlgorithm}
                onChange={(value) =>
                  updateSettings({ ditheringAlgorithm: value as DitheringAlgorithm })
                }
                options={['floydSteinberg', 'atkinson', 'ordered', 'bayer']}
                labelize={(algorithm) => {
                  switch (algorithm) {
                    case 'floydSteinberg':
                      return 'Floyd-Steinberg'
                    case 'atkinson':
                      return 'Atkinson'
                    case 'ordered':
                      return 'Ordered'
                    case 'bayer':
                      return 'Bayer'
                    default:
                      return algorithm
                  }
                }}
              >
                Dithering Algorithm
              </InputSelect>
            </div>
          )}

          <InputSelect<CharacterSet>
            value={selectedCharSet}
            onChange={handleCharacterSetChange}
            options={characterSets}
            labelize={(label) => label}
            placeholder="Select a character set"
          >
            Character Set
          </InputSelect>

          <div className="dedent">
            <InputText
              value={characterSet}
              onChange={handleCustomCharacterSetChange}
              placeholder="Enter custom characters"
              className="[fontFamily:--font-mono]"
            />
          </div>
        </>
      )}

      {settings.placementMode === 'shape' && (
        <>
          <InputSwitch
            checked={settings.shapeBlankSpace}
            onChange={(checked) => updateSettings({ shapeBlankSpace: checked })}
          >
            Include spaces
          </InputSwitch>
        </>
      )}
    </Container>
  )
}
