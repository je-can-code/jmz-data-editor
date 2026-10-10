import React, { useState } from 'react';
import { Box, Button, Stack, Tooltip, Typography } from '@mui/material';
import { canFollowAgain, fieldActions, type FieldAction } from '../../core/blueprints/copyActions.ts';
import {
  followCopy,
  followCopyField,
  pinCopyField,
  unlinkCopy,
  unpinCopyField,
  type CopyEditOutcome,
  type CopyTarget,
} from '../../core/blueprints/copyEdits.ts';
import type { CopyContext, CopyField, CopyFieldState } from '../../core/blueprints/copyReading.ts';
import { capitalised, copyTitle, fieldWords, stateWords, summaryWords, type LinkedReading } from '../../core/blueprints/copyWords.ts';
import { blueprintMapId, isMappableBlueprintId } from '../../core/model/documentKeys.ts';
import type { RmmzMapEvent } from '../../core/model/rmmzTypes.ts';
import { useMapEditorServices } from '../../services/MapEditorServicesContext.tsx';
import { openEventWindow } from '../mapEditorViews.ts';
import { useCopyView } from './copyView.ts';

/**
 * What a copy's panel takes: the copy, where its steps go, the page shown, and where an action's outcome and anything
 * else the author should hear go.
 */
type CopyPanelProps = {
  /**
   * The copy, and the history its steps go in.
   */
  readonly target: CopyTarget;

  /**
   * The copy, as the window's map holds it.
   */
  readonly event: RmmzMapEvent;

  /**
   * The page the window shows, counted from 0, whose fields the panel lists beside the event's own.
   */
  readonly pageIndex: number;

  /**
   * Runs one of the panel's actions, telling the author when it was refused.
   */
  readonly onEdit: (edit: () => CopyEditOutcome) => void;

  /**
   * Tells the author something that went wrong outside an action, such as a window that could not open.
   */
  readonly onNotice: (message: string) => void;
};

/**
 * What each of a field's actions is called on its button, and what its hint says it does.
 */
const ACTION_WORDS: Readonly<Record<FieldAction, { readonly label: string; readonly hint: string }>> = {
  pin: { label: 'Pin', hint: 'Keep this value whatever the blueprint does' },
  unpin: { label: 'Unpin', hint: 'Keep this value, and follow the blueprint\'s changes from here' },
  follow: { label: 'Follow', hint: 'Take the blueprint\'s value' },
};

/**
 * The colour each standing is said in: quiet for a field that follows, louder the further a field stands apart; commands
 * kept for naming other events of the blueprint are said plainly, since nobody set them apart.
 */
const STATE_COLOURS: Readonly<Record<CopyFieldState['kind'], string>> = {
  'follows': 'text.secondary',
  'offset': 'text.primary',
  'pinned': 'info.main',
  'own': 'warning.main',
  'names-group': 'text.primary',
  'copy-only': 'warning.main',
  'blueprint-only': 'warning.main',
};

/**
 * The small buttons each row's actions are.
 */
const ROW_BUTTON = { fontSize: 12, py: 0, px: 0.75, minWidth: 0 } as const;

/**
 * Reports whether a row shows before the author asks for every field: each number both sides hold, which can be pinned,
 * and each field that stands apart from the blueprint; a choice that follows waits behind the toggle.
 * @param {CopyField} field The field.
 * @returns {boolean} True when it shows from the start.
 */
const showsFirst = (field: CopyField): boolean =>
{
  return field.state.kind !== 'follows' || field.kind.kind === 'number';
};

/**
 * One field of the copy: what it is, where it stands against the blueprint beneath it, and what can be done with it, to
 * the right, so the standing has the row's whole width however long the field's name, running on to a second line when
 * it says more than the width holds.
 * @param {{ field: CopyField, onAction: (action: FieldAction) => void }} props The field, and what each action does.
 * @returns {React.JSX.Element} The row.
 */
