import React, { useEffect, useRef, useState, type ComponentType } from 'react';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import {
  editQuickField,
  QuickFieldDrag,
  quickSections,
  runQuickAction,
  sharedActions,
  sharedFields,
  type QuickContext,
  type QuickModelSource,
  type QuickPanelOptions,
  type QuickSection,
} from '../../core/eventKinds/quickFields.ts';
import type { JsonValue } from '../../core/model/json.ts';
import type { QuickPanelProps } from '../../core/modules/PluginModule.ts';
import { useMapEditorServices } from '../../services/MapEditorServicesContext.tsx';
import { QuickControl, takesWholeRow } from './QuickControls.tsx';
import { useCharacterSheets, useDatabaseNames, useMapRows, useRevision, type QuickResources } from './quickResources.ts';

/**
 * No swatches, for a kind offering none.
 */
const NO_SWATCHES: readonly string[] = [];

/**
 * Ends the value a panel still has showing, if one is, keeping what it shows as one step.
 * @param {React.RefObject<QuickFieldDrag | null>} drag Where the panel keeps the drag showing it.
 */
const settleDrag = (drag: React.RefObject<QuickFieldDrag | null>): void =>
{
  const open = drag.current;
  drag.current = null;
  open?.commit();
};

/**
 * One heading of the panel: its title, then its settings laid out in a wrapping row, then its buttons.
 * @param {{ section: QuickSection, resources: QuickResources, onChange: (key: string, value: JsonValue) => void, onPreview: (key: string, value: JsonValue) => void, onAction: (key: string) => void }} props What to show and what to do.
 * @returns {React.JSX.Element} The section.
 */
const SectionBlock = (props: {
  section: QuickSection;
  resources: QuickResources;
  onChange: (key: string, value: JsonValue) => void;
  onPreview: (key: string, value: JsonValue) => void;
  onAction: (key: string) => void;
}) =>
{
  const { section, resources, onChange, onPreview, onAction } = props;
  return (
    <Box>
      {section.title !== '' && (
        <Typography variant={'overline'} color={'text.secondary'} sx={{ display: 'block', lineHeight: 2, mt: 0.5 }}>
          {section.title}
        </Typography>
      )}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25, alignItems: 'flex-start', pt: section.title === '' ? 1 : 0.5 }}>
        {section.fields.map(field => (
          <Box key={field.key} sx={takesWholeRow(field) ? { width: '100%' } : undefined} data-testid={`quick-field-${field.key}`}>
            <QuickControl
              field={field}
              resources={resources}
              onChange={value => onChange(field.key, value)}
              onPreview={value => onPreview(field.key, value)}
            />
          </Box>
        ))}
        {section.actions.map(action => (
          <Button key={action.key} size={'small'} variant={'outlined'} onClick={() => onAction(action.key)}>
            {action.label}
          </Button>
        ))}
      </Box>
    </Box>
  );
};

/**
 * The quick panel every kind with settings shows: the settings its selected events share, each change applied at once
 * as one step in the map's history, so the map redraws as it changes and undo takes it back from the map, this panel or
 * the history panel alike. With several events selected, a setting they hold differently says so, and a change gives
 * all of them the new value.
 *
 * A value still being chosen, as a slider is dragged, shows on the map as it goes and becomes one step when it is
 * chosen; one still showing when the panel goes, as when the selection moves on, is kept as that step. A kind can say
 * something about the selection as a whole above its settings, and offer swatches to its colour settings.
 * @param {QuickPanelProps & { source: QuickModelSource, options?: QuickPanelOptions }} props The map, the selected events of this kind, what the kind offers for each, and what it shows besides.
 * @returns {React.JSX.Element | null} The panel, or nothing while the map is not held.
 */
