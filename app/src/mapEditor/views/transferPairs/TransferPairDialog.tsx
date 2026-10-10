import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import type { MapEditorApi } from '../../core/api/MapEditorApi.ts';
import { mapLabel, mapOptions, type MapOption } from '../../core/commands/editors/mapOptions.ts';
import type { LandingGround, LandingProblem } from '../../core/locations/landingCheck.ts';
import { MAP_INFOS_KEY, mapDocumentKey, TILESETS_KEY } from '../../core/model/documentKeys.ts';
import type { MapDocument } from '../../core/model/MapDocument.ts';
import type { TilesetsDocument } from '../../core/model/JsonDocument.ts';
import type { RmmzMapInfo } from '../../core/model/rmmzTypes.ts';
import type { MapCell, MapSize } from '../../core/renderer/camera.ts';
import { lookAtDocument } from '../../core/sync/lookAtDocument.ts';
import { defaultDoorLook, type DoorLook, type DoorSprite } from '../../core/transferPairs/doorSprites.ts';
import { placeTransfers, spotProblems } from '../../core/transferPairs/pairPlacement.ts';
import { NO_PICKS, pairPlanOf, partnerOf, type PairKind, type PairMap, type PairPicks, type PairPlan, type PairWays } from '../../core/transferPairs/pairPlans.ts';
import { edgesAt, insideArrival, stripCentredOn, stripFromDrag, stripRect } from '../../core/transferPairs/pairShapes.ts';
import { pairReadout, placedWords, tileWords } from '../../core/transferPairs/pairWords.ts';
import type { GlancedMap } from '../../render/useMapGlance.tsx';
import { useMapEditorServices } from '../../services/MapEditorServicesContext.tsx';
import { placementSourcesOf } from '../../services/transferPlacement.ts';
import { EditorEnvironmentProvider, useMapInfos, type HandBuiltEditorEnvironment } from '../commandEditors/editorEnvironment.tsx';
import { documentLabel } from '../documentLabels.ts';
import { PairChoiceFields } from './PairChoiceFields.tsx';
import { PairMapPane, type PaneMarks } from './PairMapPane.tsx';

/**
 * Where the transfer placer starts, and who hears how it ends.
 */
type TransferPairDialogProps = {
  /**
   * The map the transfer leaves from, which the left pane shows: the map the author asked from.
   */
  readonly mapId: number;

  /**
   * The tile the author asked from, or null: the door's tile, or where a strip along an edge starts.
   */
  readonly start: MapCell | null;

  /**
   * Hears the placer closed, with what was placed in words for the author, or null when nothing was.
   * @param {string | null} placed The words, or null.
   */
  readonly onClose: (placed: string | null) => void;
};

/**
 * Nothing marked on a pane.
 */
const NO_MARKS: PaneMarks = { areas: [], ghosts: [], landing: null };

/**
 * Settles a load into state, unless the component has moved on by the time it lands; a failed load leaves the state as
 * it was.
 * @param {Promise<T> | undefined} pending The load, or undefined for none.
 * @param {(value: T) => void} settle Stores what loaded.
 * @returns {() => void} Stops listening for it.
 */
const settleWhileCurrent = <T,>(pending: Promise<T> | undefined, settle: (value: T) => void): (() => void) =>
{
  let current = true;
  pending?.then(value =>
  {
    if (current)
    {
      settle(value);
    }
  }).catch(() => undefined);

  return () =>
  {
    current = false;
  };
};

/**
 * Reads the project's door pictures and its sounds, once the placer opens.
 * @param {MapEditorApi | null} api The server, or null for none.
 * @returns {{ sprites: readonly DoorSprite[], sounds: readonly string[] }} What was read; nothing until it lands, or
 * without a server that can read it.
 */
