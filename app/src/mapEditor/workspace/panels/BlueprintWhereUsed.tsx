import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import type { BlueprintCopy } from '../../core/blueprints/blueprintCopies.ts';
import type { Blueprint } from '../../core/blueprints/blueprints.ts';
import type { PlacedSpot } from '../../core/blueprints/blueprintUses.ts';
import { copyMarkOf, copyStandingOf, lookFailure, placementMiddle, standingOf, whereUsed, type LookedMap } from '../../core/blueprints/whereUsed.ts';
import { MAP_INFOS_KEY, mapDocumentKey } from '../../core/model/documentKeys.ts';
import type { MapDocument } from '../../core/model/MapDocument.ts';
import { lookAtDocument } from '../../core/sync/lookAtDocument.ts';
import { useHubVersion, useWorkspace } from '../workspaceHooks.tsx';

/**
 * The small buttons each placement and copy is listed as.
 */
const PLACE_BUTTON = { fontSize: 12, py: 0, px: 0.5, minWidth: 0, textTransform: 'none' } as const;

/**
 * Looks at every map the blueprint is used on, for checking each placement and each copy against it: a map the window
 * holds is read as it stands, unsaved edits and all, every time anything changes; any other is looked at without being
 * held (another window's copy, or the file), each time the list opens and each time the maps it lists change. A map the
 * tree no longer lists is gone, with nothing to look at.
 * @param {readonly number[]} mapIds The maps.
 * @returns {ReadonlyMap<number, LookedMap>} What each look came to, by map id; a map not looked at yet is missing.
 */
const useLookedMaps = (mapIds: readonly number[]): ReadonlyMap<number, LookedMap> =>
{
  const { hub, sync } = useWorkspace().services;
  useHubVersion(hub);
  const [ looked, setLooked ] = useState<ReadonlyMap<number, LookedMap>>(() => new Map());
  const wanted = mapIds.join(',');

  useEffect(() =>
  {
    let live = true;
    const ids = wanted === '' ? [] : wanted.split(',').map(Number);
    ids.filter(mapId => hub.has(mapDocumentKey(mapId)) === false).forEach(mapId =>
    {
      // each map's look lands on its own; one that lands after the list moved on lands nowhere.
      const land = (result: LookedMap) =>
      {
        if (live)
        {
          setLooked(current => new Map(current).set(mapId, result));
        }
      };

      land({ kind: 'looking' });
      lookAtDocument({ hub, sync }, mapDocumentKey(mapId))
        .then(document => land({ kind: 'looked', ground: document as MapDocument }))
        .catch((error: unknown) => land(lookFailure(error)));
    });

    return () =>
    {
      live = false;
    };
  }, [ hub, sync, wanted ]);

  // the tree says first whether a map is there at all, and a map held here is read as it stands now.
  const tree = hub.has(MAP_INFOS_KEY) ? hub.document(MAP_INFOS_KEY) : null;
  return new Map(mapIds.flatMap((mapId): [ number, LookedMap ][] =>
  {
    const key = mapDocumentKey(mapId);
    if (tree !== null && (tree.valueAt([ mapId ]) ?? null) === null)
    {
      return [ [ mapId, { kind: 'gone' } ] ];
    }

    if (hub.has(key))
    {
      return [ [ mapId, { kind: 'looked', ground: hub.map(key) } ] ];
    }

    const result = looked.get(mapId);
    return result === undefined ? [] : [ [ mapId, result ] ];
  }));
};

/**
 * One placement of a blueprint's tiles in the list: where its corner sits, which a click opens the map at; and, when it is
 * no longer where it was, why, and a way to forget it.
 * @param {object} props The placement, the blueprint, the look at its map, and what opening it and forgetting it do.
 * @returns {React.JSX.Element} The row.
 */
const PlacementRow = (props: {
  readonly spot: PlacedSpot;
  readonly blueprint: Blueprint;
  readonly looked: LookedMap | undefined;
  readonly onForget: (spot: PlacedSpot) => void;
}) =>
{
  const { spot, blueprint, looked, onForget } = props;
  const controller = useWorkspace();
  const standing = standingOf(looked, spot, blueprint.stamp);

  return (
    <Box data-testid={'where-used-placement'} sx={{ pl: 1 }}>
      <Button
        size={'small'}
        sx={PLACE_BUTTON}
        onClick={() => controller.openMap(spot.mapId, { focusCell: placementMiddle(spot, blueprint.stamp) })}
      >
        {`Placed at ${spot.x}, ${spot.y}`}
      </Button>
      {standing.kind === 'checking' && (
        <Typography variant={'caption'} color={'text.secondary'} sx={{ ml: 0.5 }}>
          Checking where it stands
        </Typography>
      )}
      {standing.kind === 'unknown' && (
        <Typography variant={'caption'} color={'text.secondary'} sx={{ display: 'block', pl: 0.5 }}>
          {`Can't tell where it stands: ${standing.reason}.`}
        </Typography>
      )}
      {standing.kind === 'lost' && (
        <Stack direction={'row'} alignItems={'baseline'} spacing={0.5} sx={{ pl: 0.5 }}>
          <Typography variant={'caption'} color={'warning.main'} data-testid={'placement-lost'}>
            {`No longer where it was: ${standing.reason}.`}
          </Typography>
          <Button size={'small'} sx={PLACE_BUTTON} onClick={() => onForget(spot)}>
            Forget
          </Button>
        </Stack>
      )}
    </Box>
  );
};

