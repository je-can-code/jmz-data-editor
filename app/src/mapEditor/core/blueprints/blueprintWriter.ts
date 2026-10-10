import { MapEditorApiError, type BlueprintWrite } from '../api/MapEditorApi.ts';
import type { DocumentHub, HubEvent } from '../history/DocumentHub.ts';
import type { HistoryStep } from '../history/HistoryStep.ts';
import { fileKeepsLeft } from '../history/stepParts.ts';
import { mapDocumentKey, parseDocumentKey, type DocumentKey } from '../model/documentKeys.ts';
import type { Patch } from '../model/patches.ts';
import { BLUEPRINTS_DOCUMENT } from './blueprints.ts';
import { isBlueprintChange, type CopyMaps } from './copyMaps.ts';

/**
 * How long the writer waits after a change to a blueprint is made before writing it, so a run of strokes goes to disk in
 * one act rather than one each; an undo or a redo is written at once.
 */
const SETTLE_MS = 250;

/**
 * Why a change reaching copies is not written while the blueprints wait for a choice about changes made elsewhere:
 * writing the blueprints would put this window's over the other copy, and writing the copies alone would part them from
 * their blueprint on disk.
 */
const BLUEPRINTS_WAITING = 'the blueprints are waiting for a choice about changes made elsewhere';

/**
 * Why a change reaching copies is not written by a window not holding the blueprints: its copies would reach their files
 * without the blueprint.
 */
const BLUEPRINTS_NOT_HELD = 'the blueprints aren\'t open in this window';

/**
 * Why a change to a blueprint is not written while its tab waits for a choice between its own changes and the version of
 * the blueprint found on disk (see BlueprintMapFollower).
 */
const BLUEPRINT_MAP_WAITING = 'this blueprint changed on disk while a change to it here was not yet written, and waits for a choice';

/**
 * How long taking changes back waits before looking again while an edit is open, in milliseconds: nothing may move the
 * documents under a stroke under way.
 */
const EDIT_WAIT_MS = 25;

/**
 * Why an act cannot be written now, and whether its changes reaching copies wait for the author's choice once taken back.
 */
type Blocked = {
  readonly reason: string;
  readonly awaits: boolean;
};

/**
 * One move of a step the writer writes: the step, or the part of it that moved, which way it moved, and what each map's
 * file takes for it; and for an undo or a redo that left parts of the step, the part left on the maps held here, which a
 * map's file goes on holding in the step's place after an undo where it kept that part as the map did.
 */
type QueuedMove = {
  readonly step: HistoryStep;
  readonly direction: 'forward' | 'backward';
  readonly maps: ReadonlyMap<number, Patch[]>;
  readonly left: HistoryStep | null;
};

/**
 * What the writer needs from the window.
 */
type BlueprintWriterOptions = {
  /**
   * The window's documents.
   */
  readonly hub: DocumentHub;

  /**
   * The maps a blueprint's change may write, as their files hold them.
   */
  readonly maps: Pick<CopyMaps, 'follow' | 'landed' | 'misfit'>;

  /**
   * Writes one act to disk (see MapEditorApi's writeBlueprintChanges).
   */
  readonly write: (write: BlueprintWrite) => Promise<void>;

  /**
   * Tells the author what went wrong: an error, or an alarm, which stays until dismissed. Whatever shows the author things
   * can also listen (see BlueprintWriter's onProblem).
   */
  readonly onProblem?: (message: string, alarm: boolean) => void;

  /**
   * How long to wait after a change is made before writing it, in milliseconds.
   */
  readonly settleMs?: number;
};

/**
 * Reports whether the writer writes a step: a change to a blueprint, which reaches the files of the maps its copies stand
 * on, or any other change to the blueprints, a save, a rename or a delete, which reaches the blueprints' file.
 * @param {HistoryStep} step The step.
 * @returns {boolean} True for such a step.
 */
const isWrittenAtOnce = (step: HistoryStep): boolean =>
{
  return isBlueprintChange(step) || step.entries.some(entry => entry.document === BLUEPRINTS_DOCUMENT);
};

/**
 * Words why a write failed, in the server's own words when it gave any.
 * @param {unknown} error What the write threw.
 * @returns {string} The words.
 */
const reasonOf = (error: unknown): string =>
{
  if (error instanceof MapEditorApiError && error.detail !== '')
  {
    return error.detail;
  }

  return error instanceof Error ? error.message : String(error);
};

