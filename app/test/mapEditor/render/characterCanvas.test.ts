import { describe, expect, it, vi } from 'vitest';
import type { RmmzEventImage } from '../../../src/mapEditor/core/model/rmmzTypes.ts';
import { drawCharacterFrame } from '../../../src/mapEditor/render/characterCanvas.ts';

/*
 * The graphic picker's live preview and its sheet browser both draw one still frame of a character sheet, cropped
 * exactly where eventFrame says the engine would cut it, scaled from the engine's own tile size up to whatever
 * size the picker asks for. It draws nothing while the sheet has not loaded, and nothing at all for an image that
 * is currently showing a tile or no image, since those belong to someone else's preview, not this one's.
 */
describe('drawCharacterFrame', () =>
{
  const image = (overrides: Partial<RmmzEventImage> = {}): RmmzEventImage => ({
    tileId: 0,
    characterName: 'Actor1',
    direction: 2,
    pattern: 1,
    characterIndex: 0,
    ...overrides,
  });

  // a normal sheet, four characters across by two down, three patterns by four facings: 144 x 192 makes each
  // frame a tidy 12 x 24, so the pinned pixels below are exact rather than rounded.
  const sheet = { width: 144, height: 192 };

  it('crops the exact cell eventFrame names, scaled from the engine tile size to the size asked for', () =>
  {
    // Arrange: character 0, facing down, standing (pattern 1), drawn at twice the engine's own tile size.
    const context = { drawImage: vi.fn() };

    // Act.
    drawCharacterFrame(context, sheet as never, image(), 10, 20, 96);

    // Assert: block (0, 0), pattern column 1 of 3 so sx = 12, down is row 0 of 4 so sy = 0.
    expect(context.drawImage)
      .toHaveBeenCalledWith(sheet, 12, 0, 12, 24, 10, 20, 24, 48);
  });

  it('draws nothing once the image shows a tile instead, the near miss of a positive tileId on the same image', () =>
  {
    // Arrange.
    const context = { drawImage: vi.fn() };

    // Act.
    drawCharacterFrame(context, sheet as never, image({ tileId: 5 }), 0, 0, 48);

    // Assert.
    expect(context.drawImage)
      .not.toHaveBeenCalled();
  });

  it('draws nothing once the image shows nothing at all, the near miss of an empty sheet name instead of a tile', () =>
  {
    // Arrange.
    const context = { drawImage: vi.fn() };

    // Act.
    drawCharacterFrame(context, sheet as never, image({ characterName: '' }), 0, 0, 48);

    // Assert.
    expect(context.drawImage)
      .not.toHaveBeenCalled();
  });

  it('draws nothing while the sheet has not loaded yet', () =>
  {
    // Arrange: a character image, but no sheet to cut it from.
    const context = { drawImage: vi.fn() };

    // Act.
    drawCharacterFrame(context, null, image(), 0, 0, 48);

    // Assert.
    expect(context.drawImage)
      .not.toHaveBeenCalled();
  });
});
