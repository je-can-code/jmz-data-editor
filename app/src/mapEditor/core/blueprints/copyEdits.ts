import { EVENT_GONE_MESSAGE } from '../eventWindow/eventWindowTarget.ts';
import type { DocumentHub } from '../history/DocumentHub.ts';
import type { HistoryKey } from '../history/historyKeys.ts';
import type { HistoryStep } from '../history/HistoryStep.ts';
import { mapDocumentKey } from '../model/documentKeys.ts';
import type { RmmzMapEvent } from '../model/rmmzTypes.ts';
import { blueprintLinkOf } from './blueprintLink.ts';
import {
  FIELD_GONE,
  followAllPlan,
  followPlan,
  pinPlan,
  unlinkPlan,
  unpinPlan,
  type CopyPlan,
  type ReadCopy,
} from './copyActions.ts';
import { copyPatches } from './copyPatches.ts';
import { readCopy, type CopyContext } from './copyReading.ts';
import { fieldWords, pageWords } from './copyWords.ts';

/**
 * The copy one of the panel's actions is taken on, and the history it is recorded in: the event's own in its window, the
 * map's from the map's quick panel, each homed on the copy's map, so the step is saved with the map like any other edit.
 */
type CopyTarget = {
  readonly mapId: number;
  readonly eventId: number;
  readonly history: HistoryKey;
};

/**
 * What one of a copy's actions came to: the step it recorded, null when the copy already stood as the action would leave
 * it, or why it was refused, in words for the author. A refused action changes nothing.
 */
type CopyEditOutcome =
  | { readonly ok: true; readonly step: HistoryStep | null }
  | { readonly ok: false; readonly message: string };

/**
 * One action, planned on a copy as it stands: what the step is called, and what the copy comes to.
 */
type NamedPlan = {
  readonly label: string;
  readonly plan: CopyPlan;
};

/**
 * Takes one of a copy's actions as one step on the copy's map: the copy is read live from the window's map, the action
 * planned on it, and every field the plan changed written as narrowly as it can be (see copyPatches), so an undo takes back
 * exactly those fields, byte for byte, and a later edit to any other field of the copy is no hindrance to it.
 * @param {DocumentHub} hub The window's documents.
 * @param {CopyTarget} target The copy, and the history the step goes in.
 * @param {(copy: RmmzMapEvent) => NamedPlan} plan Plans the action on the copy as it stands.
 * @returns {CopyEditOutcome} The step, or why not.
 */
const editCopy = (hub: DocumentHub, target: CopyTarget, plan: (copy: RmmzMapEvent) => NamedPlan): CopyEditOutcome =>
{
  const key = mapDocumentKey(target.mapId);
  const copy = hub.has(key) ? hub.map(key).event(target.eventId) : null;
  if (copy === null)
  {
    return { ok: false, message: EVENT_GONE_MESSAGE };
  }

  const { label, plan: planned } = plan(copy);
  if (planned.ok === false)
  {
    return planned;
  }

  const step = hub.edit(label, [ target.history ], tx =>
  {
    copyPatches(copy, planned.event).forEach(patch => tx.apply(key, patch));
  });
  return { ok: true, step };
};

/**
 * Plans an action on one field of a copy read field by field, naming the step for the field and its page; a copy that no
 * longer reads so, changed in another window, say, is refused.
 * @param {RmmzMapEvent} copy The copy, as it stands.
 * @param {CopyContext} context What the copy is read against.
 * @param {{ key: string, verb: (words: string) => string, plan: (reading: ReadCopy) => CopyPlan }} action The field's key, how
 * the step is named from the field's words, and the action's plan.
 * @returns {NamedPlan} The plan.
 */
const onField = (
  copy: RmmzMapEvent,
  context: CopyContext,
  action: { readonly key: string; readonly verb: (words: string) => string; readonly plan: (reading: ReadCopy) => CopyPlan },
): NamedPlan =>
{
  const reading = readCopy(copy, context);
  const field = reading.kind === 'read' ? reading.fields.find(each => each.key === action.key) : undefined;
  if (reading.kind !== 'read' || field === undefined)
  {
    return { label: '', plan: { ok: false, message: FIELD_GONE } };
  }

  return { label: `${action.verb(fieldWords(field.place))}${pageWords(field.place)}`, plan: action.plan(reading) };
};