const FieldRow = (props: { readonly field: CopyField; readonly onAction: (action: FieldAction) => void }) =>
{
  const { field, onAction } = props;
  const words = fieldWords(field.place);
  return (
    <Box
      data-testid={'copy-field'}
      sx={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', columnGap: 1, py: 0.25 }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant={'body2'} noWrap title={capitalised(words)}>
          {capitalised(words)}
        </Typography>
        <Typography variant={'caption'} color={STATE_COLOURS[field.state.kind]} component={'p'} data-testid={'copy-field-state'}>
          {stateWords(field.state)}
        </Typography>
      </Box>
      <Stack direction={'row'}>
        {fieldActions(field).map(action => (
          <Tooltip key={action} describeChild title={ACTION_WORDS[action].hint}>
            <Button size={'small'} sx={ROW_BUTTON} aria-label={`${ACTION_WORDS[action].label} ${words}`} onClick={() => onAction(action)}>
              {ACTION_WORDS[action].label}
            </Button>
          </Tooltip>
        ))}
      </Stack>
    </Box>
  );
};

/**
 * A group of the copy's fields under a heading: those that show from the start, then, once asked for, the rest.
 * @param {{ title: string, fields: readonly CopyField[], every: boolean, onAction: (field: CopyField, action: FieldAction) => void }} props
 * The heading, the fields, whether every field shows, and what each action does.
 * @returns {React.JSX.Element | null} The group, or nothing when it has no field to show.
 */
const FieldGroup = (props: {
  readonly title: string;
  readonly fields: readonly CopyField[];
  readonly every: boolean;
  readonly onAction: (field: CopyField, action: FieldAction) => void;
}) =>
{
  const { title, fields, every, onAction } = props;
  const shown = every ? fields : fields.filter(showsFirst);
  if (shown.length === 0)
  {
    return null;
  }

  return (
    <Box sx={{ mt: 1 }} aria-label={title} role={'group'}>
      <Typography variant={'caption'} color={'text.secondary'} sx={{ display: 'block', fontWeight: 600 }}>
        {title}
      </Typography>
      {shown.map(field => <FieldRow key={field.key} field={field} onAction={action => onAction(field, action)}/>)}
    </Box>
  );
};

/**
 * Picks the colour a copy's standing as a whole is said in: quiet while it follows in everything, plain while it stands
 * apart field by field, and a warning when no change to the blueprint reaches it, or there is nothing to read it against.
 * @param {LinkedReading} reading The copy, read.
 * @returns {string} The colour.
 */
const summaryColour = (reading: LinkedReading): string =>
{
  if (reading.kind !== 'read')
  {
    return 'warning.main';
  }

  return canFollowAgain(reading) ? 'text.primary' : 'text.secondary';
};

/**
 * A copy of a blueprint, as its event window shows it: what it is a copy of, with a way to open the blueprint's event in
 * its own window; how it stands against the blueprint; following the blueprint again in everything, and unlinking it,
 * which makes it a plain event; and, field by field, the event's own fields and those of the page shown, each with where
 * it stands in plain words and what can be done with it: pinning or unpinning a number, and having any field follow the
 * blueprint again. Numbers and fields standing apart show from the start, the choices that follow once asked for. Each
 * action is one step in the event's own history, saved with the map.
 * @param {CopyPanelProps} props The copy, where its steps go, the page shown, and where outcomes go.
 * @returns {React.JSX.Element | null} The panel, or nothing for an event that is no copy.
 */
const CopyPanel = (props: CopyPanelProps) =>
{
  const { target, event, pageIndex, onEdit, onNotice } = props;
  const { hub, shell } = useMapEditorServices();
  const view = useCopyView(target.mapId, event);
  const [ every, setEvery ] = useState(false);
  if (view.kind !== 'ready')
  {
    return (
      <Typography variant={'body2'} color={view.kind === 'failed' ? 'error' : 'text.secondary'} data-testid={'copy-panel-waiting'}>
        {view.message}
      </Typography>
    );
  }

  const { reading, context } = view;
  if (reading.kind === 'plain')
  {
    return null;
  }

  const { blueprintId, eventId } = reading.link;

  /**
   * Opens the blueprint's event the copy was made from in its own window, saying so when the window was blocked.
   */
  const openBlueprint = () =>
  {
    if (openEventWindow(shell, blueprintMapId(blueprintId), eventId) === 'blocked')
    {
      onNotice('The blueprint\'s window was blocked; allow pop-ups for the editor to open it.');
    }
  };

  /**
   * Takes one action on one field.
   * @param {CopyField} field The field.
   * @param {FieldAction} action The action.
   */
  const act = (field: CopyField, action: FieldAction) =>
  {
    const take: Record<FieldAction, (against: CopyContext) => CopyEditOutcome> = {
      pin: against => pinCopyField(hub, target, against, field.key),
      unpin: against => unpinCopyField(hub, target, against, field.key),
      follow: against => followCopyField(hub, target, against, field.key),
    };
    onEdit(() => take[action](context));
  };

  const fields = reading.kind === 'read' ? reading.fields : [];
  const eventFields = fields.filter(field => field.place.kind === 'name' || field.place.kind === 'note');
  const pageFields = fields.filter(field => field.place.kind !== 'name' && field.place.kind !== 'note' && field.place.page === pageIndex);
  const waiting = [ ...eventFields, ...pageFields ].filter(field => showsFirst(field) === false).length;

  return (
    <Box data-testid={'copy-panel'}>
      <Stack direction={'row'} alignItems={'center'} spacing={1}>
        <Typography variant={'body2'} sx={{ flex: 1, minWidth: 0, fontWeight: 600 }} noWrap title={copyTitle(reading, event.id)}>
          {copyTitle(reading, event.id)}
        </Typography>
        {reading.blueprint !== null && isMappableBlueprintId(blueprintId) && (
          <Tooltip describeChild title={'Open the blueprint\'s event in its own window'}>
            <Button size={'small'} sx={ROW_BUTTON} onClick={openBlueprint}>
              Open blueprint
            </Button>
          </Tooltip>
        )}
      </Stack>
      <Typography variant={'caption'} color={summaryColour(reading)} sx={{ display: 'block' }} data-testid={'copy-summary'}>
        {summaryWords(reading)}
      </Typography>
      <Stack direction={'row'} spacing={1} sx={{ mt: 0.5 }}>
        {reading.kind !== 'lost' && (
          <Tooltip describeChild title={'Take the blueprint\'s value in every field'}>
            <span>
              <Button size={'small'} variant={'outlined'} disabled={canFollowAgain(reading) === false} onClick={() => onEdit(() => followCopy(hub, target, context))}>
                Follow the blueprint again
              </Button>
            </span>
          </Tooltip>
        )}
        <Tooltip describeChild title={'Make this a plain event that no longer follows the blueprint'}>
          <Button size={'small'} onClick={() => onEdit(() => unlinkCopy(hub, target, context))}>
            Unlink
          </Button>
        </Tooltip>
      </Stack>
      <FieldGroup title={'This event'} fields={eventFields} every={every} onAction={act}/>
      <FieldGroup title={`Page ${pageIndex + 1}`} fields={pageFields} every={every} onAction={act}/>
      {(waiting > 0 || every) && (
        <Button size={'small'} sx={{ ...ROW_BUTTON, mt: 0.5 }} onClick={() => setEvery(current => current === false)}>
          {every ? 'Hide the ones that follow the blueprint' : `Show ${waiting} more that follow the blueprint`}
        </Button>
      )}
    </Box>
  );
};

export { CopyPanel };
export type { CopyPanelProps };
