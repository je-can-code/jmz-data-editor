import type { ComponentType } from 'react';
import { CORE_EVENT_KINDS } from '../core/eventKinds/coreKinds.ts';
import { TRANSFER_KIND_ID } from '../core/eventKinds/transferKind.ts';
import { landingAlertsOverlay } from '../core/locations/landingAlerts.ts';
import type { TransferLandings } from '../core/locations/TransferLandings.ts';
import type { OverlayDefinition } from '../core/renderer/MapRenderer.ts';
import type { QuickPanelProps } from '../core/modules/PluginModule.ts';
import type { PluginModuleRegistry } from '../core/modules/PluginModuleRegistry.ts';
import { quickPanelFor } from '../views/quickPanel/QuickFieldsPanel.tsx';
import { TransferQuickPanel } from '../views/quickPanel/TransferQuickPanel.tsx';

/**
 * Registers the core's kinds (chests, transfers, dialogue and decor), each with its quick panel and the symbol it shows
 * on the map when it draws no picture, which every project has whatever its plugins. Plugin modules add their own kinds
 * beside these when their plugins are enabled.
 *
 * Given the window's landings, transfers also mark every map they leave from where their landing fails, and their quick
 * panel says why; without them, as in a window with no project to read the other maps from, they show neither.
 * @param {PluginModuleRegistry} registry The window's registry.
 * @param {TransferLandings} landings The window's landings, when it judges them.
 */
const registerCoreEventKinds = (registry: PluginModuleRegistry, landings?: TransferLandings): void =>
{
  CORE_EVENT_KINDS.forEach(kind =>
  {
    const judged = kind.id === TRANSFER_KIND_ID && landings !== undefined;
    const quickPanel: ComponentType<QuickPanelProps> = judged ? TransferQuickPanel : quickPanelFor(kind.quick, kind.id);
    const overlays: readonly OverlayDefinition[] | undefined = judged ? [ landingAlertsOverlay(landings) ] : undefined;
    registry.registerCoreKind({
      id: kind.id,
      title: kind.title,
      priority: kind.priority,
      detect: kind.detect,
      quickPanel,
      marker: kind.marker,
      overlays,
    });
  });
};

export { registerCoreEventKinds };