/**
 * Words what became of an act that failed, for the author, with whether it is an alarm: the changes reaching copies
 * stranded, which the author must undo by hand; taken back to wait for the author's choice about the blueprints; taken
 * back; or, for an act holding none, the blueprints left to be written again.
 * @param {boolean} reachedCopies Whether the act held a change reaching copies, which was taken back.
 * @param {readonly HistoryStep[]} stranded The changes that could not be taken back.
 * @param {string} reason Why the write failed.
 * @param {boolean} awaits Whether the changes taken back wait for the author's choice about the blueprints.
 * @returns {[ string, boolean ]} The words, and true for an alarm.
 */
const failureWords = (reachedCopies: boolean, stranded: readonly HistoryStep[], reason: string, awaits: boolean): [ string, boolean ] =>
{
  if (stranded.length > 0)
  {
    const labels = stranded.map(step => `"${step.label}"`).join(', ');
    return [ `The change to the blueprint could not be written (${reason}), and ${labels} could not be taken back: undo it by hand.`, true ];
  }

  if (reachedCopies && awaits)
  {
    return [ 'The blueprints changed elsewhere before this change to one was written, so it waits: keeping your version brings it back and writes it, taking the other drops it.', false ];
  }

  return reachedCopies
    ? [ `The change to the blueprint could not be written, so it was taken back: ${reason}.`, false ]
    : [ `The blueprints could not be saved: ${reason}. They are tried again with the next save.`, false ];
};

/**
 * Lists the blueprints opened as maps a step changes, by their keys.
 * @param {HistoryStep} step The step.
 * @returns {DocumentKey[]} The keys.
 */
const blueprintMapsOf = (step: HistoryStep): DocumentKey[] =>
{
  return [ ...new Set(step.entries.map(entry => entry.document)) ].filter(key => parseDocumentKey(key).kind === 'blueprint-map');
};

/**
 * Lists the ids of steps.
 * @param {readonly HistoryStep[]} steps The steps.
 * @returns {string[]} Their ids, in order.
 */
const idsOf = (steps: readonly HistoryStep[]): string[] =>
{
  return steps.map(step => step.id);
};

/**
 * Reports whether two lists of step ids are the same, in the same order.
 * @param {readonly string[]} left One list.
 * @param {readonly string[]} right The other.
 * @returns {boolean} True when they are.
 */
const sameIds = (left: readonly string[], right: readonly string[]): boolean =>
{
  return left.length === right.length && left.every((id, index) => id === right[index]);
};

/**
 * Writes every change to a blueprint to disk as it is made, undone or redone in this window, the blueprints and every
 * map the change reached in one act (see MapEditorApi's writeBlueprintChanges), so the blueprint and its copies on disk
 * never part, whatever is discarded or wherever the editor stops. Saving a blueprint is never asked of the author: its
 * tab reads as saved once the act holding its latest change has landed.
 *
 * A change made waits a moment ({@link SETTLE_MS}) for the next, so a run of strokes is written as one act; an undo or a
 * redo is written at once, behind whatever is waiting. One act is on its way at a time, and what is moved meanwhile goes
 * in the next. Each map's file takes what the maps kept here say (see CopyMaps' follow), against its file as it stands,
 * every patch checked by the server first, so a map's unsaved edits never reach its file, and a file changed on disk
 * since, which no patch fits, refuses the whole act, writing nothing. Then the changes in that act, and any made since,
 * are taken back here, newest first, so the window and the disk agree again, and the author hears why; one that cannot be
 * taken back is an alarm, and the window counts it unwritten from then on. Taking back waits for any edit under way to
 * end, since nothing may move the documents under a stroke, and nothing is sent meanwhile.
 *
 * A change reaching copies never goes without the blueprints. While they wait for a choice about changes made elsewhere,
 * its act is taken back the moment they start waiting, and the change waits too: keeping this window's version makes it
 * again and writes it, and taking the other drops it. Undoing or redoing one meanwhile is refused (see {@link guard}),
 * and so is writing a change to a blueprint whose tab waits for a choice about a version of it found on disk.
 *
 * An act holding the blueprints alone, when nothing in them is unwritten, writes nothing: the file holds them already, a
 * version found there, say, and writing it again could only lay it out afresh, or put it over a newer one.
 *
 * Once an act lands, the blueprints and every blueprint open as a map read as saved as far as the act wrote them, and so
 * does each map held here whose file the act left holding exactly the steps the map holds.
 *
 * Moves made in other windows are written by those windows; here the kept files only follow them.
 */
