import React, { useEffect, useRef, useState } from 'react';
import { Alert, Box, Stack, Typography } from '@mui/material';
import type { SharedField } from '../../core/eventKinds/quickFields.ts';
import type { JsonValue } from '../../core/model/json.ts';
import type { MapDocument } from '../../core/model/MapDocument.ts';
import type { MapPropertiesSection } from '../../core/modules/PluginModule.ts';
import { editModuleProperty, ModulePropertyDrag, type MapPropertyField } from '../../core/properties/moduleProperties.ts';
import { QuickControl } from '../../views/quickPanel/QuickControls.tsx';
import type { QuickResources } from '../../views/quickPanel/quickResources.ts';
import { useDocumentRevision, useWorkspace } from '../workspaceHooks.tsx';
import { SectionTitle } from './propertyFields.tsx';

/**
 * What a section's controls read besides their settings: nothing, since a map's own settings pick no rows, maps or
 * pictures, and offer no swatches.
 */
const NO_RESOURCES: QuickResources = { api: null, names: null, mapRows: null, sheets: null, swatches: [] };

/**
 * Ends the value a section still has showing, if one is, keeping what it shows as one step.
 * @param {React.RefObject<ModulePropertyDrag | null>} drag Where the section keeps the drag showing it.
 */
const settleDrag = (drag: React.RefObject<ModulePropertyDrag | null>): void =>
{
  const open = drag.current;
  drag.current = null;
  open?.commit();
};

/**
 * Shows a map's setting the way a quick panel shows an event's: one map holds one value, so it is never mixed.
 * @param {MapPropertyField} field The setting.
 * @returns {SharedField} The setting as a control reads it.
 */
const sharedOf = (field: MapPropertyField): SharedField =>
{
  const { key, label, control, step, value, hint } = field;
  return { key, label, section: '', control, step, value, mixed: false, ...(hint === undefined ? {} : { hint }) };
};

/**
 * One section a module adds to Map Properties: its heading, what it says about the map as a whole, and its settings,
 * each change applied at once as one step in the map's history, so the map redraws as it changes and undo takes it back
 * from the map, these properties or the history panel alike. A value still being chosen, as a slider is dragged, shows
 * on the map as it goes and becomes one step when it is chosen; one still showing when the section goes, as when another
 * map is picked, is kept as that step. A change the map cannot take is refused, saying why.
 * @param {{ mapId: number, map: MapDocument, section: MapPropertiesSection }} props The map and the section.
 * @returns {React.JSX.Element} The section.
 */
const ModulePropertiesSection = (props: { mapId: number; map: MapDocument; section: MapPropertiesSection }) =>
{
  const { mapId, map, section } = props;
  const { hub } = useWorkspace().services;
  const [ failure, setFailure ] = useState<string | null>(null);
  const drag = useRef<ModulePropertyDrag | null>(null);

  // a value being dragged changes the map before it is a step, so the settings follow the map itself.
  useDocumentRevision(map);

  // a value still showing when the section goes is kept, as the step it would have been.
  useEffect(() => () => settleDrag(drag), []);

  const model = section.source(map);

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
      drag.current = new ModulePropertyDrag(hub, mapId, section.source, key);
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
    editModuleProperty(hub, mapId, section.source, key, value);
  });

  return (
    <Box data-testid={`map-section-${section.id}`}>
      <SectionTitle>{section.title}</SectionTitle>
      <Stack spacing={1.25}>
        {model.note !== null && (
          <Typography variant={'body2'} color={'text.secondary'}>
            {model.note}
          </Typography>
        )}
        {model.fields.map(field => (
          <Box key={field.key} data-testid={`map-field-${field.key}`}>
            <QuickControl
              field={sharedOf(field)}
              resources={NO_RESOURCES}
              onChange={value => change(field.key, value)}
              onPreview={value => preview(field.key, value)}
            />
          </Box>
        ))}
        {failure !== null && (
          <Alert severity={'error'} sx={{ py: 0 }} onClose={() => setFailure(null)}>
            {`That change could not be made: ${failure}`}
          </Alert>
        )}
      </Stack>
    </Box>
  );
};

export { ModulePropertiesSection };
