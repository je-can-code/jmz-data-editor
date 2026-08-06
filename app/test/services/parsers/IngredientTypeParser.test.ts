import { describe, expect, it } from 'vitest';
import { IngredientTypeParser } from '@services/parsers/IngredientTypeParser.ts';
import { NoteNormalizer } from '@services/utils/NoteNormalizer.ts';

/**
 * Ingredient types decide which recipe slots an entry can fill, and the matching rule is unforgiving in one
 * direction: a slot accepts an entry only when the entry carries every type the slot asks for. Extra types never
 * disqualify anything, so the vocabulary stacks freely.
 *
 * That makes silent loss the failure worth guarding. A key that reaches the note in a shape the plugin's pattern
 * cannot read - a space, a hyphen, an empty string - does not raise anything anywhere. The slot simply never matches,
 * and the author is left staring at a recipe that refuses an ingredient they can see in their inventory. So the
 * writer refuses to emit a key it knows would be unreadable, rather than writing it and hoping.
 */
describe('IngredientTypeParser', () =>
{
  describe('readIngredientTypes', () =>
  {
    it('reads every type an entry declares, in the order written', () =>
    {
      // Arrange
      const note = '<ingredientType:protein>\n<ingredientType:meat>\n<ingredientType:flank>';

      // Act
      const types = IngredientTypeParser.readIngredientTypes(note);

      // Assert
      expect(types)
        .toEqual([ 'protein', 'meat', 'flank' ]);
    });

    it('keeps unrelated note content out of the result', () =>
    {
      // Arrange
      const note = '<ingredientType:gel>\n<price:400>\nsome prose';

      // Act
      const types = IngredientTypeParser.readIngredientTypes(note);

      // Assert
      expect(types)
        .toEqual([ 'gel' ]);
    });

    it('treats two spellings of one key as the same type', () =>
    {
      // Arrange - the plugin matches case-insensitively, so reporting both would offer the author a false choice.
      const note = '<ingredientType:Protein>\n<ingredientType:protein>';

      // Act
      const types = IngredientTypeParser.readIngredientTypes(note);

      // Assert
      expect(types)
        .toEqual([ 'protein' ]);
    });

    it('ignores a tag sharing a line with anything else', () =>
    {
      // Arrange - the plugin scans line by line, so a crowded line is not a match for it either.
      const note = 'prose <ingredientType:meat> more prose';

      // Act
      const types = IngredientTypeParser.readIngredientTypes(note);

      // Assert
      expect(types)
        .toEqual([]);
    });

    it('reports nothing for an entry that is not an ingredient', () =>
    {
      // Arrange
      const note = 'just a normal item';

      // Act
      const types = IngredientTypeParser.readIngredientTypes(note);

      // Assert
      expect(types)
        .toEqual([]);
    });
  });

  describe('writeIngredientTypes', () =>
  {
    it('writes one line per type', () =>
    {
      // Arrange
      const note = '';

      // Act
      const written = IngredientTypeParser.writeIngredientTypes(note, [ 'protein', 'meat' ]);

      // Assert
      expect(written)
        .toBe('<ingredientType:protein>\n<ingredientType:meat>');
    });

    it('replaces the types that were there before', () =>
    {
      // Arrange
      const note = '<ingredientType:carb>\n<ingredientType:grain>';

      // Act
      const written = IngredientTypeParser.writeIngredientTypes(note, [ 'fruit' ]);

      // Assert
      expect(written)
        .toBe('<ingredientType:fruit>');
    });

    it('leaves the rest of the note alone', () =>
    {
      // Arrange - notes carry tags from a dozen other plugins, and rewriting one must not disturb the others.
      const note = '<price:400>\n<ingredientType:carb>\n<sdp:something>';

      // Act
      const written = IngredientTypeParser.writeIngredientTypes(note, [ 'fruit' ]);

      // Assert
      expect(written)
        .toContain('<price:400>');
      expect(written)
        .toContain('<sdp:something>');
    });

    it('clears every type when given none', () =>
    {
      // Arrange
      const note = '<ingredientType:carb>\nkeep me';

      // Act
      const written = IngredientTypeParser.writeIngredientTypes(note, []);

      // Assert
      expect(NoteNormalizer.normalize(written))
        .toBe('keep me');
    });

    it('writes a repeated key only once', () =>
    {
      // Arrange
      const note = '';

      // Act
      const written = IngredientTypeParser.writeIngredientTypes(note, [ 'meat', 'meat' ]);

      // Assert
      expect(written)
        .toBe('<ingredientType:meat>');
    });

    it('refuses a key the tag could never express', () =>
    {
      // Arrange - the pattern captures word characters only, so a spaced or hyphenated key would be written and then
      // never matched by anything. Dropping it is louder than a tag that quietly does nothing.
      const note = '';

      // Act
      const written = IngredientTypeParser.writeIngredientTypes(note, [ 'meat - tail', 'leaf salad', 'gel' ]);

      // Assert
      expect(written)
        .toBe('<ingredientType:gel>');
    });

    it('normalizes a key written in mixed case', () =>
    {
      // Arrange
      const note = '';

      // Act
      const written = IngredientTypeParser.writeIngredientTypes(note, [ 'Protein' ]);

      // Assert
      expect(written)
        .toBe('<ingredientType:protein>');
    });
  });
});
