import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Alert, Box, Button, CircularProgress, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { Add, Close, FiberManualRecord } from '@mui/icons-material';
import type { MapDocument } from '../../core/model/MapDocument.ts';
import type { RmmzAudio, RmmzEncounter, RmmzTileset } from '../../core/model/rmmzTypes.ts';
import { editMapProperties, previewResize, resizeMap, type MapPropertyChanges } from '../../core/properties/mapPropertyEdits.ts';
import {
  formatRegionList,
  parseRegionList,
  parseWholeNumber,
  PROPERTY_LIMITS,
  SCROLL_TYPES,
} from '../../core/properties/propertyInputs.ts';
import { describeStranded, type StrandedArrival } from '../../core/properties/arrivals.ts';
import { MAX_MAP_SIZE, MIN_MAP_SIZE, RESIZE_ANCHORS, type ResizeAnchor } from '../../core/properties/resizeMap.ts';
import { useHeldMap, useStrandedArrivals, useTilesets, useWorkspace, useWorkspaceState } from '../workspaceHooks.tsx';
import { ModulePropertiesSection } from './ModulePropertiesSection.tsx';
import { CheckField, CommitNumberField, CommitTextField, FieldRow, SectionTitle, SelectField } from './propertyFields.tsx';

/**
 * Applies a change to the map's properties; one call is one step in the map's history.
 */
type EditProperties = (changes: MapPropertyChanges) => void;

/**
 * The limits of a map's size, as MZ allows it.
 */
const SIZE_LIMITS = { min: MIN_MAP_SIZE, max: MAX_MAP_SIZE };

/**
 * How each anchor reads when hovered, in the picker's reading order.
 */
const ANCHOR_WORDS: Readonly<Record<ResizeAnchor, string>> = {
  'top-left': 'Top left',
  'top': 'Top',
  'top-right': 'Top right',
  'left': 'Left',
  'center': 'Centre',
  'right': 'Right',
  'bottom-left': 'Bottom left',
  'bottom': 'Bottom',
  'bottom-right': 'Bottom right',
};

/**
 * The map's name on screen, its tileset, how it scrolls, and whether the player can dash.
 * @param {{ map: MapDocument, tilesets: readonly (RmmzTileset | null)[], edit: EditProperties }} props The map, the tilesets and the editor.
 * @returns {React.JSX.Element} The fields.
 */
const GeneralFields = (props: { map: MapDocument; tilesets: readonly (RmmzTileset | null)[]; edit: EditProperties }) =>
{
  const { map, tilesets, edit } = props;
  const tilesetOptions = tilesets
    .filter((tileset): tileset is RmmzTileset => tileset !== null)
    .map(tileset => ({ value: tileset.id, label: `${String(tileset.id).padStart(3, '0')} ${tileset.name}` }));
  const options = tilesetOptions.length > 0
    ? tilesetOptions
    : [ { value: map.tilesetId, label: `Tileset ${map.tilesetId}` } ];

  return (
    <Stack spacing={1.5}>
      <CommitTextField
        label={'Display name'}
        value={map.property('displayName')}
        helperText={'What the player sees on arriving.'}
        onCommit={displayName => edit({ displayName })}
      />
      <SelectField label={'Tileset'} value={map.tilesetId} options={options} onChange={tilesetId => edit({ tilesetId })}/>
      <SelectField label={'Scrolling'} value={map.property('scrollType')} options={SCROLL_TYPES} onChange={scrollType => edit({ scrollType })}/>
      <CheckField label={'No dashing on this map'} checked={map.property('disableDashing')} onChange={disableDashing => edit({ disableDashing })}/>
    </Stack>
  );
};

/**
 * Picks the edge or corner a resize keeps in place, laid out as the three-by-three grid it stands for.
 * @param {{ value: ResizeAnchor, onChange: (anchor: ResizeAnchor) => void }} props The chosen anchor and what to do on a change.
 * @returns {React.JSX.Element} The picker.
 */
