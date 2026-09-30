import { isJsonObject } from '../../model/json.ts';
import type { CommandCatalogEntry, SentenceParts } from '../catalogTypes.ts';
import { field, withNotes } from './fieldHelpers.ts';
import { moveRouteLines, moveStepPhrase } from './moveRoute.ts';
import { DIRECT_VARIABLES, DIRECTIONS, DIRECTIONS_OR_RETAIN, FADES, options, SPEEDS, VEHICLES } from './options.ts';

/**
 * How Set Event Location places an event: at a position, at variables' position, or by swapping with another.
 */
const EVENT_LOCATION_DESIGNATIONS = options([ [ 0, 'Direct' ], [ 1, 'Variables' ], [ 2, 'Exchange' ] ]);

/**
 * How many steps a move route row names before summing up the rest.
 */
const ROUTE_STEPS_SHOWN = 4;

/**
 * Says where a transfer or placement goes: a map and position, or the variables holding them.
 * @param {SentenceParts} parts The command's parts, with {@code designation}, {@code map}, {@code x}, {@code y} and
 * their variable twins.
 * @returns {string} Such as "#2 Town (16, 12)" or "the map in #0010 (#0011, #0012)".
 */
const placePhrase = (parts: SentenceParts): string =>
{
  return parts.value('designation') === 1
    ? `the map in ${parts.text('mapVariable')} at (${parts.text('xVariable')}, ${parts.text('yVariable')})`
    : `${parts.text('map')} (${parts.text('x')}, ${parts.text('y')})`;
};

/**
 * Says a move route's steps, the first few by name.
 * @param {SentenceParts} parts The command's parts, with {@code steps}.
 * @returns {string} Such as "Turn Left, Jump +0, +0 and 3 more".
 */
const routeStepsPhrase = (parts: SentenceParts): string =>
{
  const value = parts.value('steps');
  const steps = Array.isArray(value)
    ? value.filter(step => isJsonObject(step) === false || step['code'] !== 0)
    : [];
  if (steps.length === 0)
  {
    return 'no steps';
  }

  const named = steps.slice(0, ROUTE_STEPS_SHOWN).map(moveStepPhrase).join(', ');
  return steps.length > ROUTE_STEPS_SHOWN
    ? `${named} and ${steps.length - ROUTE_STEPS_SHOWN} more`
    : named;
};

/**
 * The fields of a place given directly or by variables, starting at a parameter.
 * @param {number} at The parameter holding the designation; the map, x and y follow it.
 * @returns {ReturnType<typeof field>[]} The fields.
 */
const placeFields = (at: number) =>
{
  const direct = { field: 'designation', equals: 0 } as const;
  const variables = { field: 'designation', equals: 1 } as const;
  return [
    field('designation', 'Location', at, 'select', { options: DIRECT_VARIABLES, default: 0 }),
    field('map', 'Map', at + 1, 'map', { default: 1, visibleWhen: direct }),
    field('x', 'X', at + 2, 'number', { min: 0, default: 0, visibleWhen: direct }),
    field('y', 'Y', at + 3, 'number', { min: 0, default: 0, visibleWhen: direct }),
    field('mapVariable', 'Map from', at + 1, 'variable', { default: 1, visibleWhen: variables }),
    field('xVariable', 'X from', at + 2, 'variable', { default: 1, visibleWhen: variables }),
    field('yVariable', 'Y from', at + 3, 'variable', { default: 1, visibleWhen: variables }),
  ];
};

/**
 * The Movement group: transfers, placing vehicles and events, scrolling and move routes.
 */
