import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TYPING_PAUSE_MS, TypingBurst } from '../../../../src/mapEditor/views/commandEditors/TypingBurst.ts';

/*
 * A burst gathers the keys an author types into one hand-on, which the command editors turn into one step in history.
 * It owes them exactly one hand-on per burst, carrying the last value typed, at the moment the burst ends: when the
 * typing pauses long enough, or at once when the box is left. A pause shorter than that keeps the burst going, so the
 * gaps between keys never split a word into steps; and a value dropped, because a change from elsewhere replaced it, is
 * never handed on late, where it would overwrite an undo.
 */
describe('TypingBurst', () =>
{
  beforeEach(() =>
  {
    vi.useFakeTimers();
  });

  afterEach(() =>
  {
    vi.useRealTimers();
  });

  /**
   * A burst over text, recording every value it hands on.
   * @returns {{ burst: TypingBurst<string>, handed: string[] }} The burst and what it handed on.
   */
  const buildBurst = () =>
  {
    const handed: string[] = [];
    const burst = new TypingBurst<string>(value => handed.push(value));
    return { burst, handed };
  };

  it('hands on the last value typed once the typing pauses, and only once', () =>
  {
    // Arrange.
    const { burst, handed } = buildBurst();

    // Act: four keys, each well inside the pause of the one before.
    [ 'Hello ', 'Hello H', 'Hello Hi', 'Hello Hi!' ].forEach(text =>
    {
      burst.type(text);
      vi.advanceTimersByTime(TYPING_PAUSE_MS / 4);
    });
    const beforeThePause = [ ...handed ];
    vi.advanceTimersByTime(TYPING_PAUSE_MS);

    // Assert.
    expect([ beforeThePause, handed, burst.typing ])
      .toStrictEqual([ [], [ 'Hello Hi!' ], false ]);
  });

  it('keeps one burst going across gaps shorter than the pause', () =>
  {
    // Arrange.
    const { burst, handed } = buildBurst();

    // Act: each key lands just before the last one's pause would have ended the burst.
    burst.type('a');
    vi.advanceTimersByTime(TYPING_PAUSE_MS - 1);
    burst.type('ab');
    vi.advanceTimersByTime(TYPING_PAUSE_MS - 1);
    const stillTyping = burst.typing;
    vi.advanceTimersByTime(1);

    // Assert.
    expect([ stillTyping, handed ])
      .toStrictEqual([ true, [ 'ab' ] ]);
  });

  it('starts a new burst after a pause, so each lands on its own', () =>
  {
    // Arrange.
    const { burst, handed } = buildBurst();

    // Act.
    burst.type('Hello Hi');
    vi.advanceTimersByTime(TYPING_PAUSE_MS);
    burst.type('Hello Hi!');
    vi.advanceTimersByTime(TYPING_PAUSE_MS);

    // Assert.
    expect(handed)
      .toStrictEqual([ 'Hello Hi', 'Hello Hi!' ]);
  });

  it('hands on at once when the box is left, and never again when the pause would have ended', () =>
  {
    // Arrange.
    const { burst, handed } = buildBurst();
    burst.type('Hello Hi');

    // Act.
    burst.finish();
    const onLeaving = [ ...handed ];
    vi.advanceTimersByTime(TYPING_PAUSE_MS);

    // Assert.
    expect([ onLeaving, handed ])
      .toStrictEqual([ [ 'Hello Hi' ], [ 'Hello Hi' ] ]);
  });

  it('hands nothing on when the box is left with nothing typed', () =>
  {
    // Arrange: a burst typed and already handed on, so nothing is held.
    const { burst, handed } = buildBurst();
    burst.type('Hello');
    burst.finish();

    // Act.
    burst.finish();

    // Assert: the one hand-on, from the first leaving.
    expect(handed)
      .toStrictEqual([ 'Hello' ]);
  });

  it('never hands on a value dropped for a change from elsewhere', () =>
  {
    // Arrange.
    const { burst, handed } = buildBurst();
    burst.type('Hello Hi');

    // Act.
    burst.drop();
    vi.advanceTimersByTime(TYPING_PAUSE_MS);
    burst.finish();

    // Assert.
    expect([ handed, burst.typing ])
      .toStrictEqual([ [], false ]);
  });
});