const usePairResources = (api: MapEditorApi | null): { sprites: readonly DoorSprite[]; sounds: readonly string[] } =>
{
  const [ sprites, setSprites ] = useState<readonly DoorSprite[]>([]);
  const [ sounds, setSounds ] = useState<readonly string[]>([]);
  useEffect(() => settleWhileCurrent(api?.loadDoorSprites?.(), setSprites), [ api ]);
  useEffect(() => settleWhileCurrent(api?.listAudio?.('se'), setSounds), [ api ]);
  return { sprites, sounds };
};

/**
 * Reads the project's tilesets, held here or else looked at, for judging the landings of what is placed.
 * @returns {TilesetsDocument | null} The tilesets, or null until read.
 */
const useTilesets = (): TilesetsDocument | null =>
{
  const { hub, sync } = useMapEditorServices();
  const [ tilesets, setTilesets ] = useState<TilesetsDocument | null>(null);
  useEffect(() => settleWhileCurrent(lookAtDocument({ hub, sync }, TILESETS_KEY), document => setTilesets(document as TilesetsDocument)), [ hub, sync ]);
  return tilesets;
};

/**
 * Names maps: from the map tree this window holds, which carries renames not yet saved, or else from the tree read from
 * the server, or else by their number.
 * @param {readonly (RmmzMapInfo | null)[] | null} infos The tree as read from the server, or null until read.
 * @returns {(mapId: number) => string} Names a map.
 */
const useMapNames = (infos: readonly (RmmzMapInfo | null)[] | null): ((mapId: number) => string) =>
{
  const { hub } = useMapEditorServices();
  return (mapId: number) =>
  {
    const held = hub.has(MAP_INFOS_KEY) ? hub.document(MAP_INFOS_KEY).valueAt([ mapId ]) as RmmzMapInfo | null | undefined : null;
    const row = held ?? infos?.[mapId] ?? null;
    return row === null ? documentLabel(mapDocumentKey(mapId)) : row.name;
  };
};

/**
 * Works out the picks to start from: on a tile along the map's edge, a strip starting there; anywhere else, a door there.
 * @param {MapCell | null} start The tile asked from, or null.
 * @param {MapSize} size The map's size.
 * @returns {PairPicks} The picks.
 */
const startingPicks = (start: MapCell | null, size: MapSize): PairPicks =>
{
  if (start === null)
  {
    return NO_PICKS;
  }

  return edgesAt(start, size).length > 0
    ? { ...NO_PICKS, kind: 'edge', strip: stripFromDrag(start, start, size) }
    : { ...NO_PICKS, kind: 'door', door: start };
};

/**
 * Works out what each pane marks: on the left, the door with its picture or the strip, and where the way back lands; on
 * the right, the way out, the other strip or the landing, and where the player lands there.
 * @param {PairPicks} picks What the author picked.
 * @param {PairPlan | null} plan What the picks place, or null while a pick is missing.
 * @param {DoorLook} look The door's picture.
 * @param {readonly (LandingProblem | null)[]} problems Why the player cannot land where each end sends them.
 * @param {MapSize | null} near The left map's size, or null until it opens.
 * @param {MapSize | null} far The right map's size, or null until it opens.
 * @returns {{ near: PaneMarks, far: PaneMarks }} The marks.
 */