const MOVEMENT_ENTRIES: readonly CommandCatalogEntry[] = [
  {
    id: 'core:201',
    code: 201,
    name: 'Transfer Player',
    category: 'Movement',
    keywords: [ 'transfer', 'teleport', 'warp', 'door', 'go to', 'map', 'travel', 'exit', 'enter' ],
    fields: [
      ...placeFields(0),
      field('direction', 'Direction', 4, 'select', { options: DIRECTIONS_OR_RETAIN, default: 0 }),
      field('fade', 'Fade', 5, 'select', { options: FADES, default: 0 }),
    ],
    sentence: parts => withNotes(`Transfer to ${placePhrase(parts)}`, [
      parts.value('direction') !== 0 && `facing ${parts.text('direction')}`,
      parts.value('fade') === 1 && 'white fade',
      parts.value('fade') === 2 && 'no fade',
    ]),
    defaultParameters: [ 0, 1, 0, 0, 0, 0 ],
  },
  {
    id: 'core:202',
    code: 202,
    name: 'Set Vehicle Location',
    category: 'Movement',
    keywords: [ 'vehicle', 'boat', 'ship', 'airship', 'place', 'park' ],
    fields: [
      field('vehicle', 'Vehicle', 0, 'select', { options: VEHICLES, default: 0 }),
      ...placeFields(1),
    ],
    sentence: parts => `Place the ${parts.text('vehicle')} at ${placePhrase(parts)}`,
    defaultParameters: [ 0, 0, 1, 0, 0 ],
  },
  {
    id: 'core:203',
    code: 203,
    name: 'Set Event Location',
    category: 'Movement',
    keywords: [ 'event', 'move', 'place', 'position', 'swap', 'relocate', 'teleport event' ],
    fields: [
      field('character', 'Event', 0, 'event', { default: 0, min: 0 }),
      field('designation', 'Location', 1, 'select', { options: EVENT_LOCATION_DESIGNATIONS, default: 0 }),
      field('x', 'X', 2, 'number', { min: 0, default: 0, visibleWhen: { field: 'designation', equals: 0 } }),
      field('y', 'Y', 3, 'number', { min: 0, default: 0, visibleWhen: { field: 'designation', equals: 0 } }),
      field('xVariable', 'X from', 2, 'variable', { default: 1, visibleWhen: { field: 'designation', equals: 1 } }),
      field('yVariable', 'Y from', 3, 'variable', { default: 1, visibleWhen: { field: 'designation', equals: 1 } }),
      field('other', 'Swap with', 2, 'event', { default: 0, min: 0, visibleWhen: { field: 'designation', equals: 2 } }),
      field('direction', 'Direction', 4, 'select', { options: DIRECTIONS_OR_RETAIN, default: 0 }),
    ],
    sentence: parts =>
    {
      const designation = parts.value('designation');
      const where = designation === 2
        ? `Swap ${parts.text('character')} with ${parts.text('other')}`
        : `Move ${parts.text('character')} to (${parts.text(designation === 1 ? 'xVariable' : 'x')}, ${parts.text(designation === 1 ? 'yVariable' : 'y')})`;
      return withNotes(where, [ parts.value('direction') !== 0 && `facing ${parts.text('direction')}` ]);
    },
    defaultParameters: [ 0, 0, 0, 0, 0 ],
  },
  {
    id: 'core:204',
    code: 204,
    name: 'Scroll Map',
    category: 'Movement',
    keywords: [ 'scroll', 'camera', 'pan', 'view' ],
    fields: [
      field('direction', 'Direction', 0, 'select', { options: DIRECTIONS, default: 2 }),
      field('distance', 'Distance', 1, 'number', { min: 1, max: 100, default: 1 }),
      field('speed', 'Speed', 2, 'select', { options: SPEEDS, default: 4 }),
      field('wait', 'Wait for completion', 3, 'boolean', { default: false }),
    ],
    sentence: parts => withNotes(`Scroll the map ${parts.text('direction')} ${parts.text('distance')} tiles at speed ${String(parts.value('speed') ?? '')}`, [
      parts.value('wait') === true && 'wait',
    ]),
    defaultParameters: [ 2, 1, 4, false ],
  },
  {
    id: 'core:205',
    code: 205,
    name: 'Set Movement Route',
    category: 'Movement',
    keywords: [ 'move', 'route', 'walk', 'path', 'turn', 'jump', 'animation', 'movement' ],
    fields: [
      field('character', 'Character', 0, 'event', { default: -1 }),
      field('steps', 'Steps', [ 1, 'list' ], 'json', { default: [ { code: 0, parameters: [] } ] }),
      field('repeat', 'Repeat', [ 1, 'repeat' ], 'boolean', { default: false }),
      field('skippable', 'Skip if cannot move', [ 1, 'skippable' ], 'boolean', { default: false }),
      field('wait', 'Wait for completion', [ 1, 'wait' ], 'boolean', { default: true }),
    ],
    sentence: parts => withNotes(`Move route for ${parts.text('character')}: ${routeStepsPhrase(parts)}`, [
      parts.value('repeat') === true && 'repeat',
      parts.value('skippable') === true && 'skip if blocked',
      parts.value('wait') === true && 'wait',
    ]),
    continuation: 505,
    deriveContinuation: moveRouteLines,
    defaultParameters: [ -1, { list: [ { code: 0, parameters: [] } ], repeat: false, skippable: false, wait: true } ],
  },
  {
    id: 'core:206',
    code: 206,
    name: 'Get on/off Vehicle',
    category: 'Movement',
    keywords: [ 'vehicle', 'board', 'ride', 'boat', 'ship', 'airship', 'get on', 'get off' ],
    fields: [],
    sentence: 'Get on or off the vehicle',
    defaultParameters: [],
  },
];

export { MOVEMENT_ENTRIES };
