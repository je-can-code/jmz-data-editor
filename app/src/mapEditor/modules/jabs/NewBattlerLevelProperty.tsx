import React, { useEffect, useState, type ComponentType } from 'react';
import { Alert, Stack, TextField, Typography } from '@mui/material';
import type { MapDocument } from '../../core/model/MapDocument.ts';
import type { MapPropertiesBodyProps } from '../../core/modules/PluginModule.ts';
import { useMapEditorServices } from '../../services/MapEditorServicesContext.tsx';
import { useRevision } from '../../views/quickPanel/quickResources.ts';
import { battlersOn, mapLevelOf, nextBattlerWords, touchesBattlerLevels } from './battlerLevelRule.ts';
import { LEVEL_TOP, levelSetFor, NEW_BATTLER_LEVELS_DOCUMENT, saveNewBattlerLevels, setNewBattlerLevel, typedLevel } from './battlerLevelSetting.ts';

/**
 * What the setting is called.
 */
const LABEL = 'New battlers start at level';

/**
 * What an empty box means, under it.
 */
const EMPTY_MEANS = 'Empty: the level this map\'s battlers already use, or the enemy\'s own.';

/**
 * Draws the setting again whenever its map changes in a way that can change the levels its battlers give, which the line
 * under it reads; never for a brush stroke's tiles or a moved event, which change many times a second.
 * @param {MapDocument} map The map.
 */
const useBattlerLevelsRevision = (map: MapDocument): void =>
{
  const [ , setTick ] = useState(0);
  useEffect(() => map.subscribe(change =>
  {
    if (touchesBattlerLevels(change))
    {
      setTick(current => current + 1);
    }
  }), [ map ]);
};

/**
 * Holds the levels set in Map Properties, opening them as the setting first shows, and draws the setting again as they
 * open and whenever they change, here or in another window.
 * @returns {{ held: boolean, problem: string | null }} Whether the window holds them, and why they could not be opened.
 */
const useLevelsDocument = (): { held: boolean; problem: string | null } =>
{
  const { hub, openDocument } = useMapEditorServices();
  const [ problem, setProblem ] = useState<string | null>(null);
  const [ , setOpened ] = useState(false);
  const held = hub.has(NEW_BATTLER_LEVELS_DOCUMENT);
  useRevision(held ? hub.document(NEW_BATTLER_LEVELS_DOCUMENT) : null);

  useEffect(() =>
  {
    // an open landing after the setting has gone has nothing left to draw.
    let showing = true;
    openDocument(NEW_BATTLER_LEVELS_DOCUMENT)
      .then(() =>
      {
        if (showing)
        {
          setOpened(true);
        }
      })
      .catch((error: unknown) =>
      {
        if (showing)
        {
          setProblem(`The levels set for each map could not be read: ${error instanceof Error ? error.message : String(error)}`);
        }
      });
    return () =>
    {
      showing = false;
    };
  }, [ openDocument ]);

  return { held, problem };
};

/**
 * The setting's box: a whole number, or nothing at all, committed by leaving it or by Enter, Escape putting back the
 * level set, which it also follows when it changes elsewhere, such as by an undo. Text it cannot take is refused, saying
 * what it takes, and put back.
 * @param {{ level: number | null, onCommit: (level: number | null) => void }} props The level set, or null for none, and
 * what a new one does.
 * @returns {React.JSX.Element} The box.
 */
const LevelBox = (props: { readonly level: number | null; readonly onCommit: (level: number | null) => void }) =>
{
  const { level, onCommit } = props;
  const shown = level === null ? '' : String(level);
  const [ draft, setDraft ] = useState(shown);
  const typed = typedLevel(draft);

  useEffect(() =>
  {
    setDraft(shown);
  }, [ shown ]);

  /**
   * Hands on a level that differs from the one set, and puts back the one set otherwise.
   */
  const commit = () =>
  {
    if (typed === null || typed.level === level)
    {
      setDraft(shown);
      return;
    }

    onCommit(typed.level);
  };

  return (
    <TextField
      label={LABEL}
      value={draft}
      size={'small'}
      error={typed === null}
      helperText={typed === null ? `A whole number from ${-LEVEL_TOP} to ${LEVEL_TOP}, or empty.` : EMPTY_MEANS}
      slotProps={{ htmlInput: { inputMode: 'numeric' } }}
      onChange={event => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={event =>
      {
        if (event.key === 'Escape')
        {
          setDraft(shown);
          return;
        }

        if (event.key === 'Enter')
        {
          commit();
        }
      }}
      data-testid={'new-battler-level'}
    />
  );
};

/**
 * The level a map's new battlers start at, in Map Properties while J-ABS and J-LevelMaster are on: a box that sets it for
 * every battler the battler brush places on the map, whatever its enemy, or, left empty, leaves each to the level the
 * map's battlers already use, or the enemy's own; and under it, the level the next battler gets. Setting or clearing it
 * is one step in the map's history, and is written to the editor's own data at once, never to the map's file. The line
 * under it follows the map's battlers as they change.
 * @param {MapPropertiesBodyProps} props The map.
 * @returns {React.JSX.Element} The setting.
 */
const NewBattlerLevelProperty = (props: MapPropertiesBodyProps) =>
{
  const { mapId, map } = props;
  const { hub } = useMapEditorServices();
  const { held, problem } = useLevelsDocument();
  const [ failure, setFailure ] = useState<string | null>(null);
  useBattlerLevelsRevision(map);

  if (held === false)
  {
    return (
      <Typography variant={'body2'} color={'text.secondary'} data-testid={'new-battler-level-waiting'}>
        {problem ?? 'Reading the levels set for each map…'}
      </Typography>
    );
  }

  /**
   * Sets the level, or clears it, as one step, and writes the levels at once, saying why when either cannot be done.
   * @param {number | null} level The level, or null to clear it.
   */
  const change = (level: number | null) =>
  {
    try
    {
      if (setNewBattlerLevel(hub, mapId, level) === null)
      {
        return;
      }

      setFailure(null);
      saveNewBattlerLevels(hub)
        .then(outcome => setFailure(outcome.ok ? null : outcome.message))
        .catch((error: unknown) => setFailure(`The levels could not be saved: ${error instanceof Error ? error.message : String(error)}`));
    }
    catch (error)
    {
      setFailure(error instanceof Error ? error.message : String(error));
    }
  };

  const setting = levelSetFor(hub, mapId);
  return (
    <Stack spacing={0.75} data-testid={'new-battler-level-property'}>
      <LevelBox level={setting} onCommit={change}/>
      <Typography variant={'body2'} color={'text.secondary'} data-testid={'new-battler-level-next'}>
        {nextBattlerWords(setting, mapLevelOf(battlersOn(map.events)))}
      </Typography>
      {failure !== null && (
        <Alert severity={'error'} sx={{ py: 0 }} onClose={() => setFailure(null)}>
          {failure}
        </Alert>
      )}
    </Stack>
  );
};

/**
 * Makes the setting, for J-ABS's section of Map Properties.
 * @returns {ComponentType<MapPropertiesBodyProps>} The setting.
 */
const newBattlerLevelPropertyFor = (): ComponentType<MapPropertiesBodyProps> =>
{
  const Property = (props: MapPropertiesBodyProps) => <NewBattlerLevelProperty {...props}/>;
  Property.displayName = 'MapProperty(jabs.newBattlerLevel)';
  return Property;
};

export { NewBattlerLevelProperty, newBattlerLevelPropertyFor };
