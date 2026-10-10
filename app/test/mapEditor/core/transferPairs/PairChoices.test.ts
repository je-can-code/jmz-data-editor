import { describe, expect, it } from 'vitest';
import { DEFAULT_PAIR_CHOICES, PairChoiceMemory } from '../../../../src/mapEditor/core/transferPairs/PairChoices.ts';

/*
 * The door's picture and the two sounds start where Jeremy asked, the door's picture as the project's doors use most, the
 * creak as Open1 and the sound of passing through as none, and then each remembers the author's last choice for as long as
 * the window is open: "you just chose this move sound so now this is the default till you close the map editor". A choice
 * leaves the others as they were, a window opened afresh starts from the defaults again, and whoever listens hears each
 * choice, with the same object handed back between choices so React redraws only when something was chosen.
 */
describe('PairChoiceMemory', () =>
{
  it('starts from the picture the doors use most, Open1 as the creak, and no sound of passing through', () =>
  {
    // Arrange: a window opened afresh.
    const memory = new PairChoiceMemory();

    // Act.
    const choices = memory.current();

    // Assert.
    expect(choices)
      .toStrictEqual({ doorLook: null, doorSound: 'Open1', movementSound: '' });
  });

  it('remembers a choice as what the next transfer starts with, leaving the others as they were', () =>
  {
    // Arrange: a sound of passing through chosen, then a door picture.
    const memory = new PairChoiceMemory();
    const look = { characterName: '!doors', characterIndex: 2, direction: 2, pattern: 1 };

    // Act.
    memory.remember({ movementSound: 'Move1' });
    memory.remember({ doorLook: look });

    // Assert.
    expect(memory.current())
      .toStrictEqual({ doorLook: look, doorSound: 'Open1', movementSound: 'Move1' });
  });

  it('starts a window opened afresh from the defaults, whatever another window chose', () =>
  {
    // Arrange: one window's choice.
    const first = new PairChoiceMemory();
    first.remember({ doorSound: 'Door2' });

    // Act.
    const fresh = new PairChoiceMemory();

    // Assert.
    expect([ first.current().doorSound, fresh.current() ])
      .toStrictEqual([ 'Door2', DEFAULT_PAIR_CHOICES ]);
  });

  it('tells whoever listens of each choice, hands back the same choices between them, and stops telling once asked', () =>
  {
    // Arrange.
    const memory = new PairChoiceMemory();
    let heard = 0;
    const stop = memory.subscribe(() =>
    {
      heard += 1;
    });
    const before = memory.current();

    // Act.
    const unchanged = memory.current();
    memory.remember({ doorSound: '' });
    stop();
    memory.remember({ doorSound: 'Open1' });

    // Assert.
    expect([ unchanged === before, heard, memory.current() === before ])
      .toStrictEqual([ true, 1, false ]);
  });
});
