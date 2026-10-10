import React, { useRef, useState, type ComponentType } from 'react';
import { Autocomplete, Box, Button, TextField, Typography } from '@mui/material';
import type { EnemyBattlerPage } from '../../core/api/MapEditorApi.ts';
import type { PalettePickerProps } from '../../core/modules/PluginModule.ts';
import { useMapEditorServices } from '../../services/MapEditorServicesContext.tsx';
import { battlerLevelFit } from './battlerLevelFit.ts';
import { NEW_BATTLER_LEVELS_DOCUMENT } from './battlerLevelSetting.ts';
import { battlerLookOf, battlerStamp, type BattlerLook } from './battlerLooks.ts';
import type { BattlerSetup } from './battlerSetup.ts';
import { enemyOptions, useEnemies, type EnemyOption } from './enemyBook.ts';

/**
 * The battler the brush holds: its stamp's id, the enemy, and what it places.
 */
type HeldBattler = {
  readonly stampId: string;
  readonly enemyId: number;
  readonly look: BattlerLook;
};

/**
 * What reading an enemy's battlers came to: the battlers, none when they could not be read, and why not, or null.
 */
type BattlersRead = {
  readonly found: readonly EnemyBattlerPage[];
  readonly problem: string | null;
};

/**
 * What the brush says of a battler's level while J-LevelMaster is on: each map gives its own, which the pointer shows.
 */
const LEVEL_WORDS = 'Its level follows the map it lands on, shown beside the pointer.';

/**
 * Words what the brush places for the enemy picked: a copy of the most common of the enemy's battlers already placed, or
 * the game's most common battler for an enemy placed nowhere yet.
 * @param {BattlerLook} look What it places.
 * @returns {string} The line.
 */
const lookWords = (look: BattlerLook): string =>
{
  if (look.of === 0)
  {
    return 'No battler of this enemy stands on any saved map yet, so each click places the game\'s most common battler, with no picture.';
  }

  return look.of === 1
    ? 'Each click places a battler like the one this enemy already has.'
    : `Each click places a battler like ${look.copies} of the ${look.of} this enemy already has.`;
};

/**
 * Words why something the brush reads could not be read.
 * @param {unknown} error What went wrong.
 * @returns {string} The reason, as the error gives it.
 */
const reasonOf = (error: unknown): string =>
{
  return error instanceof Error ? error.message : String(error);
};

/**
 * The battler brush, at the top of the Stamps panel: pick an enemy by name, and each click on a map places a battler of
 * it, shaped like most of its battlers already placed, as one step. While J-LevelMaster is on, each battler starts at the
 * level its map calls for (see battlerLevelFit), which the pointer says before the click. Esc, or picking the stamp tool's
 * tool again, puts it down; picking the same enemy again puts it down too.
 * @param {PalettePickerProps & { setup: BattlerSetup }} props How to take up a stamp, the stamp in hand, and what the
 * brush reads battlers with.
 * @returns {React.JSX.Element} The brush.
 */
