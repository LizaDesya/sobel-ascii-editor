/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Copyright Oxide Computer Company
 */
import { useEffect, useState } from 'react'

import { Algorithm, DitheringAlgorithm } from '~/lib/image-processor'
import type { ShapeLayout } from '~/lib/shape-placement'
import { InputSwitch } from '~/lib/ui/src'
import { InputNumber } from '~/lib/ui/src/components/InputNumber/InputNumber'
import { InputSelect } from '~/lib/ui/src/components/InputSelect/InputSelect'
import { InputText } from '~/lib/ui/src/components/InputText/InputText'

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
  settings: {
    brightness: number
    whitePoint: number
    blackPoint: number
    blur: number
    invert: boolean
    dithering: boolean
    ditheringAlgorithm: DitheringAlgorithm
    algorithm: Algorithm
    sobelDogSigma: number
    sobelDogK: number
    sobelDogTau: number
    sobelDogThreshold: number
    sobelKernelSize: number
    sobelTileThreshold: number
    placementMode: PlacementMode
    shapeContrast: number
    shapeBlankSpace: boolean
    shapeLayout: ShapeLayout
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

      <InputNumber
        min={-255}
        max={255}
        value={settings.brightness}
        onChange={(value) => updateSettings({ brightness: value })}
      >
        Brightness
      </InputNumber>

      <InputNumber
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
      >
        Blur
      </InputNumber>

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
                value={settings.sobelDogSigma}
                onChange={(value) => updateSettings({ sobelDogSigma: value })}
              >
                DoG sigma
              </InputNumber>

              <InputNumber
                min={1}
                max={5}
                step={0.1}
                value={settings.sobelDogK}
                onChange={(value) => updateSettings({ sobelDogK: value })}
              >
                DoG sigma scale
              </InputNumber>

              <InputNumber
                min={0}
                max={1.1}
                step={0.05}
                value={settings.sobelDogTau}
                onChange={(value) => updateSettings({ sobelDogTau: value })}
              >
                DoG tau
              </InputNumber>

              <InputNumber
                min={0.001}
                max={0.1}
                step={0.001}
                value={settings.sobelDogThreshold}
                onChange={(value) => updateSettings({ sobelDogThreshold: value })}
              >
                DoG threshold
              </InputNumber>

              <InputNumber
                min={1}
                max={10}
                step={1}
                value={settings.sobelKernelSize}
                onChange={(value) => updateSettings({ sobelKernelSize: value })}
              >
                Kernel size
              </InputNumber>

              <InputNumber
                min={0}
                max={64}
                step={1}
                value={settings.sobelTileThreshold}
                onChange={(value) => updateSettings({ sobelTileThreshold: value })}
              >
                Tile threshold
              </InputNumber>
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
          <InputSelect<ShapeLayout>
            value={settings.shapeLayout}
            onChange={(value) => updateSettings({ shapeLayout: value })}
            options={['2x3', '3x3']}
            labelize={(layout) => (layout === '2x3' ? '2×3 (6 circles)' : '3×3 (9 circles)')}
          >
            Sampling Layout
          </InputSelect>

          <InputNumber
            min={1}
            max={5}
            step={0.1}
            value={settings.shapeContrast}
            onChange={(value) => updateSettings({ shapeContrast: value })}
          >
            Contrast
          </InputNumber>

          <InputSwitch
            checked={settings.shapeBlankSpace}
            onChange={(checked) => updateSettings({ shapeBlankSpace: checked })}
          >
            Blank Space
          </InputSwitch>
        </>
      )}
    </Container>
  )
}
