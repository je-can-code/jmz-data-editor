import type { CommandCatalogEntry } from '../catalogTypes.ts';
import { field, framesPhrase, withNotes } from './fieldHelpers.ts';
import { WEATHERS } from './options.ts';

/**
 * The field saying whether the event waits for an effect to finish.
 * @param {number} param The parameter it lives in.
 * @returns {ReturnType<typeof field>} The field.
 */
const waitField = (param: number) => field('wait', 'Wait for completion', param, 'boolean', { default: true });

/**
 * The Timing and Screen groups: waiting, fades, tints, flashes, shakes and weather.
 */
const SCREEN_ENTRIES: readonly CommandCatalogEntry[] = [
  {
    id: 'core:230',
    code: 230,
    name: 'Wait',
    category: 'Timing',
    keywords: [ 'wait', 'delay', 'pause', 'sleep', 'frames' ],
    fields: [
      field('frames', 'Frames', 0, 'number', { min: 1, max: 999, default: 60 }),
    ],
    sentence: parts => `Wait ${framesPhrase(parts.value('frames'))}`,
    defaultParameters: [ 60 ],
  },
  {
    id: 'core:221',
    code: 221,
    name: 'Fadeout Screen',
    category: 'Screen',
    keywords: [ 'fade', 'fade out', 'black', 'screen', 'transition' ],
    fields: [],
    sentence: 'Fade out the screen',
    defaultParameters: [],
  },
  {
    id: 'core:222',
    code: 222,
    name: 'Fadein Screen',
    category: 'Screen',
    keywords: [ 'fade', 'fade in', 'screen', 'transition' ],
    fields: [],
    sentence: 'Fade in the screen',
    defaultParameters: [],
  },
  {
    id: 'core:223',
    code: 223,
    name: 'Tint Screen',
    category: 'Screen',
    keywords: [ 'tint', 'tone', 'color', 'colour', 'dark', 'night', 'sepia', 'screen' ],
    fields: [
      field('tone', 'Tone', 0, 'color', { min: -255, max: 255, default: [ 0, 0, 0, 0 ] }),
      field('duration', 'Duration', 1, 'number', { min: 1, max: 999, default: 60 }),
      waitField(2),
    ],
    sentence: parts => withNotes(`Tint the screen to ${parts.text('tone')} over ${framesPhrase(parts.value('duration'))}`, [
      parts.value('wait') === true && 'wait',
    ]),
    defaultParameters: [ [ 0, 0, 0, 0 ], 60, true ],
  },
  {
    id: 'core:224',
    code: 224,
    name: 'Flash Screen',
    category: 'Screen',
    keywords: [ 'flash', 'screen', 'white', 'lightning', 'hit' ],
    fields: [
      field('color', 'Color', 0, 'color', { min: 0, max: 255, default: [ 255, 255, 255, 170 ] }),
      field('duration', 'Duration', 1, 'number', { min: 1, max: 999, default: 60 }),
      waitField(2),
    ],
    sentence: parts => withNotes(`Flash the screen ${parts.text('color')} for ${framesPhrase(parts.value('duration'))}`, [
      parts.value('wait') === true && 'wait',
    ]),
    defaultParameters: [ [ 255, 255, 255, 170 ], 60, true ],
  },
  {
    id: 'core:225',
    code: 225,
    name: 'Shake Screen',
    category: 'Screen',
    keywords: [ 'shake', 'quake', 'earthquake', 'rumble', 'screen' ],
    fields: [
      field('power', 'Power', 0, 'number', { min: 1, max: 9, default: 5 }),
      field('speed', 'Speed', 1, 'number', { min: 1, max: 9, default: 5 }),
      field('duration', 'Duration', 2, 'number', { min: 1, max: 999, default: 60 }),
      waitField(3),
    ],
    sentence: parts => withNotes(`Shake the screen for ${framesPhrase(parts.value('duration'))}`, [
      `power ${parts.text('power')}`,
      `speed ${parts.text('speed')}`,
      parts.value('wait') === true && 'wait',
    ]),
    defaultParameters: [ 5, 5, 60, true ],
  },
  {
    id: 'core:236',
    code: 236,
    name: 'Set Weather Effect',
    category: 'Screen',
    keywords: [ 'weather', 'rain', 'storm', 'snow', 'climate' ],
    fields: [
      field('weather', 'Weather', 0, 'select', { options: WEATHERS, default: 'none' }),
      field('power', 'Power', 1, 'number', { min: 1, max: 9, default: 5 }),
      field('duration', 'Duration', 2, 'number', { min: 0, max: 999, default: 60 }),
      waitField(3),
    ],
    sentence: parts => withNotes(`Weather: ${parts.text('weather')} over ${framesPhrase(parts.value('duration'))}`, [
      parts.value('weather') !== 'none' && `power ${parts.text('power')}`,
      parts.value('wait') === true && 'wait',
    ]),
    defaultParameters: [ 'none', 5, 60, true ],
  },
];

export { SCREEN_ENTRIES };