const AnchorPicker = (props: { value: ResizeAnchor; onChange: (anchor: ResizeAnchor) => void }) =>
{
  const { value, onChange } = props;
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 28px)', gap: 0.25 }} role={'radiogroup'} aria-label={'Keep in place'}>
      {RESIZE_ANCHORS.map(anchor => (
        <Tooltip key={anchor} title={ANCHOR_WORDS[anchor]}>
          <IconButton
            size={'small'}
            role={'radio'}
            aria-checked={anchor === value}
            aria-label={ANCHOR_WORDS[anchor]}
            onClick={() => onChange(anchor)}
            sx={{ width: 28, height: 28, border: 1, borderColor: 'divider', borderRadius: 0.5 }}
          >
            <FiberManualRecord sx={{ fontSize: anchor === value ? 14 : 6 }} color={anchor === value ? 'primary' : 'disabled'}/>
          </IconButton>
        </Tooltip>
      ))}
    </Box>
  );
};

/**
 * The transfers a resize would leave pointing at the wrong tile, listed before it is made: transfers keep the tile
 * numbers they name, so each one landing where the resize moves or cuts off tiles would now land somewhere else.
 * @param {{ stranded: readonly StrandedArrival[] }} props The transfers.
 * @returns {React.JSX.Element} The warning.
 */
const StrandedTransfers = (props: { stranded: readonly StrandedArrival[] }) =>
{
  const { stranded } = props;
  return (
    <Alert severity={'warning'} sx={{ py: 0 }} data-testid={'resize-transfers'}>
      {`${stranded.length === 1 ? '1 transfer lands' : `${stranded.length} transfers land`} on this map and will not follow the resize:`}
      <Box component={'ul'} sx={{ m: 0, pl: 2 }}>
        {stranded.map(arrival => (
          <li key={`${arrival.mapId}:${arrival.eventId}:${arrival.pageIndex}:${arrival.x}:${arrival.y}`}>
            {describeStranded(arrival)}
          </li>
        ))}
      </Box>
    </Alert>
  );
};

/**
 * The map's size, changed with a resize that keeps one edge or corner in place and warns, before it is made, which
 * events would be left outside and which transfers landing on the map would no longer land where they did.
 * @param {{ map: MapDocument, mapId: number }} props The map.
 * @returns {React.JSX.Element} The fields.
 */
const SizeFields = (props: { map: MapDocument; mapId: number }) =>
{
  const { map, mapId } = props;
  const controller = useWorkspace();
  const [ width, setWidth ] = useState(String(map.width));
  const [ height, setHeight ] = useState(String(map.height));
  const [ anchor, setAnchor ] = useState<ResizeAnchor>('top-left');

  // an undo or another window's resize puts the fields back to the map's size.
  useEffect(() =>
  {
    setWidth(String(map.width));
    setHeight(String(map.height));
  }, [ map, map.width, map.height ]);

  const newWidth = parseWholeNumber(width, SIZE_LIMITS);
  const newHeight = parseWholeNumber(height, SIZE_LIMITS);
  const changed = newWidth !== null && newHeight !== null && (newWidth !== map.width || newHeight !== map.height);
  const plan = changed ? previewResize(map, newWidth, newHeight, anchor) : null;
  const dropped = plan === null ? 0 : plan.dropped.length;
  const transfers = useStrandedArrivals(mapId, plan);

  /**
   * Makes the resize, saying how many events went with it and how many transfers no longer land where they did.
   */
  const resize = () =>
  {
    if (newWidth === null || newHeight === null)
    {
      return;
    }

    resizeMap(controller.services.hub, mapId, newWidth, newHeight, anchor);
    const stranded = transfers.stranded.length;
    const losses = [
      ...(dropped > 0 ? [ `${dropped === 1 ? '1 event' : `${dropped} events`} outside the new size went with it` ] : []),
      ...(stranded > 0 ? [ `${stranded === 1 ? '1 transfer lands' : `${stranded} transfers land`} somewhere else now` ] : []),
    ];
    if (losses.length > 0)
    {
      controller.notify(`Resized; ${losses.join(', and ')}.`);
    }
  };

  return (
    <Stack spacing={1}>
      <Stack direction={'row'} spacing={1} useFlexGap flexWrap={'wrap'} alignItems={'flex-start'}>
        <TextField label={'Width'} value={width} size={'small'} error={newWidth === null} onChange={event => setWidth(event.target.value)} sx={{ width: 90 }}/>
        <TextField label={'Height'} value={height} size={'small'} error={newHeight === null} onChange={event => setHeight(event.target.value)} sx={{ width: 90 }}/>
        <Box>
          <Typography variant={'caption'} color={'text.secondary'} sx={{ display: 'block' }}>
            Keep in place
          </Typography>
          <AnchorPicker value={anchor} onChange={setAnchor}/>
        </Box>
      </Stack>
      {(newWidth === null || newHeight === null) && (
        <Typography variant={'caption'} color={'error'}>
          {`A map is ${MIN_MAP_SIZE} to ${MAX_MAP_SIZE} tiles on each side.`}
        </Typography>
      )}
      {dropped > 0 && (
        <Alert severity={'warning'} sx={{ py: 0 }}>
          {`${dropped === 1 ? '1 event stands' : `${dropped} events stand`} outside the new size and will be removed.`}
        </Alert>
      )}
      {transfers.stranded.length > 0 && <StrandedTransfers stranded={transfers.stranded}/>}
      {transfers.checking && (
        <Typography variant={'caption'} color={'text.secondary'}>
          Checking which transfers land on this map.
        </Typography>
      )}
      {transfers.failure !== null && (
        <Alert severity={'warning'} sx={{ py: 0 }}>
          {`The transfers landing on this map could not be checked: ${transfers.failure}`}
        </Alert>
      )}
      <Box>
        <Button size={'small'} variant={'outlined'} disabled={changed === false || transfers.checking} onClick={resize}>
          Resize
        </Button>
      </Box>
    </Stack>
  );
};

