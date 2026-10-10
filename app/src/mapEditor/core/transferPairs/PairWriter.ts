import { MapEditorApiError, type MapChangesWrite } from '../api/MapEditorApi.ts';
import { isWrittenAtOnce } from '../blueprints/blueprintWriter.ts';
import type { DocumentHub, HubEvent } from '../history/DocumentHub.ts';
import { writesThrough, type HistoryStep } from '../history/HistoryStep.ts';
import { mapDocumentKey, parseDocumentKey, type DocumentKey } from '../model/documentKeys.ts';
import { MapDocument } from '../model/MapDocument.ts';
import { invertPatch, PatchConflictError, type Patch } from '../model/patches.ts';
import type { RmmzMap } from '../model/rmmzTypes.ts';

/**
 * How long taking a failed write back waits before looking again while an edit is open, in milliseconds: nothing may move
 * the documents under a stroke under way.
 */
const EDIT_WAIT_MS = 25;

/**
 * One move of a pair the writer writes: the step, which way it moved, and the patches each map's file takes for it.
 */
type QueuedMove = {
  readonly step: HistoryStep;
  readonly direction: 'forward' | 'backward';
  readonly maps: ReadonlyMap<number, Patch[]>;
};

/**
 * What the writer needs from the window.
 */
type PairWriterOptions = {
  /**
   * The window's documents.
   */
  readonly hub: DocumentHub;

  /**
   * Writes one act to disk (see MapEditorApi's writeMapChanges).
   */
  readonly write: (write: MapChangesWrite) => Promise<void>;

  /**
   * Tells the author what went wrong: an error, or an alarm, which stays until dismissed.
   */
  readonly onProblem?: (message: string, alarm: boolean) => void;
};

/**
 * Lists the maps whose files a step changes, by id: every real map it changes, and every one whose file alone it changes
 * (see HistoryStep's fileVersions); never a blueprint opened as a map.
 * @param {HistoryStep} step The step.
 * @returns {number[]} The maps' ids, in the order the step first reaches each.
 */
const mapsOfStep = (step: HistoryStep): number[] =>
{
  const keys = [ ...step.entries.map(entry => entry.document), ...(step.fileVersions ?? []).map(version => version.document) ];
  return [ ...new Set(keys) ].flatMap(key =>
  {
    const parsed = parseDocumentKey(key);
    return parsed.kind === 'map' ? [ parsed.mapId ] : [];
  });
};

/**
 * Reads a step as a pair: one changing the files of two maps that no blueprint made. Pairing is the only action reaching
 * from one map to another besides a blueprint's change reaching its copies, which the blueprint writer writes, so a step
 * changing two maps is a pair however many windows it passed through.
 * @param {HistoryStep} step The step.
 * @returns {boolean} True for a pair.
 */
const isPairStep = (step: HistoryStep): boolean =>
{
  return isWrittenAtOnce(step) === false && mapsOfStep(step).length > 1;
};

/**
 * Lists the ways a step can reach one map's file, the likelier first: what the file takes in place of the map's own
 * patches, where the step recorded that (see HistoryStep's fileVersions), then the map's own patches, which a map's file
 * holds once the map was saved with the step in it. Each is turned the way the step moves.
 * @param {HistoryStep} step The step.
 * @param {DocumentKey} key The map.
 * @param {'forward' | 'backward'} direction Made or redone, or undone.
 * @returns {Patch[][]} The ways, each the patches in the order they go in.
 */
const waysToFile = (step: HistoryStep, key: DocumentKey, direction: 'forward' | 'backward'): Patch[][] =>
{
  const own = step.entries.filter(entry => entry.document === key).map(entry => entry.patch);
  const version = step.fileVersions?.find(each => each.document === key);
  const ways = version === undefined ? [ own ] : [ [ ...version.patches ], own ];
  return ways.map(patches => (direction === 'forward' ? patches : [ ...patches ].reverse().map(invertPatch)));
};

/**
 * Reports whether a map's file takes some patches as the server puts them in: each finding what it replaces, and each
 * splice reaching the end of its list, since an event's id is its place there.
 * @param {MapDocument} file The file, which is left as it is.
 * @param {readonly Patch[]} patches The patches, in order.
 * @returns {boolean} True when every one fits.
 */
