import { describe, expect, it } from 'vitest';
import { parseEventImage, writeEventImage } from '../../../../src/mapEditor/core/eventPage/eventImage.ts';
import { parseEventMovement, writeEventMovement } from '../../../../src/mapEditor/core/eventPage/eventMovement.ts';
import { jsonEquals } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzEventPage, RmmzMap } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { listMapFiles, locateGameProject, readDataFile } from '../../../support/gameProject.ts';

/*
 * The graphic picker and the movement settings each read a page's own fields into a model and write that model
 * back out. A page nobody touches must come back holding exactly the same values it went in with, so this holds
 * both round trips against every page of every shipped map: the image's tileId, characterName, direction, pattern
 * and characterIndex, and the movement's moveType, moveSpeed, moveFrequency and moveRoute, steps, repeat,
 * skippable and wait included.
 *
 * Equality is by value, with jsonEquals, not by the exact text MZ wrote: a page with no graphic at all comes down
 * in two different key orders depending on how it was authored (a freshly blank page serialises alphabetically;
 * one that ever had a graphic chosen through the GUI keeps tileId first, whatever the author chose last), and
 * reconciled against a single key order has no real meaning to a real player or a real file.
 *
 * Common events carry no image or movement fields of their own, so only map pages are in scope here. It skips
 * when the game is not present.
 */
const project = locateGameProject();

/**
 * One event page, and where it lives, for failure messages.
 */
type LocatedPage = {
  readonly where: string;
  readonly page: RmmzEventPage;
};

/**
 * Collects every page of every event on every shipped map.
 * @param {string} root The project root.
 * @returns {LocatedPage[]} The pages.
 */
const collectPages = (root: string): LocatedPage[] =>
{
  return listMapFiles(root).flatMap(file =>
  {
    const map = readDataFile(root, file) as RmmzMap;
    return map.events.flatMap(event => (event === null
      ? []
      : event.pages.map((page, pageIndex) => ({ where: `${file} event ${event.id} page ${pageIndex + 1}`, page }))));
  });
};

describe.skipIf(project === null)('the graphic picker and the movement settings lose nothing', () =>
{
  const pages = project === null ? [] : collectPages(project);

  it('reads and writes back every page\'s image with nothing lost or changed', () =>
  {
    // Arrange: every page of every shipped map.

    // Act.
    const failures = pages
      .filter(({ page }) => jsonEquals(writeEventImage(parseEventImage(page.image)), page.image) === false)
      .map(({ where }) => where);

    // Assert.
    expect(pages.length)
      .toBeGreaterThan(0);
    expect(failures)
      .toStrictEqual([]);
  });

  it('reads and writes back every page\'s movement with nothing lost or changed, steps, repeat, skippable and wait included', () =>
  {
    // Arrange: every page of every shipped map.
    const movementOf = (page: RmmzEventPage) => ({
      moveFrequency: page.moveFrequency,
      moveRoute: page.moveRoute,
      moveSpeed: page.moveSpeed,
      moveType: page.moveType,
    });

    // Act.
    const failures = pages
      .filter(({ page }) => jsonEquals(writeEventMovement(parseEventMovement(page)), movementOf(page)) === false)
      .map(({ where }) => where);

    // Assert.
    expect(pages.length)
      .toBeGreaterThan(0);
    expect(failures)
      .toStrictEqual([]);
  });
});
