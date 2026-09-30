/**
 * The part of a window a frame loop schedules on.
 */
type FrameWindow = {
  requestAnimationFrame(callback: FrameRequestCallback): number;
  cancelAnimationFrame(handle: number): void;
};

/**
 * Runs a callback once per frame on whichever window hosts the renderer right now. A map torn out of the main window
 * lives in its own window, and a hidden main window stops handing out frames (S2), so every frame looks the window up
 * afresh instead of keeping the one the loop started on. A cancelled frame is always cancelled on the window it was
 * asked of.
 */
class FrameLoop
{
  #hostWindow: () => FrameWindow | null;

  #onFrame: (time: number) => void;

  #scheduledOn: FrameWindow | null = null;

  #handle = 0;

  #running = false;

  /**
   * @param {() => FrameWindow | null} hostWindow Finds the window hosting the renderer now, or null when there is none.
   * @param {(time: number) => void} onFrame Called each frame with the frame's time.
   */
  constructor(hostWindow: () => FrameWindow | null, onFrame: (time: number) => void)
  {
    this.#hostWindow = hostWindow;
    this.#onFrame = onFrame;
  }

  /**
   * Whether the loop is running.
   * @returns {boolean} True between start and stop.
   */
  get isRunning(): boolean
  {
    return this.#running;
  }

  /**
   * Starts asking for frames. Starting a running loop only makes sure a frame is on its way, which is how a loop whose
   * window went away picks up again on the next one.
   */
  start(): void
  {
    this.#running = true;
    if (this.#scheduledOn === null)
    {
      this.#schedule();
    }
  }

  /**
   * Stops asking for frames and cancels the one on its way.
   */
  stop(): void
  {
    this.#running = false;
    if (this.#scheduledOn !== null)
    {
      this.#scheduledOn.cancelAnimationFrame(this.#handle);
      this.#scheduledOn = null;
    }
  }

  /**
   * Asks the hosting window for the next frame.
   */
  #schedule(): void
  {
    const target = this.#hostWindow();
    if (target === null)
    {
      return;
    }

    this.#scheduledOn = target;
    this.#handle = target.requestAnimationFrame(this.#tick);
  }

  /**
   * Runs one frame, then asks for the next.
   * @param {number} time The frame's time.
   */
  #tick = (time: number): void =>
  {
    this.#scheduledOn = null;
    if (this.#running === false)
    {
      return;
    }

    // ask for the next frame first, so a frame that throws does not stop the loop for good.
    this.#schedule();
    this.#onFrame(time);
  };
}

export { FrameLoop };
export type { FrameWindow };
