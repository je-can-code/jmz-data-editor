import { describe, expect, it } from 'vitest';
import { RPG_ClassDomainModel } from '@core/domain/entities/RPG_ClassDomainModel.ts';
import RPG_Class = Rmmz.Implementations.RPG_Class;

/**
 * A class's description and icon are this editor's own additions to Classes.json: RPG Maker's editor has no
 * field for either, so a class it saved arrives without them. The model owes its callers two things for each.
 * It reads a missing one as empty- no description, and icon zero- so the Classes board always has a value to
 * edit rather than nothing. And it writes both back on every save, so the game finds exactly what the author
 * chose.
 */
describe('RPG_ClassDomainModel', () =>
{
  /**
   * Builds a class row the way RPG Maker writes one, with anything overridden on top.
   * @param {Partial<RPG_Class>} overrides The fields to set on top of the RPG Maker row.
   * @returns {RPG_Class} The class row.
   */
  const createClassRow = (overrides: Partial<RPG_Class> = {}): RPG_Class =>
  {
    return {
      id: 2,
      name: 'Brawler',
      note: '',
      expParams: [ 30, 20, 30, 30 ],
      learnings: [],
      params: [ [ 1 ], [ 0 ], [ 0 ], [ 0 ], [ 0 ], [ 0 ], [ 0 ], [ 0 ] ],
      traits: [],
      ...overrides,
    } as RPG_Class;
  };

  describe('description', () =>
  {
    it('reads a class RPG Maker saved, which has no description at all, as undescribed', () =>
    {
      // Arrange
      const row = createClassRow();

      // Act
      const model = new RPG_ClassDomainModel(row);

      // Assert
      expect(model.description)
        .toBe('');
    });

    it('carries a class\'s description through to what gets saved', () =>
    {
      // Arrange
      const row = createClassRow({ description: 'Hits first.\nAsks later.' });

      // Act
      const written = new RPG_ClassDomainModel(row)
        .toRmmz();

      // Assert
      expect(written.description)
        .toBe('Hits first.\nAsks later.');
    });

    it('saves the description an author types in', () =>
    {
      // Arrange
      const model = new RPG_ClassDomainModel(createClassRow());

      // Act
      model.description = 'Never misses breakfast.';
      const written = model.toRmmz();

      // Assert
      expect(written.description)
        .toBe('Never misses breakfast.');
    });
  });

  describe('iconIndex', () =>
  {
    it('reads a class RPG Maker saved, which has no icon at all, as having none of its own', () =>
    {
      // Arrange
      const row = createClassRow();

      // Act
      const model = new RPG_ClassDomainModel(row);

      // Assert
      expect(model.iconIndex)
        .toBe(0);
    });

    it('carries a class\'s icon through to what gets saved', () =>
    {
      // Arrange
      const row = createClassRow({ iconIndex: 96 });

      // Act
      const written = new RPG_ClassDomainModel(row)
        .toRmmz();

      // Assert
      expect(written.iconIndex)
        .toBe(96);
    });

    it('saves the icon an author picks', () =>
    {
      // Arrange
      const model = new RPG_ClassDomainModel(createClassRow());

      // Act
      model.iconIndex = 212;
      const written = model.toRmmz();

      // Assert
      expect(written.iconIndex)
        .toBe(212);
    });
  });
});