const paneMarks = (
  picks: PairPicks,
  plan: PairPlan | null,
  look: DoorLook,
  problems: readonly (LandingProblem | null)[],
  near: MapSize | null,
  far: MapSize | null,
): { near: PaneMarks; far: PaneMarks } =>
{
  const { kind, ways, door, exit, strip, landing } = picks;
  const landed = (index: number, cell: MapCell | null) => (cell === null ? null : { cell, ok: (problems[index] ?? null) === null });
  const tile = (cell: MapCell) => ({ x: cell.x, y: cell.y, width: 1, height: 1 });

  // the left map: the door and its picture, or the strip; and, for a pair, where the way back lands.
  const back = plan !== null && plan.ends.length > 1 ? plan.ends[1].destination : null;
  const nearMarks: PaneMarks = kind === 'door'
    ? {
      areas: door === null ? [] : [ tile(door) ],
      ghosts: door === null ? [] : [ { ...door, image: { tileId: 0, ...look }, priorityType: 1 } ],
      landing: landed(1, back),
    }
    : { areas: strip === null || near === null ? [] : [ stripRect(strip, near) ], ghosts: [], landing: landed(1, back) };

  // the right map: the way out or the other strip, and where the player lands; or, one way, the landing alone.
  const there = plan === null ? null : plan.ends[0].destination;
  if (ways === 'one')
  {
    return { near: nearMarks, far: { ...NO_MARKS, landing: landed(0, there ?? landing) } };
  }

  if (kind === 'door')
  {
    return { near: nearMarks, far: { areas: exit === null ? [] : [ tile(exit) ], ghosts: [], landing: landed(0, there ?? (exit === null ? null : insideArrival(exit))) } };
  }

  const partner = far === null ? null : partnerOf(picks, far);
  return { near: nearMarks, far: { areas: partner === null || far === null ? [] : [ stripRect(partner, far) ], ghosts: [], landing: landed(0, there) } };
};

/**
 * Words what each pane asks of the author, under its map's name.
 * @param {PairKind} kind The kind.
 * @param {PairWays} ways Both ways or one.
 * @returns {{ near: string, far: string }} The words.
 */
const paneHints = (kind: PairKind, ways: PairWays): { near: string; far: string } =>
{
  const near = kind === 'door' ? 'Click the door' : 'Drag along the edge';
  if (ways === 'one')
  {
    return { near, far: 'Click where the player lands' };
  }

  return kind === 'door'
    ? { near, far: 'Click the way out' }
    : { near, far: 'Click to move the other strip' };
};

/**
 * One pane's head: its map's name, what it asks of the author, and the tile under the pointer.
 * @param {{ name: string, hint: string, hover: MapCell | null, testId: string }} props The words.
 * @returns {React.JSX.Element} The head.
 */
const PaneHead = (props: { readonly name: string; readonly hint: string; readonly hover: MapCell | null; readonly testId: string }) =>
{
  const { name, hint, hover, testId } = props;
  return (
    <Stack direction={'row'} spacing={1} alignItems={'baseline'} sx={{ px: 0.5, minHeight: 24 }}>
      <Typography variant={'body2'} sx={{ fontWeight: 600 }} noWrap>{name}</Typography>
      <Typography variant={'caption'} color={'text.secondary'} noWrap sx={{ flex: 1 }}>{hint}</Typography>
      <Typography variant={'caption'} color={'text.secondary'} data-testid={testId}>{hover === null ? '' : tileWords(hover)}</Typography>
    </Stack>
  );
};

/**
 * The placer's body, inside the environment its map list reads the tree through.
 * @param {TransferPairDialogProps} props Where it starts, and who hears how it ends.
 * @returns {React.JSX.Element} The body.
 */
