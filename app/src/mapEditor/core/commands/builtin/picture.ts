import type { CommandCatalogEntry, CommandField, SentenceParts } from '../catalogTypes.ts';
import { field, framesPhrase, withNotes } from './fieldHelpers.ts';
import { BLEND_MODES, DIRECT_VARIABLES, EASINGS, PICTURE_ORIGINS } from './options.ts';

/**
 * The fields a picture's placement shares between Show Picture and Move Picture: its anchor, position, scale,
 * opacity and blend.
 * @returns {CommandField[]} The fields, from parameter 2 to 9.
 */
const placementFields = (): CommandField[] =>
{
  return [
    field('origin', 'Origin', 2, 'select', { options: PICTURE_ORIGINS, default: 0 }),
    field('designation', 'Position', 3, 'select', { options: DIRECT_VARIABLES, default: 0 }),
    field('x', 'X', 4, 'number', { default: 0, visibleWhen: { field: 'designation', equals: 0 } }),
    field('y', 'Y', 5, 'number', { default: 0, visibleWhen: { field: 'designation', equals: 0 } }),
    field('xVariable', 'X from', 4, 'variable', { default: 1, visibleWhen: { field: 'designation', equals: 1 } }),
    field('yVariable', 'Y from', 5, 'variable', { default: 1, visibleWhen: { field: 'designation', equals: 1 } }),
    field('scaleX', 'Width %', 6, 'number', { min: -2000, max: 2000, default: 100 }),
    field('scaleY', 'Height %', 7, 'number', { min: -2000, max: 2000, default: 100 }),
    field('opacity', 'Opacity', 8, 'number', { min: 0, max: 255, default: 255 }),
    field('blend', 'Blend', 9, 'select', { options: BLEND_MODES, default: 0 }),
  ];
};

/**
 * Says where a picture sits.
 * @param {SentenceParts} parts The command's parts, with {@link placementFields}.
 * @returns {string} Such as "(0, 0)" or "(#0003, #0004)".
 */
const positionPhrase = (parts: SentenceParts): string =>
{
  return parts.value('designation') === 1
    ? `(${parts.text('xVariable')}, ${parts.text('yVariable')})`
    : `(${parts.text('x')}, ${parts.text('y')})`;
};

/**
 * The field naming which picture a command acts on.
 */
const PICTURE_NUMBER = field('picture', 'Picture number', 0, 'number', { min: 1, max: 100, default: 1 });

/**
 * The Picture group: showing, moving, rotating, tinting and erasing pictures.
 */
const PICTURE_ENTRIES: readonly CommandCatalogEntry[] = [
  {
    id: 'core:231',
    code: 231,
    name: 'Show Picture',
    category: 'Picture',
    keywords: [ 'picture', 'image', 'cg', 'portrait', 'bust', 'show image' ],
    fields: [
      PICTURE_NUMBER,
      field('name', 'Image', 1, 'image', { folder: 'pictures', default: '' }),
      ...placementFields(),
    ],
    sentence: parts => `Show picture #${parts.text('picture')}: ${parts.text('name') || 'None'} at ${positionPhrase(parts)}`,
    defaultParameters: [ 1, '', 0, 0, 0, 0, 100, 100, 255, 0 ],
  },
  {
    id: 'core:232',
    code: 232,
    name: 'Move Picture',
    category: 'Picture',
    keywords: [ 'picture', 'move', 'slide', 'fade', 'tween', 'image' ],
    fields: [
      PICTURE_NUMBER,
      ...placementFields(),
      field('duration', 'Duration', 10, 'number', { min: 1, max: 999, default: 60 }),
      field('wait', 'Wait for completion', 11, 'boolean', { default: true }),
      field('easing', 'Easing', 12, 'select', { options: EASINGS, default: 0 }),
    ],
    sentence: parts => withNotes(`Move picture #${parts.text('picture')} to ${positionPhrase(parts)} over ${framesPhrase(parts.value('duration'))}`, [
      parts.value('wait') === true && 'wait',
    ]),
    defaultParameters: [ 1, 0, 0, 0, 0, 0, 100, 100, 255, 0, 60, true, 0 ],
  },
  {
    id: 'core:233',
    code: 233,
    name: 'Rotate Picture',
    category: 'Picture',
    keywords: [ 'picture', 'rotate', 'spin', 'turn', 'image' ],
    fields: [
      PICTURE_NUMBER,
      field('speed', 'Speed', 1, 'number', { min: -90, max: 90, default: 0 }),
    ],
    sentence: 'Rotate picture #{picture} at speed {speed}',
    defaultParameters: [ 1, 0 ],
  },
  {
    id: 'core:234',
    code: 234,
    name: 'Tint Picture',
    category: 'Picture',
    keywords: [ 'picture', 'tint', 'tone', 'color', 'colour', 'image' ],
    fields: [
      PICTURE_NUMBER,
      field('tone', 'Tone', 1, 'color', { min: -255, max: 255, default: [ 0, 0, 0, 0 ] }),
      field('duration', 'Duration', 2, 'number', { min: 1, max: 999, default: 60 }),
      field('wait', 'Wait for completion', 3, 'boolean', { default: true }),
    ],
    sentence: parts => withNotes(`Tint picture #${parts.text('picture')} to ${parts.text('tone')} over ${framesPhrase(parts.value('duration'))}`, [
      parts.value('wait') === true && 'wait',
    ]),
    defaultParameters: [ 1, [ 0, 0, 0, 0 ], 60, true ],
  },
  {
    id: 'core:235',
    code: 235,
    name: 'Erase Picture',
    category: 'Picture',
    keywords: [ 'picture', 'erase', 'remove', 'hide', 'image' ],
    fields: [ PICTURE_NUMBER ],
    sentence: 'Erase picture #{picture}',
    defaultParameters: [ 1 ],
  },
];

export { PICTURE_ENTRIES };
