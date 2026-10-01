import { CORE_EVENT_KINDS } from '../core/eventKinds/coreKinds.ts';
import type { PluginModuleRegistry } from '../core/modules/PluginModuleRegistry.ts';
import { quickPanelFor } from '../views/quickPanel/QuickFieldsPanel.tsx';

/**
 * Registers the core's kinds (chests, transfers, dialogue and decor), each with its quick panel, which every project
 * has whatever its plugins. Plugin modules add their own kinds beside these when their plugins are enabled.
 * @param {PluginModuleRegistry} registry The window's registry.
 */
const registerCoreEventKinds = (registry: PluginModuleRegistry): void =>
{
  CORE_EVENT_KINDS.forEach(kind =>
  {
    registry.registerCoreKind({
      id: kind.id,
      title: kind.title,
      priority: kind.priority,
      detect: kind.detect,
      quickPanel: quickPanelFor(kind.quick, kind.id),
    });
  });
};

export { registerCoreEventKinds };
