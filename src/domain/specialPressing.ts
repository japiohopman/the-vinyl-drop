import { SpecialPressingCharacteristic } from '../db/schema/enums';

export const SPECIAL_PRESSING_OPTIONS: Array<{ value: SpecialPressingCharacteristic; label: string; description: string }> = [
  { value: 'picture_disc', label: 'Picture Disc', description: 'Artwork or an image printed into the record.' },
  { value: 'solid_colour', label: 'Solid colour', description: 'A single solid vinyl colour.' },
  { value: 'translucent', label: 'Translucent', description: 'Transparent or translucent coloured vinyl.' },
  { value: 'multi_colour', label: 'Multi-colour', description: 'Two or more colours, split colours or colour variants.' },
  { value: 'splatter', label: 'Splatter', description: 'Splatter-style colour finish.' },
  { value: 'marble', label: 'Marble', description: 'Marbled or cloudy colour finish.' },
  { value: 'glitter', label: 'Glitter', description: 'Glitter or sparkling particles in the vinyl.' },
  { value: 'glow_in_the_dark', label: 'Glow-in-the-dark', description: 'Vinyl that glows in the dark.' },
  { value: 'metallic', label: 'Metallic', description: 'Metallic or pearlescent finish.' },
  { value: 'shaped', label: 'Shaped', description: 'A non-standard record shape; describe the exact shape in the details field.' },
];

export function specialPressingCharacteristicLabel(value: string): string {
  return SPECIAL_PRESSING_OPTIONS.find((option) => option.value === value)?.label || value;
}
