/**
 * One claim on a WebGL context: holding one, or waiting its turn for one.
 */
type ContextClaim = {
  /**
   * Whether the claim holds a context now.
   */
  readonly isGranted: boolean;

  /**
   * Gives the context back, or leaves the line, and the claim that has waited longest takes its place. Releasing a
   * claim twice does nothing more.
   */
  release(): void;
};

/**
 * Where one claim stands, and who to tell when it is granted.
 */
type ClaimEntry = {
  stage: 'waiting' | 'granted' | 'released';
  readonly onGranted: () => void;
};

/**
 * How many map views may hold a WebGL context at once, across the main window and every window torn out of it.
 *
 * Chromium keeps at most 16 WebGL contexts alive in one renderer process, and a torn-out window shares its opener's
 * process (spike S2), so every map view of the workspace draws from this one budget. Past 16, Chromium takes the
 * oldest context away without a word and never gives it back by itself, which is how a seventeenth map once blanked
 * the first. Pixi keeps a small context of its own open for the life of the page, having asked it about the driver's
 * shader precision, and the rest of the margin keeps room for anything else in the window that draws with WebGL, so
 * the maps never lose theirs to it.
 */
const MAP_VIEW_CONTEXTS = 12;

/**
 * Hands out a fixed number of WebGL contexts to whoever asks, first come, first served. A claim is granted at once
 * while one is free and otherwise waits in line until another claim is released. Nothing here touches the GPU: it
 * only keeps count, so that views which cannot all draw at once know it, and can say so, instead of the browser
 * silently taking the oldest context from under a view still showing.
 */
class ContextBudget
{
  #limit: number;

  #granted = new Set<ClaimEntry>();

  #waiting: ClaimEntry[] = [];

  /**
   * @param {number} limit How many claims may hold a context at once.
   */
  constructor(limit: number)
  {
    this.#limit = limit;
  }

  /**
   * How many claims may hold a context at once.
   * @returns {number} The limit.
   */
  get limit(): number
  {
    return this.#limit;
  }

  /**
   * How many claims hold a context now.
   * @returns {number} The count.
   */
  get grantedCount(): number
  {
    return this.#granted.size;
  }

  /**
   * How many claims are waiting their turn.
   * @returns {number} The count.
   */
  get waitingCount(): number
  {
    return this.#waiting.length;
  }

  /**
   * Asks for a context. The claim holds one at once when one is free, and otherwise waits in line until enough claims
   * ahead of it are released; {@code onGranted} is called then, and never for a claim granted at once, which its
   * caller sees from {@link ContextClaim.isGranted} as soon as this returns.
   * @param {() => void} onGranted Called when a waiting claim is granted.
   * @returns {ContextClaim} The claim.
   */
  request(onGranted: () => void): ContextClaim
  {
    const entry: ClaimEntry = { stage: 'waiting', onGranted };
    if (this.#granted.size < this.#limit)
    {
      entry.stage = 'granted';
      this.#granted.add(entry);
    }
    else
    {
      this.#waiting.push(entry);
    }

    return {
      get isGranted(): boolean
      {
        return entry.stage === 'granted';
      },
      release: () => this.#release(entry),
    };
  }

  /**
   * Lets a claim go, and grants the claims that waited longest while contexts are free.
   * @param {ClaimEntry} entry The claim.
   */
  #release(entry: ClaimEntry): void
  {
    if (entry.stage === 'waiting')
    {
      this.#waiting.splice(this.#waiting.indexOf(entry), 1);
    }

    const held = entry.stage === 'granted';
    entry.stage = 'released';
    if (held)
    {
      this.#granted.delete(entry);
      this.#grantWaiting();
    }
  }

  /**
   * Grants waiting claims, oldest first, while contexts are free. Each is counted before it is told, so a claim that
   * lets go again as it hears, or asks for another, finds the count already true.
   */
  #grantWaiting(): void
  {
    while (this.#granted.size < this.#limit && this.#waiting.length > 0)
    {
      const next = this.#waiting.shift() as ClaimEntry;
      next.stage = 'granted';
      this.#granted.add(next);
      next.onGranted();
    }
  }
}

/**
 * The budget every map view in this window, and in the windows torn out of it, draws from.
 */
const mapViewContexts = new ContextBudget(MAP_VIEW_CONTEXTS);

export { ContextBudget, MAP_VIEW_CONTEXTS, mapViewContexts };
export type { ContextClaim };
