import type { RmmzEventPage } from '../model/rmmzTypes.ts';
import { graphicEdits, graphicValue, type QuickField, type QuickOption } from './quickFields.ts';

/**
 * The four ways a page's picture can face, in the words the panel shows.
 */
const FACING_OPTIONS: readonly QuickOption[] = [
  { value: 2, label: 'Down' },
  { value: 4, label: 'Left' },
  { value: 6, label: 'Right' },
  { value: 8, label: 'Up' },
];

/**
 * The three frames across a character sheet's row, left to right.
 */
const FRAME_OPTIONS: readonly QuickOption[] = [
  { value: 0, label: 'Frame 1' },
  { value: 1, label: 'Frame 2' },
  { value: 2, label: 'Frame 3' },
];

/**
 * Where a page draws and collides, relative to characters.
 */
const PRIORITY_OPTIONS: readonly QuickOption[] = [
  { value: 0, label: 'Below characters' },
  { value: 1, label: 'Same as characters' },
  { value: 2, label: 'Above characters' },
];

/**
 * What starts a page running.
 */
const TRIGGER_OPTIONS: readonly QuickOption[] = [
  { value: 0, label: 'Action button' },
  { value: 1, label: 'Player touch' },
  { value: 2, label: 'Event touch' },
  { value: 3, label: 'Autorun' },
  { value: 4, label: 'Parallel' },
];

/**
 * How a group of picture fields is named and filed.
 */
type PictureNaming = {
  /**
   * Starts every key, such as {@code page.0} or {@code look.closed}.
   */
  readonly key: string;

  /**
   * Starts every label, such as "Closed", or empty for plain labels.
   */
  readonly label: string;

  /**
   * The heading the fields sit under.
   */
  readonly section: string;

  /**
   * What the history panel calls a change to any of them.
   */
  readonly step: string;
};

/**
 * Joins a label's prefix and its own words: "Closed facing", or plain "Facing" without a prefix.
 * @param {string} prefix The prefix, or empty.
 * @param {string} words The field's own words.
 * @returns {string} The label.
 */
const labelled = (prefix: string, words: string): string =>
{
  return prefix === ''
    ? words
    : `${prefix} ${words.toLowerCase()}`;
};

/**
 * Builds the fields of one page's picture: the sheet and character (or tile), the way it faces, and the frame.
 * Facing and frame are fields of their own, so torches sharing a sheet can be picked together while each keeps its
 * own facing.
 * @param {RmmzEventPage} page The page.
 * @param {number} pageIndex The page's index in its event.
 * @param {PictureNaming} naming How the fields are named and filed.
 * @returns {QuickField[]} The fields.
 */
const pictureFields = (page: RmmzEventPage, pageIndex: number, naming: PictureNaming): QuickField[] =>
{
  const { key, label, section, step } = naming;
  const { image } = page;
  return [
    {
      key: `${key}.graphic`,
      label: label === '' ? 'Graphic' : label,
      section,
      control: { kind: 'graphic' },
      value: graphicValue(image),
      step,
      preview: image,
      write: value => graphicEdits(pageIndex, value as ReturnType<typeof graphicValue>),
    },
    {
      key: `${key}.direction`,
      label: labelled(label, 'Facing'),
      section,
      control: { kind: 'select', options: FACING_OPTIONS },
      value: image.direction,
      step,
      write: value => [ { kind: 'set', path: [ 'pages', pageIndex, 'image', 'direction' ], value } ],
    },
    {
      key: `${key}.pattern`,
      label: labelled(label, 'Frame'),
      section,
      control: { kind: 'select', options: FRAME_OPTIONS },
      value: image.pattern,
      step,
      write: value => [ { kind: 'set', path: [ 'pages', pageIndex, 'image', 'pattern' ], value } ],
    },
  ];
};

export { FACING_OPTIONS, FRAME_OPTIONS, pictureFields, PRIORITY_OPTIONS, TRIGGER_OPTIONS };
export type { PictureNaming };
