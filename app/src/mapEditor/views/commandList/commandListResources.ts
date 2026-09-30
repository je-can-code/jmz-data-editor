import { createContext, useEffect, useState } from 'react';
import type { MapEditorApi } from '../../core/api/MapEditorApi.ts';
import { usageByEntry } from '../../core/commandList/commandUsage.ts';
import type { DatabaseNamesJson } from '../../core/commandList/databaseNames.ts';

/**
 * What every command list in a window reads with: the project's names for ids, and how often each command is used.
 */
type CommandListResources = {
  /**
   * The names, or null until they arrive (or when the server could not give them), when ids read as numbers.
   */
  readonly names: DatabaseNamesJson | null;

  /**
   * Events using each command, by entry id; empty until the counts arrive.
   */
  readonly usage: ReadonlyMap<string, number>;
};

/**
 * The resources of each server, asked for once per window however many lists open.
 */
const held = new WeakMap<MapEditorApi, { names: Promise<DatabaseNamesJson | null>; usage: Promise<Map<string, number>> }>();

/**
 * No usage counts.
 */
const NO_USAGE: ReadonlyMap<string, number> = new Map();

/**
 * Asks the server for the names and counts once, keeping the answers for every list after, and for the command
 * editors' pickers, which read the same names. Neither is needed for a list to work, only to read better and rank
 * better, so a failure leaves ids as numbers and the search in name order rather than stopping anything.
 * @param {MapEditorApi} api The server.
 * @returns {{ names: Promise<DatabaseNamesJson | null>, usage: Promise<Map<string, number>> }} The answers.
 */
const commandListResourcesOf = (api: MapEditorApi) =>
{
  const known = held.get(api);
  if (known !== undefined)
  {
    return known;
  }

  const asked = {
    names: api.loadDatabaseNames().catch(() => null),
    usage: api.loadCommandUsage().then(usageByEntry).catch(() => new Map<string, number>()),
  };
  held.set(api, asked);
  return asked;
};

/**
 * Reads the names and usage counts a command list reads with, once they arrive.
 * @param {MapEditorApi | null} api The server, or null when the window has none.
 * @returns {CommandListResources} The resources so far.
 */
const useCommandListResources = (api: MapEditorApi | null): CommandListResources =>
{
  const [ names, setNames ] = useState<DatabaseNamesJson | null>(null);
  const [ usage, setUsage ] = useState<ReadonlyMap<string, number>>(NO_USAGE);

  useEffect(() =>
  {
    if (api === null)
    {
      return undefined;
    }

    // answers arriving after the list has gone are dropped.
    let live = true;
    const asked = commandListResourcesOf(api);
    asked.names.then(value =>
    {
      if (live)
      {
        setNames(value);
      }
    });
    asked.usage.then(value =>
    {
      if (live)
      {
        setUsage(value);
      }
    });

    return () =>
    {
      live = false;
    };
  }, [ api ]);

  return { names, usage };
};

/**
 * One sound as a command holds it.
 */
type SoundSettings = {
  readonly volume: number;
  readonly pitch: number;
};

/**
 * Plays a sound's preview.
 */
type SoundPlayer = (url: string, sound: SoundSettings) => void;

/**
 * Keeps a number within bounds.
 * @param {number} value The number.
 * @param {number} low The lowest allowed.
 * @param {number} high The highest allowed.
 * @returns {number} The number, bounded.
 */
const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

/**
 * Makes a player for sound previews: one sound at a time, a new one stopping the last, at the command's volume and
 * pitch (a pitch of 150 plays half as fast again, as in the game).
 * @param {(url: string) => HTMLAudioElement} createAudio Makes the audio element; tests hand in a silent stand-in.
 * @returns {SoundPlayer} The player.
 */
const createSoundPlayer = (createAudio: (url: string) => HTMLAudioElement): SoundPlayer =>
{
  let playing: HTMLAudioElement | null = null;
  return (url, sound) =>
  {
    playing?.pause();
    const audio = createAudio(url);
    audio.volume = clamp(sound.volume / 100, 0, 1);
    audio.preservesPitch = false;
    audio.playbackRate = clamp(sound.pitch / 100, 0.5, 2);
    playing = audio;

    // a sound that cannot play (a missing file) simply stays quiet.
    audio.play().catch(() => undefined);
  };
};

/**
 * Carries the window's sound player to every command row.
 */
const SoundPlayerContext = createContext<SoundPlayer>(createSoundPlayer(url => new Audio(url)));

export { commandListResourcesOf, createSoundPlayer, SoundPlayerContext, useCommandListResources };
export type { CommandListResources, SoundPlayer, SoundSettings };
