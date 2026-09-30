import type { CommandCatalogEntry } from '../catalogTypes.ts';
import { field, withNotes } from './fieldHelpers.ts';
import { BALLOONS, ON_OFF } from './options.ts';

/**
 * The Character group: the player's visibility and followers, animations and balloons, and erasing an event.
 */
const CHARACTER_ENTRIES: readonly CommandCatalogEntry[] = [
  {
    id: 'core:211',
    code: 211,
    name: 'Change Transparency',
    category: 'Character',
    keywords: [ 'transparent', 'invisible', 'hide player', 'show player', 'visibility' ],
    fields: [
      field('transparent', 'Transparency', 0, 'select', { options: ON_OFF, default: 0 }),
    ],
    sentence: 'Player transparency {transparent}',
    defaultParameters: [ 0 ],
  },
  {
    id: 'core:216',
    code: 216,
    name: 'Change Player Followers',
    category: 'Character',
    keywords: [ 'followers', 'party', 'train', 'caterpillar', 'show', 'hide' ],
    fields: [
      field('followers', 'Followers', 0, 'select', { options: ON_OFF, default: 0 }),
    ],
    sentence: 'Player followers {followers}',
    defaultParameters: [ 0 ],
  },
  {
    id: 'core:217',
    code: 217,
    name: 'Gather Followers',
    category: 'Character',
    keywords: [ 'followers', 'gather', 'regroup', 'party' ],
    fields: [],
    sentence: 'Gather the followers',
    defaultParameters: [],
  },
  {
    id: 'core:212',
    code: 212,
    name: 'Show Animation',
    category: 'Character',
    keywords: [ 'animation', 'effect', 'sparkle', 'play animation' ],
    fields: [
      field('character', 'Character', 0, 'event', { default: -1 }),
      field('animation', 'Animation', 1, 'animation', { default: 1 }),
      field('wait', 'Wait for completion', 2, 'boolean', { default: false }),
    ],
    sentence: parts => withNotes(`Show animation ${parts.text('animation')} on ${parts.text('character')}`, [
      parts.value('wait') === true && 'wait',
    ]),
    defaultParameters: [ -1, 1, false ],
  },
  {
    id: 'core:213',
    code: 213,
    name: 'Show Balloon Icon',
    category: 'Character',
    keywords: [ 'balloon', 'emote', 'emotion', 'icon', 'exclamation', 'question', 'heart' ],
    fields: [
      field('character', 'Character', 0, 'event', { default: -1 }),
      field('balloon', 'Balloon', 1, 'select', { options: BALLOONS, default: 1 }),
      field('wait', 'Wait for completion', 2, 'boolean', { default: false }),
    ],
    sentence: parts => withNotes(`Show a ${parts.text('balloon')} balloon over ${parts.text('character')}`, [
      parts.value('wait') === true && 'wait',
    ]),
    defaultParameters: [ -1, 1, false ],
  },
  {
    id: 'core:214',
    code: 214,
    name: 'Erase Event',
    category: 'Character',
    keywords: [ 'erase', 'remove', 'delete', 'despawn', 'vanish' ],
    fields: [],
    sentence: 'Erase this event',
    defaultParameters: [],
  },
];

export { CHARACTER_ENTRIES };