class BlueprintWriter
{
  #hub: DocumentHub;

  #maps: Pick<CopyMaps, 'follow' | 'landed' | 'misfit'>;

  #write: (write: BlueprintWrite) => Promise<void>;

  /**
   * Everything listening for what goes wrong.
   */
  #problemListeners = new Set<(message: string, alarm: boolean) => void>();

  #settleMs: number;

  /**
   * The moves made here and not yet sent, oldest first.
   */
  #queue: QueuedMove[] = [];

  /**
   * The moves of the act on its way, or null while none is.
   */
  #sending: QueuedMove[] | null = null;

  /**
   * Settles once the act on its way has landed or failed.
   */
  #sent: Promise<void> = Promise.resolve();

  #timer: ReturnType<typeof setTimeout> | null = null;

  /**
   * How many failed acts are not yet answered, each from the moment it fails, or must be taken back, until its changes are
   * back out, a wait for an edit under way to end included: nothing is sent while any is, since the blueprints still hold
   * the changes going back.
   */
  #answering = 0;

  /**
   * The waits for an edit under way to end before failures are answered, one for each failure waiting.
   */
  #answerTimers = new Set<ReturnType<typeof setTimeout>>();

  /**
   * The wait for an edit under way to end before the changes that waited for a choice are made again, or null.
   */
  #remakeTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * True while moves are being taken back, which are written nowhere.
   */
  #takingBack = false;

  /**
   * Changes to blueprints taken back because the blueprints waited for a choice about changes made elsewhere, oldest
   * first, each as it had moved: made again once the author keeps this window's version, gone once they take the other.
   */
  #awaiting: QueuedMove[] = [];

  /**
   * Steps that could neither be written nor taken back, which the window holds and the disk does not.
   */
  #stranded = new Set<string>();

  /**
   * Counts the acts that failed, so a wait for everything to land ends at a failure rather than trying it forever.
   */
  #failures = 0;

  #unsubscribe: () => void;

  /**
   * @param {BlueprintWriterOptions} options The window's documents, its kept maps, how to write an act, and how the
   * author hears of a problem.
   */
  constructor(options: BlueprintWriterOptions)
  {
    this.#hub = options.hub;
    this.#maps = options.maps;
    this.#write = options.write;
    this.#settleMs = options.settleMs ?? SETTLE_MS;
    if (options.onProblem !== undefined)
    {
      this.#problemListeners.add(options.onProblem);
    }

    this.#unsubscribe = this.#hub.subscribe(event => this.#heard(event));
  }

  /**
   * Listens for what goes wrong writing, to tell the author: an error, or an alarm, which stays until dismissed.
   * @param {(message: string, alarm: boolean) => void} listener Called with the words and whether it is an alarm.
   * @returns {() => void} Stops listening.
   */
  onProblem(listener: (message: string, alarm: boolean) => void): () => void
  {
    this.#problemListeners.add(listener);
    return () =>
    {
      this.#problemListeners.delete(listener);
    };
  }

