/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Copyright Oxide Computer Company
 */
import { InputButton, InputNumber, InputSwitch } from '~/lib/ui/src'
import { InputSelect } from '~/lib/ui/src/components/InputSelect/InputSelect'

import type { ColorMappingType, GridType } from './ascii-art-generator'
import { AspectRatioInputNumber } from './aspect-ratio-input-number'
import { Container } from './container'

interface OutputOptionsProps {
  settings: {
    grid: GridType
    showUnderlyingImage: boolean
    separateBgColorEditing: boolean
    bgBrightness: number
    bgContrast: number
    bgInvert: boolean
    columns: number
    rows: number
    aspectRatio?: number
    useImageAspectRatio: boolean
    colorMapping: ColorMappingType
  }
  updateSettings: (
    settings: Partial<{
      grid: GridType
      showUnderlyingImage: boolean
      separateBgColorEditing: boolean
      bgBrightness: number
      bgContrast: number
      bgInvert: boolean
      columns: number
      rows: number
      aspectRatio?: number
      useImageAspectRatio: boolean
      colorMapping: ColorMappingType
    }>,
  ) => void
  sourceImageDimensions?: { width: number; height: number }
  onExportPixelatedImage: () => void
}

// Character-set selection lives in the Value section of `preprocessing-options.tsx`
// (it's not applicable in Shape mode). This map is still exported because
// other modules (templates, scripts) reference the preset string by name.
export const predefinedCharacterSets = {
  acerola: ' .icoP0?@■',
  standard: ' .,-~:;=!*#$@',
  light: '=-:. ',
  boxes: '█▉▊▋▌▍▎▏',
  binaryBoxes: '▊⎕ ',
  binary: '10 ',
  binaryDirection: '–| ',
  steps: ' .–=▂▄▆█',
  intersect: '└┧─┨┕┪┖┫┘┩┙┪━',
  numbers: '0123456789 ',
}

const gridOptions: GridType[] = ['none', 'horizontal', 'vertical', 'both']

const colorMappingOptions: ColorMappingType[] = ['brightness', 'hue', 'saturation']

export function OutputOptions({
  settings,
  updateSettings,
  sourceImageDimensions,
  onExportPixelatedImage,
}: OutputOptionsProps) {
  return (
    <Container>
      <AspectRatioInputNumber
        width={settings.columns}
        height={settings.rows}
        onWidthChange={(value) => updateSettings({ columns: value })}
        onHeightChange={(value) => updateSettings({ rows: value })}
        aspectRatio={settings.aspectRatio}
        aspectRatioFromImg={settings.useImageAspectRatio}
        onAspectRatioFromImgChange={(value) => {
          updateSettings({ useImageAspectRatio: value })
          if (sourceImageDimensions) {
            const aspectRatio = sourceImageDimensions.width / sourceImageDimensions.height
            updateSettings({ aspectRatio })
          }
        }}
        onAspectRatioChange={(value) => updateSettings({ aspectRatio: value })}
      />

      <InputSelect<ColorMappingType>
        value={settings.colorMapping}
        onChange={(value) => updateSettings({ colorMapping: value })}
        options={colorMappingOptions}
        labelize={(option) => {
          const labels = {
            brightness: 'Brightness',
            hue: 'Hue',
            saturation: 'Saturation',
          }
          return labels[option]
        }}
      >
        Color Mapping
      </InputSelect>

      <InputSelect<GridType>
        value={settings.grid}
        onChange={(value) => updateSettings({ grid: value })}
        options={gridOptions}
        labelize={(option) => {
          const labels = {
            none: 'No Grid',
            horizontal: 'Horizontal Lines',
            vertical: 'Vertical Lines',
            both: 'Both',
          }
          return labels[option]
        }}
      >
        Grid Lines
      </InputSelect>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <InputSwitch
            checked={settings.showUnderlyingImage}
            onChange={(checked) => updateSettings({ showUnderlyingImage: checked })}
          >
            Show Underlying Image
          </InputSwitch>
        </div>

        {settings.showUnderlyingImage && (
          <div className="dedent mt-0">
            <InputSwitch
              checked={settings.separateBgColorEditing}
              onChange={(checked) => updateSettings({ separateBgColorEditing: checked })}
            >
              Separate color editing
            </InputSwitch>

            {settings.separateBgColorEditing && (
              <div className="dedent mt-0">
                <InputNumber
                  min={-255}
                  max={255}
                  value={settings.bgBrightness}
                  onChange={(v) => updateSettings({ bgBrightness: v ?? 0 })}
                >
                  Brightness
                </InputNumber>
                <InputNumber
                  min={0.5}
                  max={3.0}
                  step={0.1}
                  value={settings.bgContrast}
                  onChange={(v) => updateSettings({ bgContrast: v ?? 1.0 })}
                >
                  Contrast
                </InputNumber>
                <InputSwitch
                  checked={settings.bgInvert}
                  onChange={(checked) => updateSettings({ bgInvert: checked })}
                >
                  Invert colors
                </InputSwitch>
              </div>
            )}

            <InputButton
              variant="secondary"
              className="mt-2 w-full"
              onClick={onExportPixelatedImage}
            >
              Export pixelated image
            </InputButton>
          </div>
        )}
      </div>
    </Container>
  )
}
