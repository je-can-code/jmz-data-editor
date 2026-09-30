import { describe, expect, it } from 'vitest';
import { FrameLoop, type FrameWindow } from '../../../src/mapEditor/render/FrameLoop.ts';

/*
 * A torn-out map lives in its own window, and a hidden main window stops handing out frames (spike S2), so the frame
 * loop asks whichever window hosts the renderer now for every frame instead of keeping the window it started on. It
 * must also cancel a pending frame on the window that promised it, keep going after a frame that throws, never ask
 * twice for one frame, and pause, rather than fail, while no window hosts it.
 */

/**
 * A window that hands out frames when told to.
 */
class FakeWindow implements FrameWindow
{
  readonly name: string;

  pending = new Map<number, FrameRequestCallback>();

  cancelled: number[] = [];

  #next = 1;

  /**
   * @param {string} name The window's name, for the assertions.
   */
  constructor(name: string)
  {
    this.name = name;
  }

  requestAnimationFrame(callback: FrameRequestCallback): number
  {
    const handle = this.#next++;
    this.pending.set(handle, callback);
    return handle;
  }

  cancelAnimationFrame(handle: number): void
  {
    this.cancelled.push(handle);
    this.pending.delete(handle);
  }

  /**
   * Runs every frame asked for so far.
   * @param {number} time The frame's time.
   */
  flush(time: number): void
  {
    const callbacks = [ ...this.pending.values() ];
    this.pending.clear();
    callbacks.forEach(callback => callback(time));
  }
}

describe('FrameLoop', () =>
{
  it('runs a frame on the hosting window and asks it for the next', () =>
  {
    // Arrange.
    const main = new FakeWindow('main');
    const frames: number[] = [];
    const loop = new FrameLoop(() => main, time => frames.push(time));

    // Act.
    loop.start();
    main.flush(16);
    main.flush(33);

    // Assert.
    expect([ frames, main.pending.size, loop.isRunning ])
      .toStrictEqual([ [ 16, 33 ], 1, true ]);
  });

  it('moves to the window the renderer moved to, from the next frame on', () =>
  {
    // Arrange: the host starts in the main window, then is torn out into a popout.
    const main = new FakeWindow('main');
    const popout = new FakeWindow('popout');
    let host: FakeWindow = main;
    const frames: string[] = [];
    const loop = new FrameLoop(() => host, () => frames.push(host.name));
    loop.start();
    main.flush(16);

    // Act.
    host = popout;
    main.flush(33);
    popout.flush(50);

    // Assert: the frame main had already promised still ran; every frame after came from the popout.
    expect([ frames, main.pending.size, popout.pending.size ])
      .toStrictEqual([ [ 'main', 'popout', 'popout' ], 0, 1 ]);
  });

  it('cancels the pending frame on the window that promised it, and runs nothing after stopping', () =>
  {
    // Arrange.
    const main = new FakeWindow('main');
    const popout = new FakeWindow('popout');
    let host: FakeWindow = main;
    let frames = 0;
    const loop = new FrameLoop(() => host, () =>
    {
      frames += 1;
    });
    loop.start();

    // Act: the host moves before the stop, so the pending frame belongs to main.
    host = popout;
    loop.stop();
    main.flush(16);

    // Assert.
    expect([ main.cancelled, popout.cancelled, frames, loop.isRunning ])
      .toStrictEqual([ [ 1 ], [], 0, false ]);
  });

  it('asks for one frame however often it is started', () =>
  {
    // Arrange.
    const main = new FakeWindow('main');
    const loop = new FrameLoop(() => main, () => undefined);

    // Act.
    loop.start();
    loop.start();

    // Assert.
    expect(main.pending.size)
      .toBe(1);
  });

  it('pauses while no window hosts it, and picks up when started again', () =>
  {
    // Arrange.
    const main = new FakeWindow('main');
    let host: FakeWindow | null = null;
    const loop = new FrameLoop(() => host, () => undefined);

    // Act.
    loop.start();
    const pausedFrames = main.pending.size;
    host = main;
    loop.start();

    // Assert.
    expect([ pausedFrames, main.pending.size ])
      .toStrictEqual([ 0, 1 ]);
  });

  it('keeps going after a frame that throws', () =>
  {
    // Arrange.
    const main = new FakeWindow('main');
    const loop = new FrameLoop(() => main, () =>
    {
      throw new Error('a broken frame');
    });
    loop.start();

    // Act.
    const thrown = (() =>
    {
      try
      {
        main.flush(16);
        return null;
      }
      catch (error)
      {
        return (error as Error).message;
      }
    })();

    // Assert: the next frame was asked for before the broken one ran.
    expect([ thrown, main.pending.size ])
      .toStrictEqual([ 'a broken frame', 1 ]);
  });
});
