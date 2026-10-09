import { addExactly, clampTo, decimalPlaces, type NumberField } from './blueprintFields.ts';
import type { BlueprintLink } from './blueprintLink.ts';

/**
 * What a copy's link keeps of one of its number fields: how far the copy's value sits from its blueprint's, an offset that
 * follows every change the blueprint makes, or a value of the copy's own that it holds whatever the blueprint does, a pin.
 * A number field the link keeps nothing of sits where its blueprint's does, an offset of 0. Choices keep nothing in the
 * link: a copy's choice that differs from its blueprint's is the override, held in the copy itself.
 */
type FieldLink =
  | { readonly kind: 'offset'; readonly amount: number }
  | { readonly kind: 'pin'; readonly value: number };

/**
 * One of a link's values after the blueprint's id and its event's, read as a number field's offset or pin: the field's key
 * (see the field model's keys), and what the link keeps of it.
 */
type KeyedFieldLink = {
  readonly key: string;
  readonly link: FieldLink;
};

/**
 * The shape of each value a link keeps after the blueprint's id and its event's: a number field's key, then a plus or a
 * minus sign and the offset, or an equals sign and the value pinned, which alone may be below 0. Keys, offsets and values
 * hold only letters, digits and dots, so no value holds a comma, a bracket or an angle bracket, and every link reads back
 * through the link's own reader and writer as it was written. A link of two values, as every link placing writes, keeps
 * nothing: every number of the copy sits where its blueprint's does.
 *
 * <pre>
 * Structure:
 *  FIELD+OFFSET
 *  FIELD-OFFSET
 *  FIELD=VALUE
 *
 * Example:
 *  <blueprint:[k3x9q2mf, 2, p1.speed+2, p1.light1.radius=3.5]>
 *
 * Translation:
 *  A copy of event 2 of blueprint k3x9q2mf, whose first page moves two steps faster than the blueprint's, however the
 *  blueprint's speed changes, and whose first light reaches three and a half tiles, whatever the blueprint's reaches.
 * </pre>
 */
const FIELD_LINK = /^([a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)*)(?:([+-])(\d+(?:\.\d+)?)|=(-?\d+(?:\.\d+)?))$/u;

/**
 * The page a value's key names, such as p2 at the start of p2.speed.
 */
const PAGE_PART = /^p([1-9][0-9]*)(?=\.)/u;

/**
 * Reads one of a link's values as a number field's offset or pin.
 * @param {string} text The value, as the link holds it.
 * @returns {KeyedFieldLink | null} The field's key and what the link keeps of it, or null for a value of no shape this
 * model knows, which is kept as it is.
 */
const readFieldLink = (text: string): KeyedFieldLink | null =>
{
  const match = FIELD_LINK.exec(text);
  if (match === null)
  {
    return null;
  }

  const [ , key, sign, amount, pinned ] = match;
  if (pinned !== undefined)
  {
    return { key, link: { kind: 'pin', value: Number(pinned) } };
  }

  const size = Number(amount);
  return { key, link: { kind: 'offset', amount: sign === '-' ? -size : size } };
};

/**
 * Writes a number as a link holds it: in full, never with an exponent, to the places it is written to.
 * @param {number} value The number.
 * @returns {string} The number, such as 3.5.
 */
const amountText = (value: number): string =>
{
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(decimalPlaces(value));
};

/**
 * Writes what a link keeps of a number field as the value it holds.
 * @param {string} key The field's key.
 * @param {FieldLink} link What the link keeps of it.
 * @returns {string} The value, such as {@code p1.speed+2} or {@code p1.light1.radius=3.5}.
 * @throws {Error} When the key or the number could not be read back as written.
 */
const fieldLinkText = (key: string, link: FieldLink): string =>
{
  const text = link.kind === 'pin'
    ? `${key}=${amountText(link.value)}`
    : `${key}${link.amount < 0 ? '-' : '+'}${amountText(Math.abs(link.amount))}`;
  if (readFieldLink(text) === null)
  {
    throw new Error(`a link keeps a field by a key of letters, digits and dots and a finite number, not ${key} and ${JSON.stringify(link)}`);
  }

  return text;
};

/**
 * Reports whether what a link keeps of a number field is nothing: no value, or an offset of 0, which is how far a copy
 * sits from its blueprint when the link keeps nothing.
 * @param {FieldLink | null} link What the link keeps, or null.
 * @returns {boolean} True when the link need keep no value for it.
 */
const keepsNothing = (link: FieldLink | null): boolean =>
{
  return link === null || (link.kind === 'offset' && link.amount === 0);
};

/**
 * Reads what a copy's link keeps of each of its number fields, by the field's key. A key the link names twice reads as
 * the last, as the engine reads a tag written twice; a value of no shape this model knows is passed over.
 * @param {BlueprintLink} link The link.
 * @returns {Map<string, FieldLink>} What it keeps, by key; nothing for a link of two values.
 */
