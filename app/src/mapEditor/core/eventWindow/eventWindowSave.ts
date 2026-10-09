import type { DocumentHub } from '../history/DocumentHub.ts';
import { isBlueprintMapId } from '../model/documentKeys.ts';
import { targetDocument, type EditRefusal, type EventWindowTarget } from './eventWindowTarget.ts';

/**
 * What saving the event's map from its window came to: written, or nothing to write (saved is false), or refused, with
 * the reason in words for the author.
 */
type MapSaveOutcome =
  | { readonly ok: true; readonly saved: boolean }
  | EditRefusal;

/**
 * What the author reads when the map waits for them to choose between its copy and changes made elsewhere: the same
 * wait the workspace's Save all reports.
 */
const MAP_CONFLICT_MESSAGE = 'The map was not saved: it is waiting for a choice about changes made elsewhere.';

/**
 * What the author reads on saving changes to an event of a blueprint that are not on disk once every write on its way
 * has landed: one whose write failed, which the author has heard about, or one made in a window that writes nothing.
 */
const BLUEPRINT_NOT_WRITTEN_MESSAGE = 'A change to this blueprint is not written yet.';

/**
 * Saves the map an event window edits. A map with nothing unsaved is left alone. A map flagged in conflict (its file
 * changed on disk, or another window's copy went another way, while it held unsaved edits) is held back exactly as the
 * workspace's Save all holds it back: writing it would put this copy over the other one before the author has chosen
 * between them, and once written the map would read as saved, so nothing would be left to warn them.
 *
 * A blueprint opened as a map has no file of its own, and is never saved by hand: every change to it is written at once,
 * with every copy it reached (see BlueprintWriter), so saving it waits for whatever of those is still on its way, and
 * reads as saved once they land. One whose change could not be written stays unsaved, and says so.
 * @param {DocumentHub} hub The window's documents; the event's map must be held.
 * @param {EventWindowTarget} target The event whose map to save.
 * @param {(() => Promise<void>) | null} written Settles once every change to a blueprint on its way to disk has landed;
 * null in a window that writes none.
 * @returns {Promise<MapSaveOutcome>} Settles once the file is written, or at once when there is nothing to write or the
 * save is refused; rejects when the write itself fails.
 */
const saveTargetMap = async (hub: DocumentHub, target: EventWindowTarget, written: (() => Promise<void>) | null = null): Promise<MapSaveOutcome> =>
{
  const key = targetDocument(target);
  if (hub.isDirty(key) === false)
  {
    return { ok: true, saved: false };
  }

  if (isBlueprintMapId(target.mapId))
  {
    await written?.();
    return hub.isDirty(key)
      ? { ok: false, message: BLUEPRINT_NOT_WRITTEN_MESSAGE }
      : { ok: true, saved: true };
  }

  if (hub.isConflicted(key))
  {
    return { ok: false, message: MAP_CONFLICT_MESSAGE };
  }

  await hub.save(key);
  return { ok: true, saved: true };
};

export { BLUEPRINT_NOT_WRITTEN_MESSAGE, MAP_CONFLICT_MESSAGE, saveTargetMap };
export type { MapSaveOutcome };
