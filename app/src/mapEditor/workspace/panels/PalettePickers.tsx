import React, { useSyncExternalStore } from 'react';
import type { PaintState } from '../../core/tools/PaintState.ts';
import { useWorkspace } from '../workspaceHooks.tsx';

/**
 * What the plugin modules offer to place through pickers of their own, at the top of the Stamps panel, such as J-ABS's
 * battler brush: each picker takes up what it places as the stamp tool's brush, for the panel's window, so each click on
 * a map places it, as a stamp picked below does. They follow the modules switching on and off with their plugins.
 * @param {{ painting: PaintState, pickedId: string | null }} props The window's paint, and the id of the stamp in hand.
 * @returns {React.JSX.Element} The pickers; nothing while no module offers one.
 */
const PalettePickers = (props: { readonly painting: PaintState; readonly pickedId: string | null }) =>
{
  const { painting, pickedId } = props;
  const { modules, stamps } = useWorkspace().services;
  useSyncExternalStore(modules.subscribe, () => modules.revision);
  return (
    <>
      {modules.paletteEntries().map(entry =>
      {
        const Picker = entry.picker;
        return Picker === undefined
          ? null
          : (
            <Picker
              key={entry.id}
              takeUp={(stamp, fit) => painting.takeUpStamp(stamp, fit)}
              putDown={() => painting.putDownStamp()}
              inHand={pickedId}
              newStampId={() => stamps.nextId()}
            />
          );
      })}
    </>
  );
};

export { PalettePickers };
