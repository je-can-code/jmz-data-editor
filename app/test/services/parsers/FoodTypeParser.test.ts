import { describe, expect, it } from 'vitest';
import { FoodTypeParser } from '@services/parsers/FoodTypeParser.ts';
import { NoteNormalizer } from '@services/utils/NoteNormalizer.ts';

/**
 * A consumable belongs to exactly one food group. Eating it binds the battler to that group's state chain, and only
 * one chain runs at a time, so a second tag on the same item is not a second group - it is an item whose behaviour
 * depends on which tag the plugin happened to reach first.
 *
 * This therefore reads a single value and writes at most one line, replacing rather than accumulating. It also
 * matches the plugin's own pattern, which accepts letters only: a key carrying a digit would be read by the runtime
 * as a shorter key than the author wrote, binding the item to a group nobody chose.
 */
describe('FoodTypeParser', () =>
{
  describe('readFoodType', () =>
  {
    it('reads the group a consumable belongs to', () =>
    {
      // Arrange
      const note = '<food:protein>';

      // Act
      const type = FoodTypeParser.readFoodType(note);

      // Assert
      expect(type)
        .toBe('protein');
    });

    it('keeps unrelated note content out of the result', () =>
    {
      // Arrange
      const note = '<price:120>\n<food:sweet>\nsome prose';

      // Act
      const type = FoodTypeParser.readFoodType(note);

      // Assert
      expect(type)
        .toBe('sweet');
    });

    it('takes the first group when an item somehow carries two', () =>
    {
      // Arrange - the runtime stops at its first match, so reporting anything else would misrepresent the item.
      const note = '<food:carb>\n<food:dairy>';

      // Act
      const type = FoodTypeParser.readFoodType(note);

      // Assert
      expect(type)
        .toBe('carb');
    });

    it('reports nothing for an item that is not food', () =>
    {
      // Arrange
      const note = 'a perfectly ordinary potion';

      // Act
      const type = FoodTypeParser.readFoodType(note);

      // Assert
      expect(type)
        .toBe('');
    });

    it('ignores a tag sharing a line with anything else', () =>
    {
      // Arrange - the runtime scans line by line, so a crowded line is not a match for it either.
      const note = 'prose <food:fruit> more prose';

      // Act
      const type = FoodTypeParser.readFoodType(note);

      // Assert
      expect(type)
        .toBe('');
    });
  });

  describe('writeFoodType', () =>
  {
    it('writes the group onto an item that had none', () =>
    {
      // Arrange
      const note = '';

      // Act
      const written = FoodTypeParser.writeFoodType(note, 'vegetable');

      // Assert
      expect(written)
        .toBe('<food:vegetable>');
    });

    it('replaces the group rather than adding a second one', () =>
    {
      // Arrange
      const note = '<food:protein>';

      // Act
      const written = FoodTypeParser.writeFoodType(note, 'dairy');

      // Assert
      expect(written)
        .toBe('<food:dairy>');
    });

    it('leaves the rest of the note alone', () =>
    {
      // Arrange
      const note = '<price:120>\n<food:protein>\n<ingredientType:meat>';

      // Act
      const written = FoodTypeParser.writeFoodType(note, 'dairy');

      // Assert
      expect(written)
        .toContain('<price:120>');
      expect(written)
        .toContain('<ingredientType:meat>');
    });

    it('makes an item ordinary again when given no group', () =>
    {
      // Arrange
      const note = '<food:protein>\nkeep me';

      // Act
      const written = FoodTypeParser.writeFoodType(note, '');

      // Assert
      expect(NoteNormalizer.normalize(written))
        .toBe('keep me');
    });

    it('refuses a key the runtime would read as a different group', () =>
    {
      // Arrange - the plugin's pattern captures letters only, so `carb2` would bind the item to `carb`. Writing
      // nothing is honest; writing a key that silently means something else is not.
      const note = '';

      // Act
      const written = FoodTypeParser.writeFoodType(note, 'carb2');

      // Assert
      expect(written)
        .toBe('');
    });

    it('normalizes a group written in mixed case', () =>
    {
      // Arrange
      const note = '';

      // Act
      const written = FoodTypeParser.writeFoodType(note, 'Sweet');

      // Assert
      expect(written)
        .toBe('<food:sweet>');
    });
  });
});
