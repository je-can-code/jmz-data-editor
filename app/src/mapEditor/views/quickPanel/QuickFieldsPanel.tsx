import React, { useState, type ComponentType } from 'react';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import {
  editQuickField,
  quickSections,
  runQuickAction,
  sharedActions,
  sharedFields,
  type QuickContext,
  type QuickModelSource,
  type QuickSection,
} from '../../core/eventKinds/quickFields.ts';
import type { JsonValue } from '../../core/model/json.ts';
import type { QuickPanelProps } from '../../core/modules/PluginModule.ts';
import { useMapEditorServices } from '../../services/MapEditorServicesContext.tsx';
import { QuickControl, takesWholeRow } from './QuickControls.tsx';
import { useCharacterSheets, useDatabaseNames, useMapRows, useRevision, type QuickResources } from './quickResources.ts';

/**
 * One heading of the panel: its title, then its settings laid out in a wrapping row, then its buttons.
 * @param {{ section: QuickSection, resources: QuickResources, onChange: (key: string, value: JsonValue) => void, onAction: (key: string) => void }} props What to show and what to do.
 * @returns {React.JSX.Element} The section.
 */
const SectionBlock = (props: {
  section: QuickSection;
  resources: QuickResources;
  onChange: (key: string, value: JsonValue) => void;
  onAction: (key: string) => void;
}) =>
{
  const { section, resources, onChange, onAction } = props;
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
            <QuickControl field={field} resources={resources} onChange={value => onChange(field.key, value)}/>
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
 * The quick panel every core kind shows: the settings its selected events share, each change applied at once as one
 * step in the map's history, so the map redraws as it changes and undo takes it back from the map, this panel or the
 * history panel alike. With several events selected, a setting they hold differently says so, and a change gives all
 * of them the new value.
 * @param {QuickPanelProps & { source: QuickModelSource }} props The map, the selected events of this kind, and what the kind offers.
 * @returns {React.JSX.Element | null} The panel, or nothing while the map is not held.
 */
const QuickFieldsPanel = (props: QuickPanelProps & { source: QuickModelSource }) =>
{
  const { documentKey, eventIds, source } = props;
  const { hub, api } = useMapEditorServices();
  const map = hub.has(documentKey) ? hub.map(documentKey) : null;
  useRevision(map);
  const resources: QuickResources = {
    api,
    names: useDatabaseNames(api),
    mapRows: useMapRows(hub, api),
    sheets: useCharacterSheets(api),
  };
  const [ failure, setFailure ] = useState<string | null>(null);
  if (map === null)
  {
    return null;
  }

  const context: QuickContext = { events: map.events, names: resources.names };
  const models = eventIds.flatMap(eventId =>
  {
    const event = map.event(eventId);
    return event === null ? [] : [ source(event, context) ];
  });
  const sections = quickSections(sharedFields(models), sharedActions(models));

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

  return (
    <Stack spacing={0.5} data-testid={'quick-fields'}>
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
          onChange={(key, value) => attempt(() => editQuickField(hub, map.mapId, eventIds, source, context, key, value))}
          onAction={key => attempt(() => runQuickAction(hub, map.mapId, eventIds, source, context, key))}
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
 * Makes the quick panel of one kind: the shared panel, reading that kind's settings.
 * @param {QuickModelSource} source What the kind offers for each event.
 * @param {string} name The kind's id, for the component's name in developer tools.
 * @returns {ComponentType<QuickPanelProps>} The panel.
 */
const quickPanelFor = (source: QuickModelSource, name: string): ComponentType<QuickPanelProps> =>
{
  const Panel = (props: QuickPanelProps) => <QuickFieldsPanel {...props} source={source}/>;
  Panel.displayName = `QuickPanel(${name})`;
  return Panel;
};

export { QuickFieldsPanel, quickPanelFor };
