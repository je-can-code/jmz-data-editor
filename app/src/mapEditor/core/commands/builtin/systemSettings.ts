import type { CommandCatalogEntry } from '../catalogTypes.ts';
import { audioField, field } from './fieldHelpers.ts';
import { DISABLE_ENABLE, VEHICLES } from './options.ts';
import { audioPhrase } from './phrases.ts';

/**
 * Builds a command that sets one of the system's sounds.
 * @param {number} code The command code.
 * @param {string} name What the list calls it.
 * @param {string} what The sound, in a row.
 * @param {'bgm' | 'me'} folder Its folder.
 * @param {readonly string[]} keywords Words that find it.
 * @returns {CommandCatalogEntry} The entry.
 */
const systemSoundEntry = (code: number, name: string, what: string, folder: 'bgm' | 'me', keywords: readonly string[]): CommandCatalogEntry =>
{
  return {
    id: `core:${code}`,
    code,
    name,
    category: 'System Settings',
    keywords,
    fields: [ audioField('audio', 'Sound', 0, folder) ],
    sentence: parts => `${what}: ${audioPhrase(parts.value('audio'))}`,
    defaultParameters: [ { name: '', volume: 90, pitch: 100, pan: 0 } ],
  };
};

/**
 * Builds a command that switches one of the player's options on or off.
 * @param {number} code The command code.
 * @param {string} name What the list calls it.
 * @param {string} what The option, in a row.
 * @param {readonly string[]} keywords Words that find it.
 * @returns {CommandCatalogEntry} The entry.
 */
const accessEntry = (code: number, name: string, what: string, keywords: readonly string[]): CommandCatalogEntry =>
{
  return {
    id: `core:${code}`,
    code,
    name,
    category: 'System Settings',
    keywords,
    fields: [ field('access', what, 0, 'select', { options: DISABLE_ENABLE, default: 0 }) ],
    sentence: `${what}: {access}`,
    defaultParameters: [ 0 ],
  };
};

/**
 * The System Settings group: system sounds, access to saving, the menu and encounters, the window color, and
 * actor and vehicle images.
 */
const SYSTEM_SETTINGS_ENTRIES: readonly CommandCatalogEntry[] = [
  systemSoundEntry(132, 'Change Battle BGM', 'Battle BGM', 'bgm', [ 'battle music', 'bgm', 'fight music' ]),
  systemSoundEntry(133, 'Change Victory ME', 'Victory ME', 'me', [ 'victory', 'fanfare', 'win music' ]),
  systemSoundEntry(139, 'Change Defeat ME', 'Defeat ME', 'me', [ 'defeat', 'lose music', 'game over music' ]),
  {
    id: 'core:140',
    code: 140,
    name: 'Change Vehicle BGM',
    category: 'System Settings',
    keywords: [ 'vehicle', 'boat', 'ship', 'airship', 'music', 'bgm' ],
    fields: [
      field('vehicle', 'Vehicle', 0, 'select', { options: VEHICLES, default: 0 }),
      audioField('audio', 'Music', 1, 'bgm'),
    ],
    sentence: parts => `${parts.text('vehicle')} BGM: ${audioPhrase(parts.value('audio'))}`,
    defaultParameters: [ 0, { name: '', volume: 90, pitch: 100, pan: 0 } ],
  },
  accessEntry(134, 'Change Save Access', 'Save access', [ 'save', 'disable save', 'enable save' ]),
  accessEntry(135, 'Change Menu Access', 'Menu access', [ 'menu', 'disable menu', 'enable menu' ]),
  accessEntry(136, 'Change Encounter', 'Encounters', [ 'encounter', 'random battles', 'disable encounters' ]),
  accessEntry(137, 'Change Formation Access', 'Formation access', [ 'formation', 'party order' ]),
  {
    id: 'core:138',
    code: 138,
    name: 'Change Window Color',
    category: 'System Settings',
    keywords: [ 'window', 'color', 'colour', 'tone', 'skin' ],
    fields: [ field('tone', 'Color', 0, 'color', { min: -255, max: 255, default: [ 0, 0, 0, 0 ] }) ],
    sentence: 'Window color: {tone}',
    defaultParameters: [ [ 0, 0, 0, 0 ] ],
  },
  {
    id: 'core:322',
    code: 322,
    name: 'Change Actor Images',
    category: 'System Settings',
    keywords: [ 'actor', 'image', 'sprite', 'face', 'portrait', 'battler', 'graphic', 'costume' ],
    fields: [
      field('actor', 'Actor', 0, 'actor', { default: 1 }),
      field('characterName', 'Character', 1, 'character', { folder: 'characters', default: '' }),
      field('characterIndex', 'Character index', 2, 'number', { min: 0, max: 7, default: 0 }),
      field('faceName', 'Face', 3, 'face', { folder: 'faces', default: '' }),
      field('faceIndex', 'Face index', 4, 'number', { min: 0, max: 7, default: 0 }),
      field('battlerName', 'Battler', 5, 'image', { folder: 'sv_actors', default: '' }),
    ],
    sentence: 'Change the images of {actor}',
    defaultParameters: [ 1, '', 0, '', 0, '' ],
  },
  {
    id: 'core:323',
    code: 323,
    name: 'Change Vehicle Image',
    category: 'System Settings',
    keywords: [ 'vehicle', 'boat', 'ship', 'airship', 'image', 'sprite' ],
    fields: [
      field('vehicle', 'Vehicle', 0, 'select', { options: VEHICLES, default: 0 }),
      field('characterName', 'Character', 1, 'character', { folder: 'characters', default: '' }),
      field('characterIndex', 'Character index', 2, 'number', { min: 0, max: 7, default: 0 }),
    ],
    sentence: parts => `Change the ${parts.text('vehicle')}'s image to ${parts.text('characterName') || 'None'}`,
    defaultParameters: [ 0, '', 0 ],
  },
];

export { SYSTEM_SETTINGS_ENTRIES };
