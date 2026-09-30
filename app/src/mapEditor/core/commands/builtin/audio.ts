import type { CommandCatalogEntry } from '../catalogTypes.ts';
import { audioField, field } from './fieldHelpers.ts';
import { audioPhrase } from './phrases.ts';

/**
 * The folder each kind of sound lives in, which is also what the list calls it.
 */
type SoundKind = 'bgm' | 'bgs' | 'me' | 'se';

/**
 * Builds a command that plays one sound.
 * @param {number} code The command code.
 * @param {string} name What the list calls it.
 * @param {SoundKind} kind The kind of sound, which is also its folder.
 * @param {readonly string[]} keywords Words that find it.
 * @returns {CommandCatalogEntry} The entry.
 */
const playEntry = (code: number, name: string, kind: SoundKind, keywords: readonly string[]): CommandCatalogEntry =>
{
  return {
    id: `core:${code}`,
    code,
    name,
    category: 'Audio & Video',
    keywords,
    fields: [ audioField('audio', 'Sound', 0, kind) ],
    sentence: parts => `${name}: ${audioPhrase(parts.value('audio'))}`,
    defaultParameters: [ { name: '', volume: 90, pitch: 100, pan: 0 } ],
  };
};

/**
 * Builds a command that fades a sound out over seconds.
 * @param {number} code The command code.
 * @param {string} name What the list calls it.
 * @param {string} what What fades, in a row.
 * @param {readonly string[]} keywords Words that find it.
 * @returns {CommandCatalogEntry} The entry.
 */
const fadeEntry = (code: number, name: string, what: string, keywords: readonly string[]): CommandCatalogEntry =>
{
  return {
    id: `core:${code}`,
    code,
    name,
    category: 'Audio & Video',
    keywords,
    fields: [ field('seconds', 'Seconds', 0, 'number', { min: 1, max: 60, default: 10 }) ],
    sentence: `Fade out the ${what} over {seconds} seconds`,
    defaultParameters: [ 10 ],
  };
};

/**
 * The Audio & Video group.
 */
const AUDIO_ENTRIES: readonly CommandCatalogEntry[] = [
  playEntry(241, 'Play BGM', 'bgm', [ 'music', 'song', 'bgm', 'soundtrack', 'theme' ]),
  fadeEntry(242, 'Fadeout BGM', 'BGM', [ 'music', 'fade', 'bgm', 'stop music' ]),
  {
    id: 'core:243',
    code: 243,
    name: 'Save BGM',
    category: 'Audio & Video',
    keywords: [ 'music', 'bgm', 'remember', 'save music' ],
    fields: [],
    sentence: 'Save the BGM',
    defaultParameters: [],
  },
  {
    id: 'core:244',
    code: 244,
    name: 'Resume BGM',
    category: 'Audio & Video',
    keywords: [ 'music', 'bgm', 'restore', 'resume music' ],
    fields: [],
    sentence: 'Resume the saved BGM',
    defaultParameters: [],
  },
  playEntry(245, 'Play BGS', 'bgs', [ 'ambience', 'ambient', 'background sound', 'bgs', 'rain', 'wind' ]),
  fadeEntry(246, 'Fadeout BGS', 'BGS', [ 'ambience', 'fade', 'bgs' ]),
  playEntry(249, 'Play ME', 'me', [ 'jingle', 'fanfare', 'music effect', 'me', 'victory' ]),
  playEntry(250, 'Play SE', 'se', [ 'sound', 'sfx', 'effect', 'se', 'noise', 'audio' ]),
  {
    id: 'core:251',
    code: 251,
    name: 'Stop SE',
    category: 'Audio & Video',
    keywords: [ 'sound', 'sfx', 'stop', 'silence', 'se' ],
    fields: [],
    sentence: 'Stop all sound effects',
    defaultParameters: [],
  },
  {
    id: 'core:261',
    code: 261,
    name: 'Play Movie',
    category: 'Audio & Video',
    keywords: [ 'movie', 'video', 'cutscene', 'film', 'webm' ],
    fields: [ field('movie', 'Movie', 0, 'file', { folder: 'movies', default: '' }) ],
    sentence: parts => `Play movie ${parts.text('movie') || 'None'}`,
    defaultParameters: [ '' ],
  },
];

export { AUDIO_ENTRIES };
export type { SoundKind };
