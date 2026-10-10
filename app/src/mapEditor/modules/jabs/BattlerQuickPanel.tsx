import React, { useEffect, useState, type ComponentType } from 'react';
import { Alert, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { openEnemyInDataEditor } from '../../../core/infrastructure/shell/RowLink.ts';
import { freshSavePages } from '../../core/locations/landingCheck.ts';
import type { RmmzMapEvent } from '../../core/model/rmmzTypes.ts';
import type { PageSectionProps, QuickPanelProps } from '../../core/modules/PluginModule.ts';
import { readTargetEvent } from '../../core/eventWindow/eventWindowTarget.ts';
import { useMapEditorServices } from '../../services/MapEditorServicesContext.tsx';
import { useDatabaseNames, useRevision } from '../../views/quickPanel/quickResources.ts';
import { changeBattlerPage, changeBattlers } from './battlerChanges.ts';
import type { BattlerChange } from './battlerEdits.ts';
import { followedPage, followedPageNote, type FollowedPage } from './battlerPages.ts';
import { BattlerPanel } from './BattlerPanel.tsx';
import { pageEnemyId } from './battlerReading.ts';
import { battlerContextOf, type BattlerSetup } from './battlerSetup.ts';
import { enemyLabel, useEnemies } from './enemyBook.ts';

/**
 * Re-renders whenever the window's clock or page rule moves, either of which can change the page a new game shows an
 * event with, and so the page a battler panel follows.
 */
const useWindowMoment = (): void =>
{
  const { clock, pages } = useMapEditorServices();
  const [ , setTick ] = useState(0);
  useEffect(() =>
  {
    const bump = () => setTick(current => current + 1);
    const stops = [ clock.subscribe(bump), pages.subscribe(bump) ];
    return () => stops.forEach(stop => stop());
  }, [ clock, pages ]);
};

/**
 * Shows why a change could not be made, until it is closed or the next change is made.
 * @param {{ failure: string | null, onClose: () => void }} props Why, or null for nothing to show.
 * @returns {React.JSX.Element | null} The alert, or nothing.
 */
const Failure = (props: { readonly failure: string | null; readonly onClose: () => void }) =>
{
  if (props.failure === null)
  {
    return null;
  }

  return (
    <Alert severity={'error'} sx={{ py: 0 }} onClose={props.onClose}>
      {`That change could not be made: ${props.failure}`}
    </Alert>
  );
};

/**
 * Picks which of a battler's pages the panel shows, for an event with more than one: each named for the enemy it fights
 * as, the page a new game shows marked.
 * @param {{ event: RmmzMapEvent, followed: FollowedPage, label: (enemyId: number) => string, onPick: (pageIndex: number) => void }} props The event and its pages.
 * @returns {React.JSX.Element} The picker.
 */
const PagePicker = (props: {
  readonly event: RmmzMapEvent;
  readonly followed: FollowedPage;
  readonly label: (enemyId: number) => string;
  readonly onPick: (pageIndex: number) => void;
}) =>
{
  const { event, followed, label, onPick } = props;
  return (
    <TextField
      select
      size={'small'}
      label={'Battler page'}
      value={String(followed.pageIndex)}
      onChange={changed => onPick(Number(changed.target.value))}
      data-testid={'battler-page-picker'}
    >
      {followed.battlerPages.map(pageIndex => (
        <MenuItem key={pageIndex} value={String(pageIndex)}>
          {`Page ${pageIndex + 1} · ${label(pageEnemyId(event.pages[pageIndex]) as number)}${pageIndex === followed.shown ? ' · new game' : ''}`}
        </MenuItem>
      ))}
    </TextField>
  );
};

/**
 * A battler's quick panel: the battler panel for the picked battlers, each on the page a new game shows it with at the
 * window's clock, or its first battler page when that page makes none, saying which. A lone battler with several battler
 * pages can be switched to another, which the panel then follows until the selection moves on. Every change is one step
 * in the map's own history, made on every picked battler at once.
 * @param {QuickPanelProps & { setup: BattlerSetup }} props The map, the picked battlers, and what the panel reads them
 * with.
 * @returns {React.JSX.Element | null} The panel, or nothing while the map is not held.
 */
const BattlerQuickPanel = (props: QuickPanelProps & { readonly setup: BattlerSetup }) =>
{
  const { documentKey, eventIds, setup } = props;
  const { hub, api, pages, clock, shell } = useMapEditorServices();
  const map = hub.has(documentKey) ? hub.map(documentKey) : null;
  useRevision(map);
  useWindowMoment();
  const enemies = useEnemies(api);
  const names = useDatabaseNames(api);
  const [ picked, setPicked ] = useState<number | null>(null);
  const [ failure, setFailure ] = useState<string | null>(null);
  if (map === null)
  {
    return null;
  }

  // the page each battler shows on a fresh save at the window's clock, and the one the author picked for a lone battler.
  const fresh = freshSavePages(pages.rule(), clock.time(), clock.season());
  const lone = eventIds.length === 1;
  const followOf = (event: RmmzMapEvent): FollowedPage | null => followedPage(event, fresh.activePage(event), lone ? picked : null);
  const battlers = eventIds.flatMap(eventId =>
  {
    const event = map.event(eventId);
    const followed = event === null ? null : followOf(event);
    return event === null || followed === null ? [] : [ { event, followed } ];
  });
  const [ single ] = battlers;
  if (single === undefined)
  {
    return (
      <Typography variant={'body2'} color={'text.secondary'}>
        No page of this event makes a battler.
      </Typography>
    );
  }

  /**
   * Makes a change on every picked battler, each on the page the panel shows of it as the map stands, saying why when it
   * cannot be made.
   * @param {BattlerChange} next The change.
   */
  const change = (next: BattlerChange) =>
  {
    try
    {
      changeBattlers(hub, map.mapId, event => followOf(event)?.pageIndex ?? null, eventIds, next, battlerContextOf(setup, enemies));
      setFailure(null);
    }
    catch (error)
    {
      setFailure(error instanceof Error ? error.message : String(error));
    }
  };

  const note = lone ? followedPageNote(single.event, single.followed, setup.pageWords) : null;
  return (
    <Stack spacing={1} data-testid={'battler-quick-panel'}>
      {lone && single.followed.battlerPages.length > 1 && (
        <PagePicker event={single.event} followed={single.followed} label={enemyId => enemyLabel(enemyId, enemies[enemyId] ?? null)} onPick={setPicked}/>
      )}
      {note !== null && (
        <Typography variant={'body2'} color={'text.secondary'} data-testid={'battler-page-note'}>
          {note}
        </Typography>
      )}
      <BattlerPanel
        battlers={battlers.map(({ event, followed }) => ({ event, pageIndex: followed.pageIndex }))}
        setup={setup}
        enemies={enemies}
        stateNames={names === null ? null : names.states}
        onChange={change}
        onOpenEnemy={enemyId => openEnemyInDataEditor(enemyId, shell)}
      />
      <Failure failure={failure} onClose={() => setFailure(null)}/>
    </Stack>
  );
};

/**
 * A battler's section of the event window: the battler panel for the page the window shows, each change one step in the
 * event's own history. A page naming no enemy says so.
 * @param {PageSectionProps & { setup: BattlerSetup }} props The event, its page, and what the panel reads it with.
 * @returns {React.JSX.Element | null} The section, or nothing once the event has gone.
 */
const BattlerPageSection = (props: PageSectionProps & { readonly setup: BattlerSetup }) =>
{
  const { target, pageIndex, setup } = props;
  const { hub, api, shell } = useMapEditorServices();
  const enemies = useEnemies(api);
  const names = useDatabaseNames(api);
  const [ failure, setFailure ] = useState<string | null>(null);
  const event = readTargetEvent(hub, target);
  const page = event === null ? undefined : event.pages[pageIndex];
  if (event === null || page === undefined)
  {
    return null;
  }

  if (pageEnemyId(page) === null)
  {
    return (
      <Typography variant={'body2'} color={'text.secondary'}>
        This page makes no battler.
      </Typography>
    );
  }

  /**
   * Makes a change on the page, saying why when it cannot be made.
   * @param {BattlerChange} next The change.
   */
  const change = (next: BattlerChange) =>
  {
    try
    {
      const outcome = changeBattlerPage(hub, target, pageIndex, next, battlerContextOf(setup, enemies));
      setFailure(outcome.ok ? null : outcome.message);
    }
    catch (error)
    {
      setFailure(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Stack spacing={1} data-testid={'battler-page-section'}>
      <BattlerPanel
        battlers={[ { event, pageIndex } ]}
        setup={setup}
        enemies={enemies}
        stateNames={names === null ? null : names.states}
        onChange={change}
        onOpenEnemy={enemyId => openEnemyInDataEditor(enemyId, shell)}
      />
      <Failure failure={failure} onClose={() => setFailure(null)}/>
    </Stack>
  );
};

/**
 * Makes the battler kind's quick panel.
 * @param {BattlerSetup} setup What the panel reads battlers with.
 * @returns {ComponentType<QuickPanelProps>} The panel.
 */
const battlerQuickPanelFor = (setup: BattlerSetup): ComponentType<QuickPanelProps> =>
{
  const Panel = (props: QuickPanelProps) => <BattlerQuickPanel {...props} setup={setup}/>;
  Panel.displayName = 'QuickPanel(jabs.battler)';
  return Panel;
};

/**
 * Makes the battler kind's section of the event window.
 * @param {BattlerSetup} setup What the section reads battlers with.
 * @returns {ComponentType<PageSectionProps>} The section.
 */
const battlerPageSectionFor = (setup: BattlerSetup): ComponentType<PageSectionProps> =>
{
  const Section = (props: PageSectionProps) => <BattlerPageSection {...props} setup={setup}/>;
  Section.displayName = 'PageSection(jabs.battler)';
  return Section;
};

export { BattlerPageSection, battlerPageSectionFor, BattlerQuickPanel, battlerQuickPanelFor };
