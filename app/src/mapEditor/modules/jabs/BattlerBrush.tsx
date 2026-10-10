import React, { useRef, useState, type ComponentType } from 'react';
import { Autocomplete, Box, Button, TextField, Typography } from '@mui/material';
import type { EnemyBattlerPage } from '../../core/api/MapEditorApi.ts';
import type { PalettePickerProps } from '../../core/modules/PluginModule.ts';
import { useMapEditorServices } from '../../services/MapEditorServicesContext.tsx';
import { battlerLookOf, battlerStamp, type BattlerLook } from './battlerLooks.ts';
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
 * Words what the brush places for the enemy picked: a copy of the most common of the enemy's battlers already placed,
 * at the enemy's own level where those give one of their own, or the game's most common battler for an enemy placed
 * nowhere yet.
 * @param {BattlerLook} look What it places.
 * @returns {string} The line.
 */
const lookWords = (look: BattlerLook): string =>
{
  if (look.of === 0)
  {
    return 'No battler of this enemy stands on any saved map yet, so each click places the game\'s most common battler, with no picture.';
  }

  const like = look.of === 1
    ? 'Each click places a battler like the one this enemy already has'
    : `Each click places a battler like ${look.copies} of the ${look.of} this enemy already has`;
  return look.levelLeft
    ? `${like}, but at the enemy's own level.`
    : `${like}.`;
};

/**
 * The battler brush, at the top of the Stamps panel: pick an enemy by name, and each click on a map places a battler of
 * it, shaped like most of its battlers already placed, as one step. Esc, or picking the stamp tool's tool again, puts it
 * down; picking the same enemy again puts it down too.
 * @param {PalettePickerProps} props How to take up a stamp, and the stamp in hand.
 * @returns {React.JSX.Element} The brush.
 */
const BattlerBrush = (props: PalettePickerProps) =>
{
  const { takeUp, putDown, inHand, newStampId } = props;
  const { api } = useMapEditorServices();
  const enemies = useEnemies(api);
  const [ held, setHeld ] = useState<HeldBattler | null>(null);
  const [ reading, setReading ] = useState(false);
  const [ problem, setProblem ] = useState<string | null>(null);

  // only the latest pick counts, however its battlers arrive.
  const latest = useRef(0);
  const holding = held !== null && inHand === held.stampId;

  /**
   * Takes up a battler of an enemy as the brush, once its battlers already placed are read.
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
    const battlers: Promise<EnemyBattlerPage[]> = load === undefined ? Promise.resolve([]) : load.call(api, option.id);
    setReading(true);
    setProblem(null);
    battlers
      .catch((error: unknown) =>
      {
        // a project whose battlers cannot be read still places the game's most common battler, and says why.
        setProblem(`The enemy's battlers could not be read (${error instanceof Error ? error.message : String(error)}), so this is the game's most common battler.`);
        return [];
      })
      .then(found =>
      {
        if (ask !== latest.current)
        {
          return;
        }

        const look = battlerLookOf(option.id, name, found);
        const stamp = battlerStamp(newStampId(), look);
        takeUp(stamp);
        setHeld({ stampId: stamp.id, enemyId: option.id, look });
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
 * @returns {ComponentType<PalettePickerProps>} The picker.
 */
const battlerBrushFor = (): ComponentType<PalettePickerProps> =>
{
  const Picker = (props: PalettePickerProps) => <BattlerBrush {...props}/>;
  Picker.displayName = 'Palette(jabs.battlers)';
  return Picker;
};

export { BattlerBrush, battlerBrushFor, lookWords };
