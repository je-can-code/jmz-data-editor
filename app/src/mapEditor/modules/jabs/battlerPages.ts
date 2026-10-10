import type { RmmzEventPage, RmmzMapEvent } from '../../core/model/rmmzTypes.ts';
import { pageEnemyId } from './battlerReading.ts';

/**
 * The page of a battler event a panel shows: which page, every page of the event naming an enemy, the page a new game
 * shows the event with (-1 for none), and whether the author picked the page rather than the panel following the one a
 * new game shows.
 */
type FollowedPage = {
  readonly pageIndex: number;
  readonly battlerPages: readonly number[];
  readonly shown: number;
  readonly picked: boolean;
};

/**
 * Words when a page shows, one entry for each thing it waits for, such as "while switch 4 is on".
 */
type PageWords = (page: RmmzEventPage) => readonly string[];

/**
 * Lists the pages of an event that make it a battler: each naming an enemy as J-ABS reads it.
 * @param {RmmzMapEvent} event The event.
 * @returns {number[]} The pages, counted from 0.
 */
const battlerPagesOf = (event: RmmzMapEvent): number[] =>
{
  return event.pages.flatMap((page, index) => (pageEnemyId(page) === null ? [] : [ index ]));
};

/**
 * Picks the page a battler panel shows of an event: the page the author picked, while it still makes a battler; else
 * the page a new game shows the event with, when it makes one; else the first page that does.
 * @param {RmmzMapEvent} event The event.
 * @param {number} shown The page a new game shows it with, or -1 for none.
 * @param {number | null} picked The page the author picked, or null for none.
 * @returns {FollowedPage | null} The page, or null for an event with no battler page.
 */
const followedPage = (event: RmmzMapEvent, shown: number, picked: number | null): FollowedPage | null =>
{
  const battlerPages = battlerPagesOf(event);
  const [ first ] = battlerPages;
  if (first === undefined)
  {
    return null;
  }

  // a page picked that is the one a new game shows anyway is simply followed.
  if (picked !== null && picked !== shown && battlerPages.includes(picked))
  {
    return { pageIndex: picked, battlerPages, shown, picked: true };
  }

  return { pageIndex: battlerPages.includes(shown) ? shown : first, battlerPages, shown, picked: false };
};

/**
 * Says when a page shows, after a comma, or nothing for a page waiting for nothing.
 * @param {RmmzEventPage} page The page.
 * @param {PageWords} pageWords Words when a page shows.
 * @returns {string} Such as ", shown while switch 4 is on", or empty.
 */
const whenShown = (page: RmmzEventPage, pageWords: PageWords): string =>
{
  const words = pageWords(page);
  return words.length === 0
    ? ''
    : `, shown ${words.join(', ')}`;
};

/**
 * Says which page a new game shows an event with, for a panel showing another.
 * @param {FollowedPage} followed The page shown.
 * @returns {string} Such as "A new game shows page 1, which is no battler." or "A new game shows none of its pages."
 */
const newGameWords = (followed: FollowedPage): string =>
{
  if (followed.shown < 0)
  {
    return 'A new game shows none of its pages.';
  }

  return followed.battlerPages.includes(followed.shown)
    ? `A new game shows page ${followed.shown + 1}.`
    : `A new game shows page ${followed.shown + 1}, which is no battler.`;
};

/**
 * Says which page a battler panel shows, and why: the page a new game shows, or another, picked by the author or the
 * first battler page when the page a new game shows is none, with when that page shows. A battler of one page says
 * nothing, since there is nothing else it could show.
 * @param {RmmzMapEvent} event The event.
 * @param {FollowedPage} followed The page shown.
 * @param {PageWords} pageWords Words when a page shows.
 * @returns {string | null} The line, or null to say nothing.
 */
const followedPageNote = (event: RmmzMapEvent, followed: FollowedPage, pageWords: PageWords): string | null =>
{
  const page = event.pages[followed.pageIndex];
  const number = followed.pageIndex + 1;
  if (followed.picked === false && followed.pageIndex === followed.shown)
  {
    return event.pages.length === 1
      ? null
      : `Page ${number}, the page a new game shows.`;
  }

  return `Page ${number}${whenShown(page, pageWords)}. ${newGameWords(followed)}`;
};

export { battlerPagesOf, followedPage, followedPageNote };
export type { FollowedPage, PageWords };