  /**
   * Tells everything listening what went wrong.
   * @param {string} message The words.
   * @param {boolean} alarm True for an alarm.
   */
  #tell(message: string, alarm: boolean): void
  {
    [ ...this.#problemListeners ].forEach(listener => listener(message, alarm));
  }

  /**
   * Stops writing; an act on its way still lands.
   */
  stop(): void
  {
    this.#unsubscribe();
    this.#cancelTimer();
    this.#answerTimers.forEach(timer => clearTimeout(timer));
    this.#answerTimers.clear();
    if (this.#remakeTimer !== null)
    {
      clearTimeout(this.#remakeTimer);
      this.#remakeTimer = null;
    }
  }

  /**
   * Reports whether anything moved here has not reached the disk: waiting, on its way, being taken back, waiting for the
   * author's choice about the blueprints, or stranded after a failed write that could not be taken back. Closing the
   * window now would lose it.
   * @returns {boolean} True when something is unwritten.
   */
  hasUnwritten(): boolean
  {
    return this.#queue.length > 0 || this.#sending !== null || this.#answering > 0 || this.#awaiting.length > 0 || this.#stranded.size > 0;
  }

  /**
   * Writes whatever is waiting now, without waiting for the moment a change waits, and settles once nothing is on its way:
   * what a save does before anything else, so the blueprints and their copies are on disk when it reports. A write that
   * fails meanwhile ends the wait, whatever it left waiting to be tried again.
   * @returns {Promise<void>} Settles once every act asked for has landed, or one has failed; never rejects.
   */
  async whenWritten(): Promise<void>
  {
    const failures = this.#failures;
    this.#flush();
    while ((this.#sending !== null || this.#queue.length > 0) && this.#failures === failures)
    {
      await this.#sent;
      this.#flush();
    }
  }

  /**
   * Says why a step must not move now, for a reason beyond the window's own histories: a change reaching copies while the
   * blueprints wait for a choice about changes made elsewhere, or while the tab of the blueprint it changes waits for one
   * about a version of it found on disk, since its copies would reach their files without the blueprint, or the tab's
   * blueprint would go over the newer one; or a map file it reaches holding what no way of writing it there fits, changed
   * on disk since. Asked by every undo, redo and history jump before it moves anything (see HistoryRouter's guard).
   * @param {HistoryStep} step The step.
   * @param {'forward' | 'backward'} direction Redo or undo.
   * @returns {string | null} Why, with no full stop of its own, or null when nothing stands in its way.
   */
  guard(step: HistoryStep, direction: 'forward' | 'backward'): string | null
  {
    const blocked = isBlueprintChange(step) ? this.#blockedBy([ step ]) : null;
    if (blocked !== null)
    {
      return blocked.reason;
    }

    const mapId = this.#maps.misfit(step, direction);
    return mapId === null
      ? null
      : `Map ${mapId} changed on disk since this change was written to it`;
  }

  /**
   * Hears one event of the window's documents: a step written at once made, undone or redone, here or elsewhere; the
   * blueprints, or a blueprint's tab, starting to wait for a choice, which takes back whatever waits to be written; and
   * the blueprints' choice made, which makes again what waited for it.
   * @param {HubEvent} event The event.
   */
  #heard(event: HubEvent): void
  {
    if (event.type === 'conflicted' && (event.document === BLUEPRINTS_DOCUMENT || parseDocumentKey(event.document).kind === 'blueprint-map'))
    {
      this.#flush();
      return;
    }

    if (event.type === 'conflict-cleared' && event.document === BLUEPRINTS_DOCUMENT)
    {
      this.#remake();
      return;
    }

    if (event.type !== 'committed' && event.type !== 'undone' && event.type !== 'redone')
    {
      return;
    }

    const { step } = event;
    if (isWrittenAtOnce(step) === false)
    {
      return;
    }

    // a move made elsewhere is that window's to write, and one taken back was never written; the files follow either. An
    // undo or a redo that left parts of its step moves its part that moved, with what each map's file was judged to take.
    const direction = event.type === 'undone' ? 'backward' : 'forward';
    const writes = event.source === 'local' && this.#takingBack === false;
    const left = event.type !== 'committed' && event.split !== undefined ? event.split.left : null;
    const maps = this.#maps.follow(step, direction, writes, left);
    if (writes === false)
    {
      return;
    }

    this.#queue.push({ step, direction, maps, left });
    if (event.type === 'committed')
    {
      this.#settle();
      return;
    }

    this.#flush();
  }

  /**
   * Waits a moment for the next change before writing, the wait starting over with each.
   */
  #settle(): void
  {
    this.#cancelTimer();
    this.#timer = setTimeout(() =>
    {
      this.#timer = null;
      this.#send();
    }, this.#settleMs);
  }

  /**
   * Writes whatever is waiting now.
   */
  #flush(): void
  {
    this.#cancelTimer();
    this.#send();
  }

  /**
   * Stops the wait for the next change.
   */
  #cancelTimer(): void
  {
    if (this.#timer !== null)
    {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
  }

  /**
   * Sends everything waiting as one act, unless one is on its way, which sends the rest once it lands. An act holding a
   * change reaching copies is never sent without the blueprints, which would part the copies from their blueprint on disk,
   * nor while its blueprint's tab waits for a choice: it fails as a refused act does, its changes taken back (see
   * {@link #blockedBy}). An act holding the blueprints alone writes nothing when nothing in them is unwritten.
   */
  #send(): void
  {
    // while a failure is being answered the blueprints still hold the changes going back, so nothing is sent until then.
    if (this.#sending !== null || this.#answering > 0 || this.#queue.length === 0)
    {
      return;
    }

    const moves = this.#queue;
    this.#queue = [];
    const blocked = this.#blockedBy(moves.map(move => move.step));
    if (blocked !== null)
    {
      this.#failed(moves, new Error(blocked.reason), blocked.awaits);
      return;
    }

    // blueprints waiting for a choice are written nowhere.
    const write = this.#actOf(moves);
    if (write.blueprints === undefined && this.#hub.has(BLUEPRINTS_DOCUMENT))
    {
      this.#tell('The blueprints were not saved: they are waiting for a choice about changes made elsewhere.', false);
    }

    // an act reaching no map has the blueprints alone to write, which the file holds already while nothing in them is
    // unwritten: a version found there, say, which writing again could only lay out afresh, or put over a newer one.
    if (write.maps.length === 0 && (write.blueprints === undefined || this.#hub.isDirty(BLUEPRINTS_DOCUMENT) === false))
    {
      this.#maps.landed(this.#mapsOf(moves), true);
      return;
    }

    this.#sending = moves;
    const saved = this.#savedOnLanding(moves);
    this.#sent = this.#write(write).then(
      () =>
      {
        this.#sending = null;
        this.#maps.landed(this.#mapsOf(moves), true);
        saved.forEach(([ key, marker ]) => this.#hub.noteSaved(key, marker));
        this.#send();
      },
      (error: unknown) =>
      {
        this.#sending = null;
        this.#failed(moves, error);
      },
    );
  }

  /**
   * Builds one act from moves: each map's patches, every move's in order, and the blueprints as the window holds them,
   * unless they wait for a choice about changes made elsewhere, which writing them would put this copy over.
   * @param {readonly QueuedMove[]} moves The moves, oldest first.
   * @returns {BlueprintWrite} The act.
   */
  #actOf(moves: readonly QueuedMove[]): BlueprintWrite
  {
    const byMap = new Map<number, Patch[]>();
    moves.forEach(move => move.maps.forEach((patches, mapId) => byMap.set(mapId, [ ...byMap.get(mapId) ?? [], ...patches ])));
    const maps = [ ...byMap ].filter(([ , patches ]) => patches.length > 0).map(([ map, patches ]) => ({ map, patches }));
    return this.#writesBlueprints()
      ? { blueprints: this.#hub.committedContent(BLUEPRINTS_DOCUMENT), maps }
      : { maps };
  }

  /**
   * Reports whether an act writes the blueprints: whenever the window holds them, unless they wait for a choice.
   * @returns {boolean} True when it does.
   */
  #writesBlueprints(): boolean
  {
    return this.#hub.has(BLUEPRINTS_DOCUMENT) && this.#hub.isConflicted(BLUEPRINTS_DOCUMENT) === false;
  }

  /**
   * Says why steps holding a change reaching copies cannot be written now, and whether, once taken back, that change waits
   * for the author's choice: a window not holding the blueprints, whose copies would reach their files without them;
   * blueprints waiting for a choice about changes made elsewhere, which writing would put this window's over, so the change
   * waits for that choice; or the tab of a blueprint one changes waiting for a choice about a version of it found on disk,
   * which writing would put the older blueprint over. Steps reaching no copy are never held back here.
   * @param {readonly HistoryStep[]} steps The steps.
   * @returns {Blocked | null} Why, or null when they can be written.
   */
  #blockedBy(steps: readonly HistoryStep[]): Blocked | null
  {
    const linked = steps.filter(isBlueprintChange);
    if (linked.length === 0)
    {
      return null;
    }

    if (this.#hub.has(BLUEPRINTS_DOCUMENT) === false)
    {
      return { reason: BLUEPRINTS_NOT_HELD, awaits: false };
    }

    if (this.#hub.isConflicted(BLUEPRINTS_DOCUMENT))
    {
      return { reason: BLUEPRINTS_WAITING, awaits: true };
    }

    const waiting = linked.some(step => blueprintMapsOf(step).some(key => this.#hub.isConflicted(key)));
    return waiting
      ? { reason: BLUEPRINT_MAP_WAITING, awaits: false }
      : null;
  }

  /**
   * Works out what reads as saved once an act lands, from the window as it stands while the act is sent: the blueprints,
   * as far as the steps they hold now; every blueprint open as a map, whose content the blueprints hold; and each map held
   * here the act writes whose file was holding exactly the steps it was saved with, which the act moves the way the map
   * moved, so the file ends holding the very steps the map does.
   * @param {readonly QueuedMove[]} moves The act's moves, oldest first.
   * @returns {[ DocumentKey, string[] ][]} Each document to note saved, with the steps its file holds then.
   */
  #savedOnLanding(moves: readonly QueuedMove[]): [ DocumentKey, string[] ][]
  {
    const hub = this.#hub;
    const blueprints = this.#writesBlueprints() === false
      ? []
      : hub.documentKeys()
        .filter(key => key === BLUEPRINTS_DOCUMENT || parseDocumentKey(key).kind === 'blueprint-map')
        .map((key): [ DocumentKey, string[] ] => [ key, idsOf(hub.appliedSteps(key)) ]);

    const mapIds = [ ...new Set(moves.flatMap(move => [ ...move.maps.keys() ])) ];
    const maps = mapIds.flatMap((mapId): [ DocumentKey, string[] ][] =>
    {
      const key = mapDocumentKey(mapId);
      if (hub.has(key) === false)
      {
        return [];
      }

      // the file's steps moved the way the act moves them, each in or out where the map has it; an undo that left part of
      // its step on the map leaves that part in the file too, in the step's place, when the file kept it as the map did,
      // and otherwise the file, having given it back with the rest, holds neither.
      const onFile = moves.filter(move => move.maps.has(mapId)).reduce((steps, move) =>
      {
        const left = move.direction === 'backward' && move.left !== null && fileKeepsLeft(move.step, move.left, key)
          ? [ move.left.id ]
          : [];
        const without = steps.flatMap(id => (id === move.step.id ? left : [ id ]));
        return move.direction === 'forward' ? [ ...without, move.step.id ] : without;
      }, [ ...hub.savedSteps(key) ]);
      const applied = idsOf(hub.appliedSteps(key));
      return sameIds(onFile, applied) ? [ [ key, applied ] ] : [];
    });

    return [ ...blueprints, ...maps ];
  }

  /**
   * Lists the maps moves write, once for each move writing it, as the maps kept here counted them.
   * @param {readonly QueuedMove[]} moves The moves.
   * @returns {number[]} The maps' ids.
   */
  #mapsOf(moves: readonly QueuedMove[]): number[]
  {
    return moves.flatMap(move => [ ...move.maps.keys() ]);
  }

  /**
   * Answers an act that failed. Every change to a blueprint in it, and every one made since, is taken back here, newest
   * first, since the disk holds none of them and its copies must not part from it: the window then agrees with the disk
   * again. The files the act would have written are no longer known here. A change that cannot be taken back, a later edit
   * standing in its way, is stranded, which the author is alarmed about, since the disk lacks it. Any other change to the
   * blueprints, a rename, say, reaching no copy, is kept, waiting to be written with the next act or the next save; the
   * author hears why it was not written. Nothing is sent from the moment it fails until the changes are back out, and the
   * taking back waits for any edit under way to end (see {@link #answer}).
   * @param {readonly QueuedMove[]} moves The act's moves, oldest first.
   * @param {unknown} error Why it failed.
   * @param {boolean} awaits Whether the changes taken back wait for the author's choice about the blueprints.
   */
  #failed(moves: readonly QueuedMove[], error: unknown, awaits = false): void
  {
    this.#failures += 1;
    this.#cancelTimer();
    this.#answering += 1;
    this.#answer(moves, error, awaits);
  }

  /**
   * Takes back a failed act's changes reaching copies, and every one made since, once no edit is open, as
   * {@link #failed} describes: nothing may move the documents under a stroke under way, so while one is, this looks again a
   * moment later, every change made meanwhile joining those taken back. Those that wait for the author's choice are kept,
   * in the order they were made.
   * @param {readonly QueuedMove[]} moves The act's moves, oldest first.
   * @param {unknown} error Why it failed.
   * @param {boolean} awaits Whether the changes taken back wait for the author's choice about the blueprints.
   */
  #answer(moves: readonly QueuedMove[], error: unknown, awaits: boolean): void
  {
    if (this.#hub.isEditing())
    {
      const timer = setTimeout(() =>
      {
        this.#answerTimers.delete(timer);
        this.#answer(moves, error, awaits);
      }, EDIT_WAIT_MS);
      this.#answerTimers.add(timer);
      return;
    }

    const since = this.#queue;
    const all = [ ...moves, ...since ];
    const linked = all.filter(move => isBlueprintChange(move.step));
    this.#queue = all.filter(move => isBlueprintChange(move.step) === false);

    // moves heard while taking back are the taking back itself, written nowhere.
    this.#takingBack = true;
    const stranded: HistoryStep[] = [];
    const takenBack: QueuedMove[] = [];
    try
    {
      this.#maps.landed(this.#mapsOf(moves), false);
      [ ...linked ].reverse().forEach(move =>
      {
        if (this.#takeBack(move))
        {
          takenBack.unshift(move);
        }
        else
        {
          stranded.push(move.step);
        }
      });
    }
    finally
    {
      this.#takingBack = false;
      this.#answering -= 1;
    }

    this.#maps.landed(this.#mapsOf(since), true);
    stranded.forEach(step => this.#stranded.add(step.id));
    if (awaits)
    {
      this.#awaiting.push(...takenBack);
    }

    this.#tell(...failureWords(linked.length > 0, stranded, reasonOf(error), awaits));
  }

  /**
   * Makes again every change that waited for the author's choice about the blueprints, now it is made, oldest first, each
   * the way it had moved, so it is written at once. One no history holds any more went with the author taking the other
   * version, and is simply gone; one that can no longer move, something since standing in its way, is named to the
   * author. Waits for any edit under way to end first.
   */
  #remake(): void
  {
    if (this.#awaiting.length === 0)
    {
      return;
    }

    if (this.#hub.isEditing())
    {
      if (this.#remakeTimer === null)
      {
        this.#remakeTimer = setTimeout(() =>
        {
          this.#remakeTimer = null;
          this.#remake();
        }, EDIT_WAIT_MS);
      }
      return;
    }

    const awaiting = this.#awaiting;
    this.#awaiting = [];
    const refused = awaiting.filter(move => this.#moveAgain(move) === 'refused').map(move => `"${move.step.label}"`);
    if (refused.length > 0)
    {
      this.#tell(`${refused.join(', ')} could not be made again: something changed since stands in its way.`, false);
    }
  }

  /**
   * Makes one change taken back to wait move again the way it had: a change made or redone is redone, one undone is undone
   * again, from a history where it is the next to move that way.
   * @param {QueuedMove} move The move as it was before it was taken back.
   * @returns {'moved' | 'gone' | 'refused'} Moved; gone, no history holding it any more; or refused.
   */
  #moveAgain(move: QueuedMove): 'moved' | 'gone' | 'refused'
  {
    const hub = this.#hub;
    const { step, direction } = move;
    const listed = step.histories.filter(key => hub.history(key).rows.some(row => row.id === step.id));
    if (listed.length === 0)
    {
      return 'gone';
    }

    const history = listed.find(key =>
    {
      const { rows, position } = hub.history(key);
      const next = direction === 'forward' ? rows[position] : rows[position - 1];
      return next !== undefined && next.id === step.id;
    });
    if (history === undefined)
    {
      return 'refused';
    }

    const moved = direction === 'forward' ? hub.redo(history) : hub.undo(history);
    return moved.ok ? 'moved' : 'refused';
  }

  /**
   * Takes one move back in the window: a change made or redone is undone, and one undone is redone, from a history where it
   * is the next to move that way.
   * @param {QueuedMove} move The move.
   * @returns {boolean} True when it was taken back.
   */
  #takeBack(move: QueuedMove): boolean
  {
    const hub = this.#hub;
    const { step, direction } = move;
    const history = step.histories.find(key =>
    {
      const { rows, position } = hub.history(key);
      const head = direction === 'forward' ? rows[position - 1] : rows[position];
      return head !== undefined && head.id === step.id;
    });
    if (history === undefined)
    {
      return false;
    }

    const moved = direction === 'forward' ? hub.undo(history) : hub.redo(history);
    return moved.ok;
  }
}

export { BlueprintWriter, isWrittenAtOnce, SETTLE_MS };
export type { BlueprintWriterOptions };
