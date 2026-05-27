/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Copyright Oxide Computer Company
 */
import { Algorithm, DitheringAlgorithm } from '~/lib/image-processor'
import { InputSwitch } from '~/lib/ui/src'
import { InputNumber } from '~/lib/ui/src/components/InputNumber/InputNumber'
import { InputSelect } from '~/lib/ui/src/components/InputSelect/InputSelect'

import { Container } from './container'

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
  }
  updateSettings: (
    settings: Partial<{
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
    }>,
  ) => void
}

export function PreprocessingOptions({
  settings,
  updateSettings,
}: PreprocessingOptionsProps) {
  return (
    <Container>
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

      <InputSelect<Algorithm>
        value={settings.algorithm}
        onChange={(value) => updateSettings({ algorithm: value as Algorithm })}
        options={['standard', 'sobel']}
        labelize={(algorithm) => {
          switch (algorithm) {
            case 'standard':
              return 'Standard'
            case 'sobel':
              return 'Sobel'
            default:
              return algorithm
          }
        }}
      >
        Algorithm
      </InputSelect>

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
    </Container>
  )
}