const QuickFieldsPanel = (props: QuickPanelProps & { source: QuickModelSource; options?: QuickPanelOptions }) =>
{
  const { documentKey, eventIds, source, options = {} } = props;
  const { hub, api } = useMapEditorServices();
  const map = hub.has(documentKey) ? hub.map(documentKey) : null;
  useRevision(map);

  // the swatches are worked out once a render from the map as it stands, never once for each event.
  const resources: QuickResources = {
    api,
    names: useDatabaseNames(api),
    mapRows: useMapRows(hub, api),
    sheets: useCharacterSheets(api),
    swatches: map === null || options.swatches === undefined ? NO_SWATCHES : options.swatches(map.events),
  };
  const [ failure, setFailure ] = useState<string | null>(null);
  const drag = useRef<QuickFieldDrag | null>(null);

  // a value still showing when the panel goes is kept, as the step it would have been.
  useEffect(() => () => settleDrag(drag), []);

  if (map === null)
  {
    return null;
  }

  const context: QuickContext = { events: map.events, names: resources.names };
  const events = eventIds.flatMap(eventId =>
  {
    const event = map.event(eventId);
    return event === null ? [] : [ event ];
  });
  const models = events.map(event => source(event, context));
  const sections = quickSections(sharedFields(models), sharedActions(models));
  const note = options.note === undefined ? null : options.note(events);

  /**
   * Makes one change, showing why when it cannot be made.
   * @param {() => void} change The change.
   */
  const attempt = (change: () => void) =>
  {
    try
    {
      change();
      setFailure(null);
    }
    catch (error)
    {
      setFailure(error instanceof Error ? error.message : String(error));
    }
  };

  /**
   * Shows a value still being chosen, carrying on the drag already showing that setting or starting one.
   * @param {string} key The setting.
   * @param {JsonValue} value The value.
   */
  const preview = (key: string, value: JsonValue) => attempt(() =>
  {
    if (drag.current === null || drag.current.key !== key)
    {
      settleDrag(drag);
      drag.current = new QuickFieldDrag(hub, map.mapId, eventIds, source, context, key);
    }

    drag.current.move(value);
  });

  /**
   * Makes a chosen value a change: the end of the drag showing that setting, or a step of its own.
   * @param {string} key The setting.
   * @param {JsonValue} value The value.
   */
  const change = (key: string, value: JsonValue) => attempt(() =>
  {
    const open = drag.current;
    if (open !== null && open.key === key)
    {
      drag.current = null;
      open.move(value);
      open.commit();
      return;
    }

    settleDrag(drag);
    editQuickField(hub, map.mapId, eventIds, source, context, key, value);
  });

  return (
    <Stack spacing={0.5} data-testid={'quick-fields'}>
      {note !== null && (
        <Typography variant={'body2'} color={'text.secondary'} data-testid={'quick-note'}>
          {note}
        </Typography>
      )}
      {sections.length === 0 && (
        <Typography variant={'body2'} color={'text.secondary'}>
          These events have no settings in common.
        </Typography>
      )}
      {sections.map(section => (
        <SectionBlock
          key={section.title}
          section={section}
          resources={resources}
          onChange={change}
          onPreview={preview}
          onAction={key => attempt(() =>
          {
            settleDrag(drag);
            runQuickAction(hub, map.mapId, eventIds, source, context, key);
          })}
        />
      ))}
      {failure !== null && (
        <Alert severity={'error'} sx={{ py: 0 }} onClose={() => setFailure(null)}>
          {`That change could not be made: ${failure}`}
        </Alert>
      )}
    </Stack>
  );
};

/**
 * Makes the quick panel of one kind: the shared panel, reading that kind's settings, and showing what else it offers.
 * @param {QuickModelSource} source What the kind offers for each event.
 * @param {string} name The kind's id, for the component's name in developer tools.
 * @param {QuickPanelOptions} options What the panel shows besides each event's settings; nothing by default.
 * @returns {ComponentType<QuickPanelProps>} The panel.
 */
const quickPanelFor = (source: QuickModelSource, name: string, options: QuickPanelOptions = {}): ComponentType<QuickPanelProps> =>
{
  const Panel = (props: QuickPanelProps) => <QuickFieldsPanel {...props} source={source} options={options}/>;
  Panel.displayName = `QuickPanel(${name})`;
  return Panel;
};

export { QuickFieldsPanel, quickPanelFor };
