import type { CommandCatalogEntry } from '../catalogTypes.ts';
import type { CommandCatalog } from '../CommandCatalog.ts';
import { ACTOR_ENTRIES } from './actor.ts';
import { ADVANCED_ENTRIES } from './advanced.ts';
import { AUDIO_ENTRIES } from './audio.ts';
import { BATTLE_ENTRIES } from './battle.ts';
import { CHARACTER_ENTRIES } from './character.ts';
import { FLOW_ENTRIES } from './flow.ts';
import { MAP_ENTRIES } from './map.ts';
import { MESSAGE_ENTRIES } from './message.ts';
import { MOVEMENT_ENTRIES } from './movement.ts';
import { PARTY_ENTRIES } from './party.ts';
import { PICTURE_ENTRIES } from './picture.ts';
import { PROGRESSION_ENTRIES } from './progression.ts';
import { SCENE_ENTRIES } from './scene.ts';
import { SCREEN_ENTRIES } from './screen.ts';
import { STRUCTURAL_ENTRIES } from './structural.ts';
import { SYSTEM_SETTINGS_ENTRIES } from './systemSettings.ts';

/**
 * An entry for every event command code RMMZ has, in the order of MZ's own command window, then the codes that only
 * live inside other commands.
 */
const BUILT_IN_ENTRIES: readonly CommandCatalogEntry[] = [
  ...MESSAGE_ENTRIES,
  ...PROGRESSION_ENTRIES,
  ...FLOW_ENTRIES,
  ...PARTY_ENTRIES,
  ...ACTOR_ENTRIES,
  ...MOVEMENT_ENTRIES,
  ...CHARACTER_ENTRIES,
  ...PICTURE_ENTRIES,
  ...SCREEN_ENTRIES,
  ...AUDIO_ENTRIES,
  ...SCENE_ENTRIES,
  ...SYSTEM_SETTINGS_ENTRIES,
  ...MAP_ENTRIES,
  ...BATTLE_ENTRIES,
  ...ADVANCED_ENTRIES,
  ...STRUCTURAL_ENTRIES,
];

/**
 * Adds every built-in command to a catalog. Each window's catalog starts with these; plugin commands join from
 * the plugin headers.
 * @param {CommandCatalog} catalog The catalog.
 */
const registerBuiltInCommands = (catalog: CommandCatalog): void =>
{
  BUILT_IN_ENTRIES.forEach(entry => catalog.register(entry));
};

export { BUILT_IN_ENTRIES, registerBuiltInCommands };
