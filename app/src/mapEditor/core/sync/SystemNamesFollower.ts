import type { SystemNames } from '../commandList/ProjectNames.ts';
import type { DocumentHub } from '../history/DocumentHub.ts';
import { SYSTEM_KEY } from '../model/documentKeys.ts';
import type { EditorDocument } from '../model/EditorDocument.ts';
import type { SystemDocument } from '../model/JsonDocument.ts';
import { lookAtDocument } from './lookAtDocument.ts';
import type { SyncPeer } from './SyncPeer.ts';

/**
 * What following the names reads from: this window's documents and the files behind them, and the other windows.
 */
type FollowSources = {
  readonly hub: Pick<DocumentHub, 'has' | 'document' | 'readFile' | 'subscribe'>;
  readonly sync: Pick<SyncPeer, 'whenHeldOrDiscovered' | 'holders' | 'requestSnapshot' | 'onHoldingChange'>;
};

/**
 * Where the names followed go: a window's names.
 */
type NamesTarget = {
  followSystem(system: SystemNames): void;
};

/**
 * Reads the switch and variable names a system document holds.
 * @param {EditorDocument} document The system document.
 * @returns {SystemNames} The names.
 */
const namesIn = (document: EditorDocument): SystemNames =>
{
  const system = document as SystemDocument;
  return { switches: system.names('switches'), variables: system.names('variables') };
};

/**
 * Keeps one window's switch and variable names as they stand in System.json right now, wherever it is being renamed, so
 * a rename made in the Switches & Variables window reads by its new name in every window at once, saved or not.
 *
 * The window renaming them holds System.json, and so does nobody else: holding it counts as keeping a copy of its
 * unsaved renames, and a window that can neither show nor save them must never let the renaming window close without
 * asking (see {@link lookAtDocument}). So a window holding it reads the names from its own copy as it changes, and every
 * other window only looks: again whenever a window holding it moves it on, takes it up or lets it go, and whenever its
 * file changes on disk. A look reads the live copy where some window holds one and the file where none does, so a
 * window that closed without saving leaves the names as the file has them. Looks may finish out of order; only the
 * latest one asked for counts.
 */
class SystemNamesFollower
{
  #sources: FollowSources;

  #target: NamesTarget;

  #looks = 0;

  #stopDocument: (() => void) | null = null;

  /**
   * @param {FollowSources} sources This window's hub and its link to the others.
   * @param {NamesTarget} target Where the names go.
   */
  constructor(sources: FollowSources, target: NamesTarget)
  {
    this.#sources = sources;
    this.#target = target;
  }

  /**
   * Starts following: from this window's own copy while it holds one, and from the other windows' otherwise. Until some
   * window holds System.json, or its file changes, the names the window read from the server are its names, and nothing
   * is looked at.
   * @returns {() => void} Stops following.
   */
  start(): () => void
  {
    const { hub, sync } = this.#sources;
    const stops = [
      // this window taking System.json up or letting it go changes where the names come from.
      hub.subscribe(event =>
      {
        if ((event.type === 'adopted' || event.type === 'released') && event.document === SYSTEM_KEY)
        {
          this.#followHeld();
        }
      }),

      // another window renaming, undoing, opening or closing moves what it holds on.
      sync.onHoldingChange(key =>
      {
        if (key === SYSTEM_KEY)
        {
          this.refresh();
        }
      }),
    ];
    if (hub.has(SYSTEM_KEY))
    {
      this.#followHeld();
    }

    return () =>
    {
      stops.forEach(stop => stop());
      this.#stopDocument?.();
      this.#stopDocument = null;
      this.#looks += 1;
    };
  }

  /**
   * Reads the names again, as the file changing on disk asks: with a look, unless this window holds its own copy, which
   * follows itself.
   */
  refresh(): void
  {
    if (this.#sources.hub.has(SYSTEM_KEY) === false)
    {
      this.#look();
    }
  }

  /**
   * Follows this window's own copy while it holds one, every change to it as it lands; once it lets go, looks instead.
   */
  #followHeld(): void
  {
    const { hub } = this.#sources;
    this.#stopDocument?.();
    this.#stopDocument = null;
    if (hub.has(SYSTEM_KEY) === false)
    {
      this.#look();
      return;
    }

    // a look still on its way would land on top of the copy now held, so it no longer counts.
    this.#looks += 1;
    const document = hub.document(SYSTEM_KEY);
    this.#stopDocument = document.subscribe(() => this.#target.followSystem(namesIn(document)));
    this.#target.followSystem(namesIn(document));
  }

  /**
   * Looks at System.json as it stands, holding nothing, and takes its names, unless a later look was asked for first or
   * this window took it up meanwhile. A look that fails changes nothing.
   */
  #look(): void
  {
    this.#looks += 1;
    const ticket = this.#looks;
    lookAtDocument(this.#sources, SYSTEM_KEY)
      .then(document =>
      {
        if (ticket === this.#looks && this.#sources.hub.has(SYSTEM_KEY) === false)
        {
          this.#target.followSystem(namesIn(document));
        }
      })
      .catch(() => undefined);
  }
}

export { SystemNamesFollower };
export type { FollowSources, NamesTarget };