/**
 * A sound that can play when the player arrives: music or ambience.
 * @param {object} props The heading, whether it plays automatically, the sound, and what to do on a change.
 * @returns {React.JSX.Element} The fields.
 */
const AudioFields = (props: {
  title: string;
  autoplay: boolean;
  audio: RmmzAudio;
  onAutoplay: (autoplay: boolean) => void;
  onAudio: (audio: RmmzAudio) => void;
}) =>
{
  const { title, autoplay, audio, onAutoplay, onAudio } = props;
  return (
    <>
      <SectionTitle>{title}</SectionTitle>
      <Stack spacing={1}>
        <CheckField label={'Play on arriving'} checked={autoplay} onChange={onAutoplay}/>
        <CommitTextField label={'Track'} value={audio.name} onCommit={name => onAudio({ ...audio, name })}/>
        <FieldRow>
          <CommitNumberField label={'Volume'} value={audio.volume} limits={PROPERTY_LIMITS.volume} fullWidth onCommit={volume => onAudio({ ...audio, volume })}/>
          <CommitNumberField label={'Pitch'} value={audio.pitch} limits={PROPERTY_LIMITS.pitch} fullWidth onCommit={pitch => onAudio({ ...audio, pitch })}/>
          <CommitNumberField label={'Pan'} value={audio.pan} limits={PROPERTY_LIMITS.pan} fullWidth onCommit={pan => onAudio({ ...audio, pan })}/>
        </FieldRow>
      </Stack>
    </>
  );
};

/**
 * The battle backgrounds used for fights started on this map.
 * @param {{ map: MapDocument, edit: EditProperties }} props The map and the editor.
 * @returns {React.JSX.Element} The fields.
 */
const BattlebackFields = (props: { map: MapDocument; edit: EditProperties }) =>
{
  const { map, edit } = props;
  return (
    <>
      <SectionTitle>Battle backgrounds</SectionTitle>
      <Stack spacing={1}>
        <CheckField label={'Use these for battles here'} checked={map.property('specifyBattleback')} onChange={specifyBattleback => edit({ specifyBattleback })}/>
        <CommitTextField label={'Floor'} value={map.property('battleback1Name')} onCommit={battleback1Name => edit({ battleback1Name })}/>
        <CommitTextField label={'Walls'} value={map.property('battleback2Name')} onCommit={battleback2Name => edit({ battleback2Name })}/>
      </Stack>
    </>
  );
};

/**
 * The parallax background drawn behind the map, and how it scrolls.
 * @param {{ map: MapDocument, edit: EditProperties }} props The map and the editor.
 * @returns {React.JSX.Element} The fields.
 */
