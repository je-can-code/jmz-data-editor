import { describe, expect, it } from 'vitest';
import { UnlockableForActorsParser } from '@services/parsers/UnlockableForActorsParser.ts';

/**
 * The actors a class is set aside for live in its note, and J-Classes reads them with its own expression.
 * This parser owes the Classes board two things. It reads exactly the actors the game would, merging every
 * tag the way the game does, so the board never shows a list the game disagrees with. And it writes the list
 * back as one tag without disturbing anything else in the note, including removing the tag entirely once no
 * actors are left, which is what opens the class to anyone again.
 */
describe('UnlockableForActorsParser', () =>
{
  describe('read', () =>
  {
    it('reads nobody from a note with no tag, which is a class open to anyone', () =>
    {
      // Arrange
      const note = '<unslottedSkills:[901]>\n<foo>';

      // Act
      const actorIds = UnlockableForActorsParser.read(note);

      // Assert
      expect(actorIds)
        .toEqual([]);
    });

    it('reads the actors a single tag names, with or without the space after the colon', () =>
    {
      // Arrange
      const note = '<unlockableForActors:[1, 3]>';
      const spacedNote = '<unlockableForActors: [2]>';

      // Act
      const actorIds = UnlockableForActorsParser.read(note);
      const spacedActorIds = UnlockableForActorsParser.read(spacedNote);

      // Assert
      expect(actorIds)
        .toEqual([ 1, 3 ]);
      expect(spacedActorIds)
        .toEqual([ 2 ]);
    });

    it('merges every tag on the note, listing each actor once', () =>
    {
      // Arrange
      const note = '<unlockableForActors:[1, 2]>\nkeep\n<unlockableForActors:[2, 4]>';

      // Act
      const actorIds = UnlockableForActorsParser.read(note);

      // Assert
      expect(actorIds)
        .toEqual([ 1, 2, 4 ]);
    });
  });

  describe('write', () =>
  {
    it('writes the actors as a single tag, replacing every tag already there and keeping the rest', () =>
    {
      // Arrange
      const note = '<unlockableForActors:[1]>\nkeep\n<unlockableForActors:[5]>';

      // Act
      const written = UnlockableForActorsParser.write(note, [ 2, 3 ]);

      // Assert
      expect(written)
        .toBe('keep\n<unlockableForActors:[2,3]>');
    });

    it('writes no tag at all once no actors are left, opening the class to anyone', () =>
    {
      // Arrange
      const note = '<unlockableForActors:[1]>\nkeep';

      // Act
      const written = UnlockableForActorsParser.write(note, []);

      // Assert
      expect(written)
        .toBe('keep');
    });
  });
});