const TransferPairBody = (props: TransferPairDialogProps) =>
{
  const { mapId, start, onClose } = props;
  const services = useMapEditorServices();
  const { api, hub, pairChoices } = services;
  const infos = useMapInfos();
  const mapName = useMapNames(infos);
  const options = useMemo<MapOption[]>(() => (infos === null ? [] : mapOptions(infos)), [ infos ]);
  const choices = useSyncExternalStore(pairChoices.subscribe, pairChoices.current);
  const { sprites, sounds } = usePairResources(api);
  const tilesets = useTilesets();

  // the left map is the one asked from, which the window holds; the right one is chosen.
  const held = hub.map(mapDocumentKey(mapId));
  const nearSize: MapSize = { width: held.width, height: held.height };
  const [ picks, setPicks ] = useState<PairPicks>(() => startingPicks(start, nearSize));
  const [ farMapId, setFarMapId ] = useState<number | null>(null);
  const [ nearGround, setNearGround ] = useState<LandingGround | null>(null);
  const [ farOpened, setFarOpened ] = useState<GlancedMap | null>(null);
  const [ farGround, setFarGround ] = useState<LandingGround | null>(null);
  const [ hovers, setHovers ] = useState<{ near: MapCell | null; far: MapCell | null }>({ near: null, far: null });
  const [ dragFrom, setDragFrom ] = useState<MapCell | null>(null);
  const [ refusal, setRefusal ] = useState<string | null>(null);
  const [ placing, setPlacing ] = useState(false);

  // what the transfers look and sound like: what was chosen, the door's picture as the project's doors use most till one is.
  const look = choices.doorLook ?? defaultDoorLook(sprites);
  const looks = { door: look, sounds: { door: choices.doorSound, movement: choices.movementSound } };
  const near: PairMap = { mapId, name: mapName(mapId), size: nearSize };
  const opened = farOpened !== null && farOpened.map.mapId === farMapId ? farOpened : null;
  const far: PairMap | null = farMapId === null || opened === null
    ? null
    : { mapId: farMapId, name: mapName(farMapId), size: { width: opened.map.width, height: opened.map.height } };
  const plan = far === null ? null : pairPlanOf(picks, near, far, looks);

  // each end's landing judged on the map as it stands, the left one's or the right one's.
  const groundOf = (landsOn: number): LandingGround | null =>
  {
    if (landsOn === mapId)
    {
      return nearGround;
    }

    return landsOn === farMapId && farGround !== null && farGround.map.mapId === farMapId ? farGround : null;
  };
  const problems = plan === null
    ? []
    : plan.ends.map(end => groundOf(end.destination.mapId)?.problemAt(end.destination.x, end.destination.y) ?? null);

  // where each end stands judged on its map as the author sees it, as placing it would judge it: the left map held here,
  // the right one as opened.
  const placedOn = (endMapId: number): MapDocument | null =>
  {
    if (endMapId === mapId)
    {
      return held;
    }

    return opened !== null && opened.map.mapId === endMapId ? opened.map : null;
  };
  const spots = plan === null ? [] : spotProblems(plan, placedOn, mapName);
  const readout = pairReadout(picks, far, plan, problems, mapName, spots);
  const marks = paneMarks(picks, plan, look, problems, nearSize, far === null ? null : far.size);
  const hints = paneHints(picks.kind, picks.ways);

  /**
   * Takes new picks, clearing what the last refusal said.
   * @param {Partial<PairPicks>} next The picks changed.
   */
  const pick = (next: Partial<PairPicks>) =>
  {
    setRefusal(null);
    setPicks(current => ({ ...current, ...next }));
  };

  /**
   * Hears the left button on the left map: the door's tile, or the start of a strip, which must lie on the map's edge.
   * @param {MapCell} cell The tile.
   */
  const pressNear = (cell: MapCell) =>
  {
    if (picks.kind === 'door')
    {
      pick({ door: cell });
      return;
    }

    const strip = stripFromDrag(cell, cell, nearSize);
    setDragFrom(strip === null ? null : cell);
    if (strip === null)
    {
      setRefusal('Start the strip on one of the map\'s edges.');
      return;
    }

    pick({ strip, partner: null });
  };

  /**
   * Hears the pointer dragged across the left map: a strip carried along its edge.
   * @param {MapCell} cell The tile under the pointer.
   */
  const dragNear = (cell: MapCell) =>
  {
    if (picks.kind === 'edge' && dragFrom !== null)
    {
      pick({ strip: stripFromDrag(dragFrom, cell, nearSize), partner: null });
    }
  };

  /**
   * Hears the left button on the right map, or the pointer dragged across it: the way out, the landing, or the other strip
   * moved along its edge.
   * @param {MapCell} cell The tile.
   */
  const pressFar = (cell: MapCell) =>
  {
    if (picks.ways === 'one')
    {
      pick({ landing: cell });
      return;
    }

    if (picks.kind === 'door')
    {
      pick({ exit: cell });
      return;
    }

    const partner = far === null ? null : partnerOf(picks, far.size);
    if (partner !== null && far !== null)
    {
      pick({ partner: stripCentredOn(partner, cell, far.size) });
    }
  };

  /**
   * Places what the picks plan, as one step, closing with what was placed, or saying why nothing was.
   */
  const place = () =>
  {
    if (plan === null || tilesets === null || readout.problem)
    {
      return;
    }

    setPlacing(true);
    placeTransfers(placementSourcesOf(services, tilesets, mapName), plan)
      .then(outcome =>
      {
        setPlacing(false);
        if (outcome.ok)
        {
          onClose(placedWords(picks));
          return;
        }

        setRefusal(outcome.message);
      })
      .catch((error: unknown) =>
      {
        setPlacing(false);
        setRefusal(`Nothing was placed: ${String(error)}`);
      });
  };

  /**
   * Hears the pointer dragged across the right map: the other strip carried along its edge, for an edge pair.
   * @param {MapCell} cell The tile under the pointer.
   */
  const dragFar = (cell: MapCell) =>
  {
    if (picks.kind === 'edge' && picks.ways === 'both')
    {
      pressFar(cell);
    }
  };

  const problem = refusal !== null || readout.problem;
  const ready = plan !== null && tilesets !== null && readout.problem === false && placing === false;
  return (
    <>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, overflow: 'hidden' }}>
        <Stack direction={'row'} spacing={2} alignItems={'center'} flexWrap={'wrap'} useFlexGap sx={{ pt: 1 }}>
          <ToggleButtonGroup
            size={'small'}
            exclusive
            value={picks.kind}
            onChange={(_event, kind: PairKind | null) => kind !== null && pick({ kind })}
          >
            <ToggleButton value={'door'} data-testid={'pair-kind-door'}>Door</ToggleButton>
            <ToggleButton value={'edge'} data-testid={'pair-kind-edge'}>Map edge</ToggleButton>
          </ToggleButtonGroup>
          <ToggleButtonGroup
            size={'small'}
            exclusive
            value={picks.ways}
            onChange={(_event, ways: PairWays | null) => ways !== null && pick({ ways })}
          >
            <ToggleButton value={'both'} data-testid={'pair-ways-both'}>Both ways</ToggleButton>
            <ToggleButton value={'one'} data-testid={'pair-ways-one'}>One way</ToggleButton>
          </ToggleButtonGroup>
          <Autocomplete
            size={'small'}
            sx={{ width: 320 }}
            options={options}
            value={options.find(option => option.id === farMapId) ?? null}
            isOptionEqualToValue={(option, current) => option.id === current.id}
            getOptionLabel={option => mapLabel(option.id, option.name)}
            renderOption={(optionProps, option) =>
            {
              const { key, ...rest } = optionProps;
              return (
                <Box component={'li'} key={key} {...rest} sx={{ pl: `${16 + option.depth * 14}px !important` }}>
                  {mapLabel(option.id, option.name)}
                </Box>
              );
            }}
            onChange={(_event, chosen) =>
            {
              setFarMapId(chosen === null ? null : chosen.id);
              setFarOpened(null);
              pick({ exit: null, partner: null, landing: null });
            }}
            renderInput={params => <TextField {...params} label={'Leads to'} placeholder={'Choose a map'}/>}
          />
        </Stack>
        <PairChoiceFields
          api={api}
          kind={picks.kind}
          look={look}
          sprites={sprites}
          sounds={sounds}
          choices={choices}
          onChoose={chosen => pairChoices.remember(chosen)}
        />
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', gap: 1.5 }}>
          <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <PaneHead name={near.name} hint={hints.near} hover={hovers.near} testId={'pair-near-hover'}/>
            <Box sx={{ flex: 1, minHeight: 0, position: 'relative', border: 1, borderColor: 'divider' }}>
              <PairMapPane
                mapId={mapId}
                focus={start}
                marks={marks.near}
                testId={'pair-near-map'}
                onPress={pressNear}
                onDrag={dragNear}
                onHover={cell => setHovers(current => ({ ...current, near: cell }))}
                onOpened={() => undefined}
                onGround={setNearGround}
              />
            </Box>
          </Box>
          <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <PaneHead name={farMapId === null ? 'No map chosen' : mapName(farMapId)} hint={hints.far} hover={hovers.far} testId={'pair-far-hover'}/>
            <Box sx={{ flex: 1, minHeight: 0, position: 'relative', border: 1, borderColor: 'divider' }}>
              {farMapId === null
                ? (
                  <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'text.secondary' }}>
                    <Typography variant={'body2'}>Choose the map the transfer leads to.</Typography>
                  </Box>
                )
                : (
                  <PairMapPane
                    key={farMapId}
                    mapId={farMapId}
                    focus={null}
                    marks={far === null ? NO_MARKS : marks.far}
                    testId={'pair-far-map'}
                    onPress={pressFar}
                    onDrag={dragFar}
                    onHover={cell => setHovers(current => ({ ...current, far: cell }))}
                    onOpened={setFarOpened}
                    onGround={setFarGround}
                  />
                )}
            </Box>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Typography variant={'body2'} color={problem ? 'error' : 'text.secondary'} sx={{ flex: 1, pl: 2 }} data-testid={'pair-readout'}>
          {refusal ?? readout.text}
        </Typography>
        <Button onClick={() => onClose(null)}>
          Cancel
        </Button>
        <Button variant={'contained'} disabled={ready === false} onClick={place} data-testid={'pair-place'}>
          Place
        </Button>
      </DialogActions>
    </>
  );
};