const ParallaxFields = (props: { map: MapDocument; edit: EditProperties }) =>
{
  const { map, edit } = props;
  const loopX = map.property('parallaxLoopX');
  const loopY = map.property('parallaxLoopY');
  return (
    <>
      <SectionTitle>Parallax background</SectionTitle>
      <Stack spacing={1}>
        <CommitTextField label={'Image'} value={map.property('parallaxName')} onCommit={parallaxName => edit({ parallaxName })}/>
        <Stack direction={'row'} spacing={1} useFlexGap flexWrap={'wrap'} alignItems={'center'}>
          <CheckField label={'Loop across'} checked={loopX} onChange={parallaxLoopX => edit({ parallaxLoopX })}/>
          <CommitNumberField label={'Speed'} value={map.property('parallaxSx')} limits={PROPERTY_LIMITS.parallaxSpeed} disabled={loopX === false} onCommit={parallaxSx => edit({ parallaxSx })}/>
        </Stack>
        <Stack direction={'row'} spacing={1} useFlexGap flexWrap={'wrap'} alignItems={'center'}>
          <CheckField label={'Loop down'} checked={loopY} onChange={parallaxLoopY => edit({ parallaxLoopY })}/>
          <CommitNumberField label={'Speed'} value={map.property('parallaxSy')} limits={PROPERTY_LIMITS.parallaxSpeed} disabled={loopY === false} onCommit={parallaxSy => edit({ parallaxSy })}/>
        </Stack>
        <CheckField label={'Show in the editor'} checked={map.property('parallaxShow')} onChange={parallaxShow => edit({ parallaxShow })}/>
      </Stack>
    </>
  );
};

/**
 * The regions an encounter happens in, typed as numbers; an empty field means every region.
 * @param {{ value: readonly number[], onCommit: (regions: number[]) => void }} props The regions and what to do with new ones.
 * @returns {React.JSX.Element} The field.
 */
