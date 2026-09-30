import type { CommandCatalogEntry, SentenceParts } from '../catalogTypes.ts';
import { field, withNotes } from './fieldHelpers.ts';
import { ON_OFF, options } from './options.ts';

/**
 * What Get Location Info reads.
 */
const LOCATION_INFO_TYPES = options([
  [ 0, 'Terrain Tag' ],
  [ 1, 'Event ID' ],
  [ 2, 'Tile ID (Layer 1)' ],
  [ 3, 'Tile ID (Layer 2)' ],
  [ 4, 'Tile ID (Layer 3)' ],
  [ 5, 'Tile ID (Layer 4)' ],
  [ 6, 'Region ID' ],
]);

/**
 * How Get Location Info finds its tile: a position, variables' position, or where a character stands.
 */
const LOCATION_DESIGNATIONS = options([ [ 0, 'Direct' ], [ 1, 'Variables' ], [ 2, 'Character' ] ]);

/**
 * Says where Get Location Info looks.
 * @param {SentenceParts} parts The command's parts.
 * @returns {string} Such as "(4, 7)", "(#0003, #0004)" or "Player".
 */
const locationPhrase = (parts: SentenceParts): string =>
{
  const designation = parts.value('designation');
  if (designation === 2)
  {
    return parts.text('character');
  }

  return designation === 1
    ? `(${parts.text('xVariable')}, ${parts.text('yVariable')})`
    : `(${parts.text('x')}, ${parts.text('y')})`;
};

/**
 * The Map group: the map's name display, tileset, battle background and parallax, and reading a tile.
 */
const MAP_ENTRIES: readonly CommandCatalogEntry[] = [
  {
    id: 'core:281',
    code: 281,
    name: 'Change Map Name Display',
    category: 'Map',
    keywords: [ 'map name', 'display name', 'location name', 'banner' ],
    fields: [ field('display', 'Map name display', 0, 'select', { options: ON_OFF, default: 0 }) ],
    sentence: 'Map name display {display}',
    defaultParameters: [ 0 ],
  },
  {
    id: 'core:282',
    code: 282,
    name: 'Change Tileset',
    category: 'Map',
    keywords: [ 'tileset', 'tiles', 'map graphics' ],
    fields: [ field('tileset', 'Tileset', 0, 'tileset', { default: 1 }) ],
    sentence: 'Change the tileset to {tileset}',
    defaultParameters: [ 1 ],
  },
  {
    id: 'core:283',
    code: 283,
    name: 'Change Battle Background',
    category: 'Map',
    keywords: [ 'battleback', 'battle background', 'backdrop' ],
    fields: [
      field('floor', 'Floor', 0, 'image', { folder: 'battlebacks1', default: '' }),
      field('wall', 'Wall', 1, 'image', { folder: 'battlebacks2', default: '' }),
    ],
    sentence: parts => `Battle background: ${parts.text('floor') || 'None'} & ${parts.text('wall') || 'None'}`,
    defaultParameters: [ '', '' ],
  },
  {
    id: 'core:284',
    code: 284,
    name: 'Change Parallax',
    category: 'Map',
    keywords: [ 'parallax', 'background', 'sky', 'panorama' ],
    fields: [
      field('image', 'Image', 0, 'image', { folder: 'parallaxes', default: '' }),
      field('loopX', 'Loop horizontally', 1, 'boolean', { default: false }),
      field('loopY', 'Loop vertically', 2, 'boolean', { default: false }),
      field('scrollX', 'Horizontal scroll', 3, 'number', { min: -32, max: 32, default: 0, visibleWhen: { field: 'loopX', equals: true } }),
      field('scrollY', 'Vertical scroll', 4, 'number', { min: -32, max: 32, default: 0, visibleWhen: { field: 'loopY', equals: true } }),
    ],
    sentence: parts => withNotes(`Parallax: ${parts.text('image') || 'None'}`, [
      parts.value('loopX') === true && 'loops horizontally',
      parts.value('loopY') === true && 'loops vertically',
    ]),
    defaultParameters: [ '', false, false, 0, 0 ],
  },
  {
    id: 'core:285',
    code: 285,
    name: 'Get Location Info',
    category: 'Map',
    keywords: [ 'location', 'tile', 'region', 'terrain', 'event id', 'read tile' ],
    fields: [
      field('variable', 'Store in', 0, 'variable', { default: 1 }),
      field('info', 'Info', 1, 'select', { options: LOCATION_INFO_TYPES, default: 0 }),
      field('designation', 'Location', 2, 'select', { options: LOCATION_DESIGNATIONS, default: 0 }),
      field('x', 'X', 3, 'number', { min: 0, default: 0, visibleWhen: { field: 'designation', equals: 0 } }),
      field('y', 'Y', 4, 'number', { min: 0, default: 0, visibleWhen: { field: 'designation', equals: 0 } }),
      field('xVariable', 'X from', 3, 'variable', { default: 1, visibleWhen: { field: 'designation', equals: 1 } }),
      field('yVariable', 'Y from', 4, 'variable', { default: 1, visibleWhen: { field: 'designation', equals: 1 } }),
      field('character', 'Character', 3, 'event', { default: -1, visibleWhen: { field: 'designation', equals: 2 } }),
    ],
    sentence: parts => `${parts.text('variable')} = ${parts.text('info')} at ${locationPhrase(parts)}`,
    defaultParameters: [ 1, 0, 0, 0, 0 ],
  },
];

export { MAP_ENTRIES };
