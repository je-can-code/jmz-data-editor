import { describe, expect, it } from 'vitest';
import { readEventArea } from '../../../../src/mapEditor/modules/pixel/areaTags.ts';
import { command, page } from '../../support/eventKindFixtures.ts';

/*
 * A page's area is read as J-Pixelistics reads it when the page becomes active: from the comment lines J-Base offers
 * the plugin, a comment's first line and each later one, wherever it sits on the page, each one tag filling the whole
 * line. Both sizes are whole tiles of at least one, written with at most one space after the colon and around each size,
 * in any case; anything else is no area tag, and the page covers the event's own tile. A tag written twice counts as the
 * last one written. A page with no tag reads no area, which is not the same as an area of one tile by one: that is a
 * tag, and reads as one.
 */
describe('readEventArea', () =>
{
  it('reads a tag on a comment\'s first line, or on a later line of it, nested in a branch or not', () =>
  {
    // Arrange: the tag as a comment's first line, as its second line after a battler's tag, and inside a branch.
    const pages = [
      page([ command(108, [ '<areaEvent:[5, 1]>' ]), command(250, [ {} ]) ]),
      page([ command(108, [ '<enemyId:3>' ]), command(408, [ '<areaEvent:[1, 4]>' ]) ]),
      page([ command(111, [ 0, 1, 0 ]), command(108, [ '<areaEvent:[2, 2]>' ], 1), command(412) ]),
    ];

    // Act.
    const areas = pages.map(readEventArea);

    // Assert.
    expect(areas)
      .toStrictEqual([ { width: 5, height: 1 }, { width: 1, height: 4 }, { width: 2, height: 2 } ]);
  });

  it('reads the sizes however they are spaced and cased, within one space a side', () =>
  {
    // Arrange.
    const lines = [ '<areaEvent:[3,1]>', '<areaEvent: [ 12 , 1 ]>', '<AREAEVENT:[1, 20]>' ];

    // Act.
    const areas = lines.map(line => readEventArea(page([ command(108, [ line ]) ])));

    // Assert.
    expect(areas)
      .toStrictEqual([ { width: 3, height: 1 }, { width: 12, height: 1 }, { width: 1, height: 20 } ]);
  });

  it('reads an area of one tile by one as the tag it is', () =>
  {
    // Arrange.
    const single = page([ command(108, [ '<areaEvent:[1, 1]>' ]) ]);

    // Act.
    const area = readEventArea(single);

    // Assert.
    expect(area)
      .toStrictEqual({ width: 1, height: 1 });
  });

  it('keeps the last area a page writes', () =>
  {
    // Arrange: two tags, the wider written first.
    const twice = page([ command(108, [ '<areaEvent:[9, 1]>' ]), command(250, [ {} ]), command(108, [ '<areaEvent:[3, 1]>' ]) ]);

    // Act.
    const area = readEventArea(twice);

    // Assert.
    expect(area)
      .toStrictEqual({ width: 3, height: 1 });
  });

  it('reads nothing from a page with no tag, or only near misses of one', () =>
  {
    // Arrange: no comment; a size of 0; a size with a leading 0; two spaces; words beside the tag; a space before it;
    // the tag in a script rather than a comment; the tag as a Show Text line; a size with a sign.
    const pages = [
      page([ command(250, [ {} ]) ]),
      page([ command(108, [ '<areaEvent:[0, 2]>' ]) ]),
      page([ command(108, [ '<areaEvent:[05, 2]>' ]) ]),
      page([ command(108, [ '<areaEvent:[  5, 2]>' ]) ]),
      page([ command(108, [ 'exit <areaEvent:[5, 2]>' ]) ]),
      page([ command(108, [ ' <areaEvent:[5, 2]>' ]) ]),
      page([ command(355, [ '<areaEvent:[5, 2]>' ]) ]),
      page([ command(401, [ '<areaEvent:[5, 2]>' ]) ]),
      page([ command(108, [ '<areaEvent:[-5, 2]>' ]) ]),
    ];

    // Act.
    const areas = pages.map(readEventArea);

    // Assert.
    expect(areas)
      .toStrictEqual(pages.map(() => null));
  });

  it('keeps a well-formed area when a near miss is written after it', () =>
  {
    // Arrange: a real tag, then a line the plugin is never offered.
    const mixed = page([ command(108, [ '<areaEvent:[4, 1]>' ]), command(108, [ 'old: <areaEvent:[9, 1]>' ]) ]);

    // Act.
    const area = readEventArea(mixed);

    // Assert.
    expect(area)
      .toStrictEqual({ width: 4, height: 1 });
  });
});