const RegionField = (props: { value: readonly number[]; onCommit: (regions: number[]) => void }) =>
{
  const { value, onCommit } = props;
  const saved = formatRegionList(value);
  const [ draft, setDraft ] = useState(saved);
  const parsed = parseRegionList(draft);

  useEffect(() =>
  {
    setDraft(saved);
  }, [ saved ]);

  /**
   * Hands on a changed list of region ids, and puts back the saved one otherwise.
   */
  const commit = () =>
  {
    if (parsed === null)
    {
      setDraft(saved);
      return;
    }

    if (formatRegionList(parsed) !== saved)
    {
      onCommit(parsed);
    }
  };

  return (
    <TextField
      label={'Regions'}
      value={draft}
      size={'small'}
      fullWidth
      error={parsed === null}
      placeholder={'All'}
      onChange={event => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={event =>
      {
        if (event.key === 'Enter')
        {
          commit();
        }
      }}
    />
  );
};

/**
 * The random encounters on this map: how often they happen and which troops turn up where.
 * @param {{ map: MapDocument, edit: EditProperties }} props The map and the editor.
 * @returns {React.JSX.Element} The fields.
 */
const EncounterFields = (props: { map: MapDocument; edit: EditProperties }) =>
{
  const { map, edit } = props;
  const list = map.property('encounterList');

  /**
   * Replaces one encounter in the list.
   * @param {number} index Which one.
   * @param {Partial<RmmzEncounter>} changes What changes in it.
   */
  const change = (index: number, changes: Partial<RmmzEncounter>) =>
  {
    edit({ encounterList: list.map((encounter, at) => (at === index ? { ...encounter, ...changes } : encounter)) });
  };

  return (
    <>
      <SectionTitle>Encounters</SectionTitle>
      <Stack spacing={1}>
        <CommitNumberField label={'Steps between'} value={map.property('encounterStep')} limits={PROPERTY_LIMITS.encounterStep} onCommit={encounterStep => edit({ encounterStep })}/>
        {list.map((encounter, index) => (
          <Stack key={index} direction={'row'} spacing={0.5} alignItems={'flex-start'}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <FieldRow>
                <CommitNumberField label={'Troop'} value={encounter.troopId} limits={PROPERTY_LIMITS.troopId} fullWidth onCommit={troopId => change(index, { troopId })}/>
                <CommitNumberField label={'Weight'} value={encounter.weight} limits={PROPERTY_LIMITS.weight} fullWidth onCommit={weight => change(index, { weight })}/>
                <RegionField value={encounter.regionSet} onCommit={regionSet => change(index, { regionSet })}/>
              </FieldRow>
            </Box>
            <IconButton size={'small'} aria-label={'Remove encounter'} onClick={() => edit({ encounterList: list.filter((_, at) => at !== index) })} sx={{ mt: 0.5 }}>
              <Close fontSize={'small'}/>
            </IconButton>
          </Stack>
        ))}
        <Box>
          <Button size={'small'} startIcon={<Add/>} onClick={() => edit({ encounterList: [ ...list, { troopId: 1, weight: 10, regionSet: [] } ] })}>
            Add encounter
          </Button>
        </Box>
      </Stack>
    </>
  );
};

/**
 * Every property of the map in focus (the last one focused in a panel or picked alone in the tree), each change
 * one step in that map's history, so it undoes like any other edit to the map: from here, from the map, or from the
 * history panel. The sections the plugin modules add, such as J-Lighting's darkness, sit just above the note they
 * write into, and come and go with their plugins.
 * @returns {React.JSX.Element} The panel.
 */
const MapPropertiesPanel = () =>
{
  const controller = useWorkspace();
  const mapId = useWorkspaceState(state => state.currentMapId);
  const held = useHeldMap(mapId);
  const tilesets = useTilesets();
  const { modules } = controller.services;

  // the plugin modules switch on once js/plugins.js is read, which can be after the panel first drew.
  useSyncExternalStore(modules.subscribe, () => modules.revision);

  if (mapId === null || held.map === null)
  {
    const waiting = mapId !== null && held.row !== null && held.failure === null;
    return (
      <Box sx={{ height: '100%', display: 'grid', placeItems: 'center', p: 2, color: 'text.secondary', bgcolor: 'background.default' }}>
        {waiting
          ? <CircularProgress size={24}/>
          : <Typography variant={'body2'} align={'center'}>{held.failure ?? 'Pick a map in the tree, or open one, to see its properties here.'}</Typography>}
      </Box>
    );
  }

  const { map } = held;

  /**
   * Makes one change to the map's properties, showing why if it cannot be made.
   * @param {MapPropertyChanges} changes The change.
   */
  const edit: EditProperties = changes =>
  {
    try
    {
      editMapProperties(controller.services.hub, mapId, changes);
    }
    catch (error)
    {
      controller.notify(error instanceof Error ? error.message : String(error), 'error');
    }
  };

  return (
    <Box sx={{ height: '100%', overflowY: 'auto', px: 1.5, pb: 2, bgcolor: 'background.default' }} data-testid={'map-properties'}>
      <Typography variant={'subtitle2'} sx={{ pt: 1 }} noWrap>
        {held.row?.name}
      </Typography>
      <SectionTitle>General</SectionTitle>
      <GeneralFields map={map} tilesets={tilesets} edit={edit}/>
      <SectionTitle>Size</SectionTitle>
      <SizeFields map={map} mapId={mapId}/>
      <AudioFields
        title={'Music'}
        autoplay={map.property('autoplayBgm')}
        audio={map.property('bgm')}
        onAutoplay={autoplayBgm => edit({ autoplayBgm })}
        onAudio={bgm => edit({ bgm })}
      />
      <AudioFields
        title={'Ambience'}
        autoplay={map.property('autoplayBgs')}
        audio={map.property('bgs')}
        onAutoplay={autoplayBgs => edit({ autoplayBgs })}
        onAudio={bgs => edit({ bgs })}
      />
      <BattlebackFields map={map} edit={edit}/>
      <ParallaxFields map={map} edit={edit}/>
      <EncounterFields map={map} edit={edit}/>
      {modules.mapPropertiesSections().map(section => (
        <ModulePropertiesSection key={`${mapId} ${section.id}`} mapId={mapId} map={map} section={section}/>
      ))}
      <SectionTitle>Note</SectionTitle>
      <CommitTextField label={'Note'} value={map.property('note')} multiline onCommit={note => edit({ note })}/>
    </Box>
  );
};

export { MapPropertiesPanel };
