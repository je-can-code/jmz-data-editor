/**
 * Reads a whole number as typed into a box: a variable's preview value, or a list's maximum. Text that is not one yet,
 * such as an empty box or a lone minus sign on the way to a negative number, reads as nothing, so the box can be typed
 * into freely without the value jumping about.
 * @param {string} text What the box holds.
 * @returns {number | null} The number, or null while the text is no whole number JavaScript holds exactly.
 */
const readWholeNumber = (text: string): number | null =>
{
  const trimmed = text.trim();
  if (/^-?\d+$/u.test(trimmed) === false)
  {
    return null;
  }

  const value = Number(trimmed);
  return Number.isSafeInteger(value)
    ? value
    : null;
};

export { readWholeNumber };