const fieldLinksOf = (link: BlueprintLink): Map<string, FieldLink> =>
{
  return new Map(link.differences.flatMap(text =>
  {
    const read = readFieldLink(text);
    return read === null ? [] : [ [ read.key, read.link ] as const ];
  }));
};

/**
 * Changes what a link keeps of some number fields, leaving every other value it holds exactly as written, in its place. A
 * field the link already keeps has its first value written over in place and any later one taken out; a field it keeps
 * nothing of has its value added at the end, in the order of the changes. Keeping nothing of a field, null or an offset of
 * 0, takes its values out.
 * @param {BlueprintLink} link The link.
 * @param {ReadonlyMap<string, FieldLink | null>} changes What to keep of each field, by its key; null for nothing.
 * @returns {BlueprintLink} The link with the changes made.
 */
const withFieldLinks = (link: BlueprintLink, changes: ReadonlyMap<string, FieldLink | null>): BlueprintLink =>
{
  const written = new Set<string>();
  const kept = link.differences.flatMap(text =>
  {
    const read = readFieldLink(text);
    if (read === null || changes.has(read.key) === false)
    {
      return [ text ];
    }

    // the field's first value takes the change in its place, and any later one goes.
    const next = changes.get(read.key) as FieldLink | null;
    if (written.has(read.key) || keepsNothing(next))
    {
      return [];
    }

    written.add(read.key);
    return [ fieldLinkText(read.key, next as FieldLink) ];
  });

  const added = [ ...changes ].flatMap(([ key, next ]) =>
  {
    const known = link.differences.some(text => readFieldLink(text)?.key === key);
    return known || keepsNothing(next) ? [] : [ fieldLinkText(key, next as FieldLink) ];
  });
  return { ...link, differences: [ ...kept, ...added ] };
};

/**
 * Moves a link's values with the pages they name, for a change that adds pages, takes them away or moves them: a value of
 * a page that moved is renamed for where it went, and one of a page that went is taken out. A value of a page the change
 * did not mention, or of no page, or of no shape this model knows, is kept exactly as written.
 * @param {BlueprintLink} link The link.
 * @param {ReadonlyMap<number, number | null>} moved Where each page went, counted from 0, by where it was; null for a page
 * that went.
 * @returns {BlueprintLink} The link with its values moved.
 */
const withPagesMoved = (link: BlueprintLink, moved: ReadonlyMap<number, number | null>): BlueprintLink =>
{
  const differences = link.differences.flatMap(text =>
  {
    const read = readFieldLink(text);
    const page = read === null ? null : PAGE_PART.exec(read.key);
    const from = page === null ? -1 : Number(page[1]) - 1;
    if (page === null || moved.has(from) === false)
    {
      return [ text ];
    }

    const to = moved.get(from) as number | null;
    return to === null
      ? []
      : [ `p${to + 1}${text.slice(page[0].length)}` ];
  });
  return { ...link, differences };
};

/**
 * Works out the value a copy's link says the copy holds of a number field, from its blueprint's value: the blueprint's
 * moved by the offset, or the pin, held to the field's range either way.
 * @param {NumberField} field The field.
 * @param {number} blueprint The blueprint's value.
 * @param {FieldLink | null} link What the link keeps of the field, or null for nothing.
 * @returns {number} The value.
 */
const valueByLink = (field: NumberField, blueprint: number, link: FieldLink | null): number =>
{
  if (link === null)
  {
    return clampTo(field, blueprint);
  }

  return link.kind === 'pin'
    ? clampTo(field, link.value)
    : clampTo(field, addExactly(blueprint, link.amount));
};

/**
 * Works out what a copy's link keeps of a number field, from what its blueprint holds and what the copy holds. While the
 * copy holds what its link says, the link stands as it is, so an offset outlives being held to the field's range: a copy 2
 * above a blueprint at the top of the range sits at the top too, and 2 above again once the blueprint comes back down. A
 * copy holding anything else was changed somewhere else, such as in MZ, and its link is read afresh from what it holds: a
 * pin pins that, and an offset becomes how far that sits from the blueprint's, nothing at all when it sits right there.
 * @param {NumberField} field The field.
 * @param {number} blueprint The blueprint's value.
 * @param {number} copy The copy's value.
 * @param {FieldLink | null} held What the link keeps of the field, or null for nothing.
 * @returns {FieldLink | null} What the link keeps of it now, or null for nothing.
 */
const currentLink = (field: NumberField, blueprint: number, copy: number, held: FieldLink | null): FieldLink | null =>
{
  if (copy === valueByLink(field, blueprint, held))
  {
    return keepsNothing(held) ? null : held;
  }

  if (held !== null && held.kind === 'pin')
  {
    return { kind: 'pin', value: copy };
  }

  const amount = addExactly(copy, -blueprint);
  return amount === 0
    ? null
    : { kind: 'offset', amount };
};

export {
  currentLink,
  FIELD_LINK,
  fieldLinksOf,
  fieldLinkText,
  keepsNothing,
  readFieldLink,
  valueByLink,
  withFieldLinks,
  withPagesMoved,
};
export type { FieldLink, KeyedFieldLink };
