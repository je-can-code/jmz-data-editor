import { Alert, LinearProgress, List, ListItem, ListItemButton, ListItemText, ListSubheader, Typography } from '@mui/material';
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';
import type { EnemyPlacementsState } from '@presentation/hooks/useEnemyPlacements.ts';
import type { EnemyPlacement } from '@services/placements/EnemyPlacementsReader.ts';
import { describeDetails, describeEvent, type MapPlacements } from '@services/placements/EnemyPlacementsList.ts';

type EnemyPlacementsProps = {
  /**
   * How far the board has got in finding where the enemy is placed.
   */
  state: EnemyPlacementsState;

  /**
   * Opens a placement's event, when something can. Without it the rows are plain text.
   */
  onOpenEvent?: (placement: EnemyPlacement) => void;
};

/**
 * The line under the card's title, for each stage of the search.
 * @param {EnemyPlacementsState} state How far the search has got.
 * @returns {string} The line.
 */
const subtitleOf = (state: EnemyPlacementsState): string =>
{
  switch (state.status)
  {
    case 'loaded':
      return state.summary;
    case 'failed':
      return 'Could not look through the maps.';
    default:
      return 'Looking through the maps...';
  }
};

/**
 * Lists where the enemy on screen stands on the maps: every map holding it, and under each, every event that is
 * this enemy, where it starts, and which of its pages make it so.
 * @param {EnemyPlacementsProps} props What the search has found, and what a row opens.
 * @returns {JSX.Element | null} The card, or nothing while no enemy is on screen.
 */
const EnemyPlacements = (props: EnemyPlacementsProps) =>
{
  const { state, onOpenEvent } = props;

  if (state.status === 'idle')
  {
    return null;
  }

  /**
   * Draws one event, as a button when something can open it.
   * @param {EnemyPlacement} placement The placement.
   * @returns {JSX.Element} The row.
   */
  const renderRow = (placement: EnemyPlacement) =>
  {
    const text = (
      <ListItemText
        primary={describeEvent(placement)}
        secondary={describeDetails(placement)}
        slotProps={{
          primary: { variant: 'body2' },
          secondary: { variant: 'caption' },
        }}
      />
    );

    const key = `${placement.mapId}-${placement.eventId}`;
    return onOpenEvent === undefined
      ? <ListItem key={key} dense>{text}</ListItem>
      : <ListItemButton key={key} dense onClick={() => onOpenEvent(placement)}>{text}</ListItemButton>;
  };

  /**
   * Draws one map: its heading, which stays in view while its events scroll past, then its events.
   * @param {MapPlacements} group The map's placements.
   * @returns {JSX.Element} The map's part of the list.
   */
  const renderMap = (group: MapPlacements) => (
    <li key={group.mapId}>
      <ul>
        <ListSubheader sx={{ display: 'flex', alignItems: 'baseline', gap: 1, lineHeight: 2.5 }}>
          <Typography variant={'subtitle2'} component={'span'}>
            {group.title}
          </Typography>
          <Typography variant={'caption'} component={'span'} color={'text.secondary'}>
            {group.caption}
          </Typography>
        </ListSubheader>
        {group.placements.map(renderRow)}
      </ul>
    </li>
  );

  return (
    <BoardSectionCard
      title={'Where it appears'}
      subtitle={subtitleOf(state)}
      collapsible
    >
      {state.status === 'loading' && <LinearProgress/>}
      {state.status === 'failed' && <Alert severity={'error'}>{state.message}</Alert>}
      {state.status === 'loaded' && state.groups.length > 0 && (
        <List
          dense
          disablePadding
          subheader={<li/>}
          sx={{
            maxHeight: 360,
            overflowY: 'auto',
            '& ul': { padding: 0 },
          }}
        >
          {state.groups.map(renderMap)}
        </List>
      )}
    </BoardSectionCard>
  );
};

export { EnemyPlacements };
export type { EnemyPlacementsProps };
