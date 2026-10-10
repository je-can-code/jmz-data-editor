import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, Box, Stack, Typography } from '@mui/material';
import type { SharedField } from '../../core/eventKinds/quickFields.ts';
import type { DocumentChange } from '../../core/model/EditorDocument.ts';
import type { JsonValue } from '../../core/model/json.ts';
import type { MapDocument } from '../../core/model/MapDocument.ts';
import type { ConfigRead, MapPropertiesSection, OnDemandConfig } from '../../core/modules/PluginModule.ts';
import { editModuleProperty, ModulePropertyDrag, type MapPropertyField } from '../../core/properties/moduleProperties.ts';
import { QuickControl } from '../../views/quickPanel/QuickControls.tsx';
import type { QuickResources } from '../../views/quickPanel/quickResources.ts';
import { useWorkspace } from '../workspaceHooks.tsx';
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
 * Reports whether a change to a map can change a setting of the map's own: anything but its tiles and its events, which
 * are what is on the map rather than the map itself.
 * @param {DocumentChange} change The change.
 * @returns {boolean} True when a setting of the map's own may read otherwise.
 */
const touchesMapSettings = (change: DocumentChange): boolean =>
{
  if (change.kind === 'replaced')
  {
    return true;
  }

  const { patch } = change;
  if (patch.kind === 'tiles')
  {
    return false;
  }

  return patch.kind === 'resize' || patch.path[0] !== 'events';
};

/**
 * Draws a section again whenever its map changes in a way a setting of the map's own could read, since a value being
 * dragged changes the map before it is a step; never for a brush stroke's tiles or a moved event, which change many
 * times a second and are no setting of the map's.
 * @param {MapDocument} map The map.
 */
const useMapSettingsRevision = (map: MapDocument): void =>
{
  const [ , setTick ] = useState(0);
  useEffect(() => map.subscribe(change =>
  {
    if (touchesMapSettings(change))
    {
      setTick(current => current + 1);
    }
  }), [ map ]);
};

/**
 * Never hears of a read, for a section whose settings read no config of their own.
 * @returns {() => void} Stops listening, which there is nothing to stop.
 */
const NO_READS = (): (() => void) => () => undefined;

/**
 * Nothing read, for a section whose settings read no config of their own.
 * @returns {undefined} Nothing.
 */
const NOTHING_READ = (): undefined => undefined;

/**
 * Asks for the config a section's settings read only once something needs it, as the section shows and never before,
 * and draws the section again on each read of it, the first included, so its settings show what the config holds as soon
 * as it arrives. A section reading no config of its own asks for nothing.
 * @param {OnDemandConfig | undefined} config The config, or undefined for none.
 */
const useSectionConfig = (config: OnDemandConfig | undefined): void =>
{
  const subscribe = config === undefined ? NO_READS : config.subscribe;
  const current = config === undefined ? NOTHING_READ : config.current;
  useSyncExternalStore<ConfigRead | undefined>(subscribe, current);

  // asked for once the section is on screen, never while it is merely worked out.
  useEffect(() =>
  {
    config?.request();
  }, [ config ]);
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
 * map is picked, is kept as that step. A change the map cannot take is refused, saying why. The section follows changes
 * to the map's own properties, and sits still while a brush paints or an event moves. A config its settings read only
 * once something needs it is asked for as the section shows, and each read of it shows the settings afresh. A part of the
 * section that draws itself, for a setting the map's own file never holds, shows below the settings, and follows what it
 * reads on its own.
 * @param {{ mapId: number, map: MapDocument, section: MapPropertiesSection }} props The map and the section.
 * @returns {React.JSX.Element} The section.
 */
const ModulePropertiesSection = (props: { mapId: number; map: MapDocument; section: MapPropertiesSection }) =>
{
  const { mapId, map, section } = props;
  const Body = section.body;
  const { hub } = useWorkspace().services;
  const [ failure, setFailure ] = useState<string | null>(null);
  const drag = useRef<ModulePropertyDrag | null>(null);

  // a value being dragged changes the map before it is a step, so the settings follow the map itself.
  useMapSettingsRevision(map);

  // a config the settings read only once needed is needed now, and each read of it may change what they show.
  useSectionConfig(section.config);

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
        {Body !== undefined && <Body mapId={mapId} map={map}/>}
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
