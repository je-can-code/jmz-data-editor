/**
 * A value that survives a trip through JSON unchanged: what every RMMZ data file is made of, and the only
 * kind of value a document patch may carry.
 */
type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;

/**
 * A JSON object. Reach its keys with bracket access, since they are not known ahead of time.
 */
type JsonObject = { [key: string]: JsonValue };

/**
 * Reports whether a value is a plain JSON object rather than an array, a primitive or null.
 * @param {unknown} value The value to test.
 * @returns {boolean} True when the value is a non-null, non-array object.
 */
const isJsonObject = (value: unknown): value is JsonObject =>
{
  // arrays and typed arrays are objects too, so rule them out explicitly.
  return typeof value === 'object'
    && value !== null
    && Array.isArray(value) === false
    && ArrayBuffer.isView(value) === false;
};

/**
 * Deep-copies a JSON value, so the copy can be stored or changed without reaching back into the original.
 * Documents clone every value that crosses their boundary; a history step that shared an object with the live
 * document would be rewritten by the next edit and undo to the wrong place.
 * @param {T} value The value to copy.
 * @returns {T} An independent copy.
 */
const cloneJson = <T>(value: T): T =>
{
  // primitives are immutable, so they need no copy.
  if (typeof value !== 'object' || value === null)
  {
    return value;
  }

  return structuredClone(value);
};

/**
 * Compares two arrays element by element with {@link jsonEquals}.
 * @param {ArrayLike<unknown>} left The first array.
 * @param {ArrayLike<unknown>} right The second array.
 * @returns {boolean} True when both hold equal values in the same order.
 */
const arraysEqual = (left: ArrayLike<unknown>, right: ArrayLike<unknown>): boolean =>
{
  if (left.length !== right.length)
  {
    return false;
  }

  for (let index = 0; index < left.length; index++)
  {
    if (jsonEquals(left[index], right[index]) === false)
    {
      return false;
    }
  }

  return true;
};

/**
 * Compares two objects key by key with {@link jsonEquals}, ignoring key order.
 * @param {Record<string, unknown>} left The first object.
 * @param {Record<string, unknown>} right The second object.
 * @returns {boolean} True when both hold the same keys with equal values.
 */
const objectsEqual = (left: Record<string, unknown>, right: Record<string, unknown>): boolean =>
{
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length)
  {
    return false;
  }

  // a key present on one side and absent on the other is a difference, even when the value is undefined.
  return leftKeys.every(key => Object.hasOwn(right, key) && jsonEquals(left[key], right[key]));
};

/**
 * Deep equality for JSON values, with typed arrays compared by content. Key order does not matter; the
 * presence of a key does, which is what keeps an optional field like {@code meta} honest: absent and present
 * are different states, and a save must reproduce whichever the file had.
 * @param {unknown} left The first value.
 * @param {unknown} right The second value.
 * @returns {boolean} True when both values hold the same data.
 */
const jsonEquals = (left: unknown, right: unknown): boolean =>
{
  // identical references and equal primitives; JSON has no NaN, and no -0 distinct from 0.
  if (left === right)
  {
    return true;
  }

  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null)
  {
    return false;
  }

  // plain arrays and typed arrays compare by content, in order.
  const leftIsList = Array.isArray(left) || ArrayBuffer.isView(left);
  const rightIsList = Array.isArray(right) || ArrayBuffer.isView(right);
  if (leftIsList || rightIsList)
  {
    return leftIsList && rightIsList && arraysEqual(left as ArrayLike<unknown>, right as ArrayLike<unknown>);
  }

  return objectsEqual(left as Record<string, unknown>, right as Record<string, unknown>);
};

export { cloneJson, isJsonObject, jsonEquals };
export type { JsonObject, JsonValue };