const fitsFile = (file: MapDocument, patches: readonly Patch[]): boolean =>
{
  const copy = MapDocument.fromJson(mapDocumentKey(file.mapId), file.toJson());
  try
  {
    for (const patch of patches)
    {
      const list = patch.kind === 'splice' ? copy.valueAt(patch.path) : null;
      if (patch.kind === 'splice' && (Array.isArray(list) === false || patch.index + patch.removed.length !== list.length))
      {
        return false;
      }

      copy.apply(patch);
    }

    return true;
  }
  catch (error)
  {
    if ((error instanceof PatchConflictError) === false)
    {
      throw error;
    }

    return false;
  }
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
 * Builds one act from moves: each map's patches, every move's in order, each map named once.
 * @param {readonly QueuedMove[]} moves The moves, oldest first.
 * @returns {MapChangesWrite} The act.
 */
const actOf = (moves: readonly QueuedMove[]): MapChangesWrite =>
{
  const byMap = new Map<number, Patch[]>();
  moves.forEach(move => move.maps.forEach((patches, mapId) => byMap.set(mapId, [ ...byMap.get(mapId) ?? [], ...patches ])));
  return { maps: [ ...byMap ].filter(([ , patches ]) => patches.length > 0).map(([ map, patches ]) => ({ map, patches })) };
};

/**
 * Writes every transfer pair placed, undone or redone in this window to disk as it moves, both maps in one act (see
 * MapEditorApi's writeMapChanges), so the door and its way back on disk never part, whatever is discarded or wherever the
 * editor stops. A pair is never saved by hand: the maps it changes read as saved once the act holding its latest move has
 * landed, unless they hold unsaved edits of their own.
 *
 * Each map's file takes the pair against its file as it stands, every patch checked by the server first: a held map
 * holding unsaved edits takes the version of the pair its file was planned for, never those edits; a map nobody has open
 * takes the pair written through, never opened; and a map saved since the pair reached it gives the pair back by the
 * map's own patches, as its file holds them now. A file changed on disk since, which no patch fits, refuses the whole
 * act, writing nothing. Then the moves in that act, and any made since, are taken back here, newest first, so the window
 * and the disk agree again, and the author hears why; one that cannot be taken back is an alarm, and the window counts it
 * unwritten from then on. Taking back waits for any edit under way to end.
 *
 * One act is on its way at a time, and what moves meanwhile goes in the next. A pair written through to a map nobody
 * here holds is taken up by that map once this window opens it (see DocumentHub's attachSteps), so it undoes from that
 * map too. Moves made in other windows are written by those windows.
 */
class PairWriter
{
  #hub: DocumentHub;

  #write: (write: MapChangesWrite) => Promise<void>;

  #problemListeners = new Set<(message: string, alarm: boolean) => void>();

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

  /**
   * How many failed acts are not yet answered: nothing is sent while any is, since their moves are still in the window.
   */
  #answering = 0;

  /**
   * Settles once the failed act being answered has its moves taken back, which may wait for a stroke to end: what a wait
   * for everything to land waits on meanwhile, since nothing is sent until then.
   */
  #answered: Promise<void> = Promise.resolve();

  /**
   * Settles {@link #answered}.
   */
  #settleAnswered: () => void = () => undefined;

  /**
   * The waits for an edit under way to end before a failure is answered.
   */
  #answerTimers = new Set<ReturnType<typeof setTimeout>>();

  /**
   * True while moves are being taken back, which are written nowhere.
   */
  #takingBack = false;

  /**
   * Pairs that could neither be written nor taken back, which the window holds and the disk does not.
   */
  #stranded = new Set<string>();

  /**
   * Counts the acts that failed, so a wait for everything to land ends at a failure rather than trying it forever.
   */
  #failures = 0;

  /**
   * For each map nobody here holds, the pairs written through to its file, in the order they reached it: what the map
   * takes up once it is opened here.
   */
  #through = new Map<number, HistoryStep[]>();

  #unsubscribe: () => void;

  /**
   * @param {PairWriterOptions} options The window's documents, how to write an act, and how the author hears of a problem.
   */
  constructor(options: PairWriterOptions)
  {
    this.#hub = options.hub;
    this.#write = options.write;
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
   * Stops writing; an act on its way still lands. A failure still waiting to be answered never will be, so nothing waits
   * on it any more.
   */
  stop(): void
  {
    this.#unsubscribe();
    this.#answerTimers.forEach(timer => clearTimeout(timer));
    this.#answerTimers.clear();
    this.#settleAnswered();
  }

  /**
   * Reports whether anything moved here has not reached the disk: waiting, on its way, being taken back, or stranded
   * after a failed write that could not be taken back. Closing the window now would lose it.
   * @returns {boolean} True when something is unwritten.
   */
  hasUnwritten(): boolean
  {
    return this.#queue.length > 0 || this.#sending !== null || this.#answering > 0 || this.#stranded.size > 0;
  }

  /**
   * Settles once nothing is on its way: what a save and opening a map wait for, so a map's file is never read, or written
   * whole, under a pair still on its way to it. A write that fails meanwhile ends the wait, once its moves are taken back
   * out of the window: until then the window holds a pair the disk refused, which a save would write into one map alone.
   * Taking them back may wait for a stroke to end, and so may this.
   * @returns {Promise<void>} Settles once every act asked for has landed, or one has failed and been answered; never
   * rejects.
   */
  async whenWritten(): Promise<void>
  {
    const failures = this.#failures;
    this.#send();

    // nothing is sent while a failure is being answered, so the loop stops there rather than wait on an act long settled.
    while ((this.#sending !== null || this.#queue.length > 0) && this.#answering === 0 && this.#failures === failures)
    {
      await this.#sent;
      this.#send();
    }

    // a failure being answered, from before the wait or during it, is waited out.
    await this.#answered;
  }

  /**
   * Says why a pair must not move now, beyond the window's own histories: a map it reaches held here whose file, as this
   * window knows it, holds no way the move could reach it, something having changed it on disk since. A map nobody here
   * holds cannot be told, and the write itself checks it. Asked by every undo, redo and history jump (see HistoryRouter).
   * @param {HistoryStep} step The step.
   * @param {'forward' | 'backward'} direction Redo or undo.
   * @returns {string | null} Why, with no full stop of its own, or null when nothing stands in its way.
   */
  guard(step: HistoryStep, direction: 'forward' | 'backward'): string | null
  {
    if (isPairStep(step) === false)
    {
      return null;
    }

    const changed = mapsOfStep(step).find(mapId =>
    {
      const file = this.#fileAhead(mapId);
      return file !== null && waysToFile(step, mapDocumentKey(mapId), direction).every(way => fitsFile(file, way) === false);
    });
    return changed === undefined
      ? null
      : `Map ${changed} changed on disk since this transfer pair was written to it`;
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
   * Hears one event of the window's documents: a pair made, undone or redone, here or elsewhere, which the record of
   * pairs written through follows, and which is written when this window moved it; and a map opened here, which takes up
   * the pairs written through to its file.
   * @param {HubEvent} event The event.
   */
  #heard(event: HubEvent): void
  {
    if (event.type === 'adopted')
    {
      this.#adopted(event.document);
      return;
    }

    if ((event.type !== 'committed' && event.type !== 'undone' && event.type !== 'redone') || isPairStep(event.step) === false)
    {
      return;
    }

    const direction = event.type === 'undone' ? 'backward' : 'forward';
    this.#noteThrough(event.step, direction);

    // a move made elsewhere is that window's to write, and one taken back was never written.
    if (event.source !== 'local' || this.#takingBack)
    {
      return;
    }

    this.#queue.push({ step: event.step, direction, maps: this.#filesTake(event.step, direction) });
    this.#send();
  }

  /**
   * Works out what each map's file takes for a move: the first way the file, as it will be once every act on its way has
   * landed, takes whole; the likeliest where that is not known, or none fits, for the write itself to check.
   * @param {HistoryStep} step The step.
   * @param {'forward' | 'backward'} direction Made or redone, or undone.
   * @returns {Map<number, Patch[]>} The patches each map's file takes, by map id.
   */
  #filesTake(step: HistoryStep, direction: 'forward' | 'backward'): Map<number, Patch[]>
  {
    const taken = new Map<number, Patch[]>();
    mapsOfStep(step).forEach(mapId =>
    {
      const ways = waysToFile(step, mapDocumentKey(mapId), direction);
      const file = this.#fileAhead(mapId);
      const way = (file === null ? undefined : ways.find(each => fitsFile(file, each))) ?? ways[0];
      taken.set(mapId, way);
    });

    return taken;
  }

  /**
   * Works out what a held map's file will hold once every act of this window's on its way to it has landed: what the
   * window knows the file holds, with the patches of every move sending or waiting put in, in order.
   * @param {number} mapId The map.
   * @returns {MapDocument | null} The file, or null for a map not held here, one whose file this window lost track of, or
   * one a move on its way does not fit.
   */
  #fileAhead(mapId: number): MapDocument | null
  {
    const key = mapDocumentKey(mapId);
    const known = this.#hub.has(key) ? this.#hub.fileContent(key) : null;
    if (known === null)
    {
      return null;
    }

    const file = MapDocument.fromJson(key, known as unknown as RmmzMap);
    const ahead = [ ...this.#sending ?? [], ...this.#queue ].flatMap(move => move.maps.get(mapId) ?? []);
    if (fitsFile(file, ahead) === false)
    {
      return null;
    }

    ahead.forEach(patch => file.apply(patch));
    return file;
  }

  /**
   * Notes a pair written through to a map nobody here holds going into its file or coming out, as made, undone or redone
   * here or elsewhere: what that map takes up once it is opened here.
   * @param {HistoryStep} step The step.
   * @param {'forward' | 'backward'} direction Which way it moved.
   */
  #noteThrough(step: HistoryStep, direction: 'forward' | 'backward'): void
  {
    mapsOfStep(step).forEach(mapId =>
    {
      const key = mapDocumentKey(mapId);
      if (this.#hub.has(key) || writesThrough(step, key) === false)
      {
        return;
      }

      const kept = (this.#through.get(mapId) ?? []).filter(each => each.id !== step.id);
      this.#through.set(mapId, direction === 'forward' ? [ ...kept, step ] : kept);
    });
  }

  /**
   * Hears a map opened here: the pairs written through to its file are taken up, so undo reaches them from the map
   * itself. A file holding something else since keeps them out, and the map's history starts without them.
   * @param {DocumentKey} key The document opened.
   */
  #adopted(key: DocumentKey): void
  {
    const parsed = parseDocumentKey(key);
    if (parsed.kind !== 'map')
    {
      return;
    }

    const through = this.#through.get(parsed.mapId) ?? [];
    this.#through.delete(parsed.mapId);
    if (through.length > 0)
    {
      this.#hub.attachSteps(key, through);
    }
  }

  /**
   * Sends everything waiting as one act, unless one is on its way or a failure is being answered, which sends the rest
   * once it is done.
   */
  #send(): void
  {
    if (this.#sending !== null || this.#answering > 0 || this.#queue.length === 0)
    {
      return;
    }

    const moves = this.#queue;
    this.#queue = [];
    const write = actOf(moves);
    this.#sending = moves;
    this.#sent = this.#write(write).then(
      () =>
      {
        this.#sending = null;
        write.maps.forEach(({ map, patches }) => this.#hub.notePatched(mapDocumentKey(map), patches));
        this.#send();
      },
      (error: unknown) =>
      {
        this.#sending = null;
        this.#failures += 1;
        this.#answering += 1;
        this.#answered = new Promise(resolve =>
        {
          this.#settleAnswered = resolve;
        });
        this.#answer(moves, error);
      },
    );
  }

  /**
   * Takes back a failed act's moves, and every one made since, newest first, once no edit is open, so the window agrees
   * with the disk again: a pair placed or redone is undone, and one undone is redone. While an edit is open this looks
   * again a moment later, every move made meanwhile joining those taken back. A move that cannot be taken back, a later
   * edit standing in its way, is stranded, which the author is alarmed about, since the disk lacks it.
   * @param {readonly QueuedMove[]} moves The act's moves, oldest first.
   * @param {unknown} error Why it failed.
   */
  #answer(moves: readonly QueuedMove[], error: unknown): void
  {
    if (this.#hub.isEditing())
    {
      const timer = setTimeout(() =>
      {
        this.#answerTimers.delete(timer);
        this.#answer(moves, error);
      }, EDIT_WAIT_MS);
      this.#answerTimers.add(timer);
      return;
    }

    const all = [ ...moves, ...this.#queue ];
    this.#queue = [];
    const stranded: HistoryStep[] = [];
    this.#takingBack = true;
    try
    {
      [ ...all ].reverse().forEach(move =>
      {
        if (this.#takeBack(move) === false)
        {
          stranded.push(move.step);
        }
      });
    }
    finally
    {
      this.#takingBack = false;
      this.#answering -= 1;
      this.#settleAnswered();
    }

    stranded.forEach(step => this.#stranded.add(step.id));
    const reason = reasonOf(error);
    if (stranded.length > 0)
    {
      const labels = [ ...new Set(stranded.map(step => `"${step.label}"`)) ].join(', ');
      this.#tell(`The transfer pair could not be written (${reason}), and ${labels} could not be taken back: undo it by hand.`, true);
      return;
    }

    this.#tell(`The transfer pair could not be written, so it was taken back: ${reason}.`, false);
  }

  /**
   * Takes one move back in the window: a pair placed or redone is undone, and one undone is redone, from a history where it
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

export { isPairStep, PairWriter };
export type { PairWriterOptions };