/**
 * The copies of a blueprint's events on one map, each a button that opens the map at it; and under them, each copy a
 * change to the blueprint no longer reaches, saying why, and each copy that follows it but for fields set by hand or
 * numbers pinned, saying how many. Those marks wait for the project's plugins to be read, until when a module's numbers
 * would read as comments set by hand.
 * @param {object} props The map, its copies by id, the blueprint, the look at the map, and the placements the record
 * holds on it.
 * @returns {React.JSX.Element} The rows.
 */
const CopyRows = (props: {
  readonly mapId: number;
  readonly eventIds: readonly number[];
  readonly blueprint: Blueprint;
  readonly looked: LookedMap | undefined;
  readonly spots: readonly PlacedSpot[];
}) =>
{
  const { mapId, eventIds, blueprint, looked, spots } = props;
  const controller = useWorkspace();
  const { copyMaps, modules } = controller.services;
  const plugins = useSyncExternalStore(modules.subscribe, () => modules.revision);

  // a copy drifts by what it holds, which the look shows, or by what the last change to its blueprint found.
  const standings = eventIds.map(eventId => ({ eventId, standing: copyStandingOf(looked, eventId, blueprint.stamp, blueprint.id, copyMaps.driftOf(mapId, eventId)) }));
  const drifted = standings.flatMap(({ eventId, standing }) => (standing.kind === 'drifted' ? [ { eventId, reason: standing.reason } ] : []));

  // a copy that follows says how far it stands apart, once the plugins are read.
  const marked = plugins === 0
    ? []
    : standings.flatMap(({ eventId, standing }) =>
    {
      const words = standing.kind === 'following' ? copyMarkOf(looked, eventId, blueprint, modules.commentTags(), spots) : '';
      return words === '' ? [] : [ { eventId, words } ];
    });

  return (
    <>
      <Stack direction={'row'} flexWrap={'wrap'} sx={{ pl: 1 }}>
        {eventIds.map(eventId => (
          <Button key={eventId} size={'small'} sx={PLACE_BUTTON} onClick={() => controller.openMap(mapId, { focusEventId: eventId })}>
            {`Event ${eventId}`}
          </Button>
        ))}
      </Stack>
      {drifted.map(({ eventId, reason }) => (
        <Typography key={eventId} variant={'caption'} color={'warning.main'} data-testid={'copy-drifted'} sx={{ display: 'block', pl: 1.5 }}>
          {`Event ${eventId} no longer follows its blueprint: ${reason}.`}
        </Typography>
      ))}
      {marked.map(({ eventId, words }) => (
        <Typography key={eventId} variant={'caption'} color={'text.secondary'} data-testid={'copy-differs'} sx={{ display: 'block', pl: 1.5 }}>
          {`Event ${eventId}: ${words}.`}
        </Typography>
      ))}
    </>
  );
};

/**
 * Where one blueprint is used, map by map: each placement of its tiles, at the cell its corner was put down at, checked
 * against the blueprint, so one no longer where it was says why and can be forgotten; and each copy of its events, so one
 * a change no longer reaches says why, and one that follows but for fields set by hand or pinned says how many. A click on
 * either opens the map there. The placements come from the record of where blueprints are placed, the copies from the
 * maps' notes.
 * @param {object} props The blueprint, its placements and its event copies, whether those are still being counted, and
 * what forgetting a placement does.
 * @returns {React.JSX.Element} The list.
 */
const BlueprintWhereUsed = (props: {
  readonly blueprint: Blueprint;
  readonly spots: readonly PlacedSpot[];
  readonly copies: readonly BlueprintCopy[];
  readonly counting: boolean;
  readonly onForget: (spot: PlacedSpot) => void;
}) =>
{
  const { blueprint, spots, copies, counting, onForget } = props;
  const controller = useWorkspace();
  const uses = whereUsed(spots, copies);
  const looked = useLookedMaps(uses.map(use => use.mapId));

  return (
    <Stack spacing={0.5} sx={{ px: 0.75, pb: 0.75 }} data-testid={'blueprint-where-used'}>
      {uses.length === 0 && (
        <Typography variant={'caption'} color={'text.secondary'}>
          Not placed on any map yet.
        </Typography>
      )}
      {uses.map(use => (
        <Box key={use.mapId} data-testid={'where-used-map'}>
          <Typography variant={'caption'} sx={{ display: 'block', fontWeight: 600 }}>
            {controller.mapName(use.mapId)}
          </Typography>
          {use.spots.map(cell => (
            <PlacementRow
              key={`${cell.x},${cell.y}`}
              spot={{ blueprintId: blueprint.id, mapId: use.mapId, ...cell }}
              blueprint={blueprint}
              looked={looked.get(use.mapId)}
              onForget={onForget}
            />
          ))}
          {use.eventIds.length > 0 && (
            <CopyRows
              mapId={use.mapId}
              eventIds={use.eventIds}
              blueprint={blueprint}
              looked={looked.get(use.mapId)}
              spots={spots.filter(spot => spot.mapId === use.mapId)}
            />
          )}
        </Box>
      ))}
      {counting && (
        <Typography variant={'caption'} color={'text.secondary'}>
          Still counting its linked events.
        </Typography>
      )}
    </Stack>
  );
};

export { BlueprintWhereUsed };