/**
 * Places a transfer, the way Jeremy builds them: the map it leaves from on the left, the map it leads to on the right,
 * each a real map to click on. A door into a building is a door clicked outside and a way out clicked inside, the player
 * arriving one tile north of it; a map's edge is a strip dragged along an edge on the left, its partner centred on the
 * opposite edge on the right until clicked elsewhere along it; either may go one way only, the landing clicked on the
 * right. The door's picture, its creak and the sound of passing through are chosen above, each remembered for as long as
 * the window is open. Where the player lands is marked on each map, cyan where they can stand and red where they
 * cannot, with the reason under the maps, and an end on tiles another event already uses is said there too, in the words
 * placing would refuse it in; nothing is placed until every end and every landing passes. Placing makes every end in
 * one step, which undoes from either map; a click outside the placer does nothing, so picks are never lost to a stray
 * click.
 * @param {TransferPairDialogProps} props Where to start, and who hears how it ends.
 * @returns {React.JSX.Element} The placer.
 */
const TransferPairDialog = (props: TransferPairDialogProps) =>
{
  const { onClose } = props;
  const { api, pluginHeaders } = useMapEditorServices();

  // the map list reads the map tree through the editors' environment, as the transfer editor's does.
  const environment = useMemo<HandBuiltEditorEnvironment>(() => ({ api, headers: pluginHeaders }), [ api, pluginHeaders ]);
  return (
    <Dialog
      open
      maxWidth={false}
      aria-labelledby={'transfer-pair-title'}
      onClose={(_event, reason) => reason !== 'backdropClick' && onClose(null)}
      sx={{ '& .MuiDialog-paper': { width: 'min(1500px, 96vw)', height: 'min(900px, 92vh)' } }}
      data-testid={'transfer-pair-dialog'}
    >
      <DialogTitle id={'transfer-pair-title'}>
        New transfer
      </DialogTitle>
      <EditorEnvironmentProvider environment={environment}>
        <TransferPairBody {...props}/>
      </EditorEnvironmentProvider>
    </Dialog>
  );
};

export { TransferPairDialog };
export type { TransferPairDialogProps };