const BattlerBrush = (props: PalettePickerProps & { readonly setup: BattlerSetup }) =>
{
  const { takeUp, putDown, inHand, newStampId, setup } = props;
  const { api, hub, openDocument } = useMapEditorServices();
  const enemies = useEnemies(api);
  const [ held, setHeld ] = useState<HeldBattler | null>(null);
  const [ reading, setReading ] = useState(false);
  const [ problem, setProblem ] = useState<string | null>(null);

  // only the latest pick counts, however its battlers arrive.
  const latest = useRef(0);
  const holding = held !== null && inHand === held.stampId;

  /**
   * Holds the levels set for each map in Map Properties, which every battler placed reads, while J-LevelMaster is on to
   * read a battler's level at all. Levels that cannot be read leave each map with the level its battlers already use, and
   * the brush says why.
   * @returns {Promise<string | null>} Settles once they are held, with null, or with why they could not be read.
   */
  const holdLevels = (): Promise<string | null> =>
  {
    if (setup.levels === false)
    {
      return Promise.resolve(null);
    }

    return openDocument(NEW_BATTLER_LEVELS_DOCUMENT)
      .then(() => null)
      .catch((error: unknown) => `The levels set for each map could not be read (${reasonOf(error)}), so each map's battlers alone say which level a battler takes.`);
  };

  /**
   * Takes up a battler of an enemy as the brush, once its battlers already placed, and the levels set for each map, are
   * read.
   * @param {EnemyOption | null} option The enemy, or null for none.
   */
  const pick = (option: EnemyOption | null) =>
  {
    if (option === null)
    {
      return;
    }

    latest.current += 1;
    const ask = latest.current;
    const name = enemies[option.id]?.name ?? '';
    const load = api?.loadEnemyBattlerPages;
    const read: Promise<EnemyBattlerPage[]> = load === undefined ? Promise.resolve([]) : load.call(api, option.id);
    setReading(true);
    setProblem(null);

    // a project whose battlers cannot be read still places the game's most common battler, and says why.
    const battlers: Promise<BattlersRead> = read
      .then(found => ({ found, problem: null }))
      .catch((error: unknown) => ({ found: [], problem: `The enemy's battlers could not be read (${reasonOf(error)}), so this is the game's most common battler.` }));
    Promise.all([ battlers, holdLevels() ])
      .then(([ { found, problem: unread }, unheld ]) =>
      {
        if (ask !== latest.current)
        {
          return;
        }

        const look = battlerLookOf(option.id, name, found);
        const stamp = battlerStamp(newStampId(), look);
        takeUp(stamp, setup.levels ? battlerLevelFit(hub, stamp, option.id) : null);
        setHeld({ stampId: stamp.id, enemyId: option.id, look });
        setProblem(unread ?? unheld);
      })
      .finally(() =>
      {
        if (ask === latest.current)
        {
          setReading(false);
        }
      });
  };

  const options = enemyOptions(enemies);
  const value = held === null ? null : options.find(option => option.id === held.enemyId) ?? null;
  return (
    <Box sx={{ px: 1.5, pt: 1 }} data-testid={'battler-brush'}>
      <Typography variant={'subtitle2'}>
        Battlers
      </Typography>
      <Typography variant={'caption'} color={'text.secondary'} sx={{ display: 'block', mb: 0.75 }}>
        Pick an enemy, then click the map to place it; Esc puts it down.
      </Typography>
      <Autocomplete<EnemyOption, false, false>
        size={'small'}
        options={options}
        value={value}
        getOptionLabel={option => option.label}
        isOptionEqualToValue={(option, other) => option.id === other.id}
        onChange={(_event, option) => pick(option)}
        renderInput={params => <TextField {...params} label={'Enemy'}/>}
      />
      {reading && (
        <Typography variant={'caption'} color={'text.secondary'} sx={{ display: 'block', mt: 0.5 }}>
          Reading the enemy's battlers
        </Typography>
      )}
      {reading === false && holding && (
        <Box sx={{ mt: 0.5 }}>
          <Typography variant={'caption'} color={'text.secondary'} sx={{ display: 'block' }} data-testid={'battler-brush-look'}>
            {problem ?? lookWords(held.look)}
          </Typography>
          {setup.levels && (
            <Typography variant={'caption'} color={'text.secondary'} sx={{ display: 'block' }} data-testid={'battler-brush-level'}>
              {LEVEL_WORDS}
            </Typography>
          )}
          <Button size={'small'} onClick={putDown}>
            Put it down
          </Button>
        </Box>
      )}
    </Box>
  );
};

/**
 * Makes the battler brush's picker.
 * @param {BattlerSetup} setup What the brush reads battlers with: whether J-LevelMaster is on, among the rest.
 * @returns {ComponentType<PalettePickerProps>} The picker.
 */
const battlerBrushFor = (setup: BattlerSetup): ComponentType<PalettePickerProps> =>
{
  const Picker = (props: PalettePickerProps) => <BattlerBrush {...props} setup={setup}/>;
  Picker.displayName = 'Palette(jabs.battlers)';
  return Picker;
};

export { BattlerBrush, battlerBrushFor, LEVEL_WORDS, lookWords };