/**
 * Pins one of a copy's numbers at the value it holds, so it keeps it whatever the blueprint does, as one step.
 * @param {DocumentHub} hub The window's documents.
 * @param {CopyTarget} target The copy, and the history the step goes in.
 * @param {CopyContext} context What the copy is read against.
 * @param {string} key The number's key.
 * @returns {CopyEditOutcome} The step, or why not.
 */
const pinCopyField = (hub: DocumentHub, target: CopyTarget, context: CopyContext, key: string): CopyEditOutcome =>
{
  return editCopy(hub, target, copy => onField(copy, context, { key, verb: words => `Pin ${words}`, plan: reading => pinPlan(copy, reading, key) }));
};

/**
 * Unpins one of a copy's numbers, which keeps its value and follows the blueprint by the offset that value gives, as one
 * step.
 * @param {DocumentHub} hub The window's documents.
 * @param {CopyTarget} target The copy, and the history the step goes in.
 * @param {CopyContext} context What the copy is read against.
 * @param {string} key The number's key.
 * @returns {CopyEditOutcome} The step, or why not.
 */
const unpinCopyField = (hub: DocumentHub, target: CopyTarget, context: CopyContext, key: string): CopyEditOutcome =>
{
  return editCopy(hub, target, copy => onField(copy, context, { key, verb: words => `Unpin ${words}`, plan: reading => unpinPlan(copy, reading, key) }));
};

/**
 * Has one field of a copy follow its blueprint again, taking the blueprint's value now, as one step.
 * @param {DocumentHub} hub The window's documents.
 * @param {CopyTarget} target The copy, and the history the step goes in.
 * @param {CopyContext} context What the copy is read against.
 * @param {string} key The field's key.
 * @returns {CopyEditOutcome} The step, or why not.
 */
const followCopyField = (hub: DocumentHub, target: CopyTarget, context: CopyContext, key: string): CopyEditOutcome =>
{
  return editCopy(hub, target, copy => onField(copy, context, {
    key,
    verb: words => `Follow the blueprint's ${words}`,
    plan: reading => followPlan(copy, reading, key, context),
  }));
};

/**
 * Has a copy follow its blueprint again in everything, as one step (see copyActions' followAllPlan): the way back for a
 * copy drifted too far for a change to reach it, or left behind by an undo. A copy whose blueprint is gone, or no longer
 * has its event, has nothing to follow, and is refused.
 * @param {DocumentHub} hub The window's documents.
 * @param {CopyTarget} target The copy, and the history the step goes in.
 * @param {CopyContext} context What the copy is read against.
 * @returns {CopyEditOutcome} The step, or why not.
 */
const followCopy = (hub: DocumentHub, target: CopyTarget, context: CopyContext): CopyEditOutcome =>
{
  return editCopy(hub, target, copy =>
  {
    const reading = readCopy(copy, context);
    if (reading.kind === 'read' || reading.kind === 'drifted')
    {
      return { label: `Follow "${reading.blueprint.name}" again`, plan: followAllPlan(copy, reading, context.references) };
    }

    // a plain event has nothing to follow, and a lost copy has nothing left to follow.
    const message = reading.kind === 'lost' ? `It can't follow: ${reading.reason}.` : FIELD_GONE;
    return { label: '', plan: { ok: false, message } };
  });
};

/**
 * Unlinks a copy from its blueprint, as one step: its link comes out of its note and it becomes a plain event, every other
 * field and every other character of its note kept. Unlinking touches the event alone, never the record of where
 * blueprints are placed: a placement records a blueprint's tiles, which go on following it, and the copies placed with it
 * go on finding one another by it, so the record has nothing of this event's to forget.
 * @param {DocumentHub} hub The window's documents.
 * @param {CopyTarget} target The copy, and the history the step goes in.
 * @param {CopyContext} context What the copy is read against, for the step's name.
 * @returns {CopyEditOutcome} The step, or why not.
 */
const unlinkCopy = (hub: DocumentHub, target: CopyTarget, context: CopyContext): CopyEditOutcome =>
{
  return editCopy(hub, target, copy =>
  {
    const link = blueprintLinkOf(copy.note);
    const blueprint = link === null ? null : context.blueprint(link.blueprintId);
    return { label: blueprint === null ? 'Unlink from its blueprint' : `Unlink from "${blueprint.name}"`, plan: unlinkPlan(copy) };
  });
};

export { followCopy, followCopyField, pinCopyField, unlinkCopy, unpinCopyField };
export type { CopyEditOutcome, CopyTarget };
