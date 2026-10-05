/**
 * The steps the number pad types, by key. The pad is laid out as a compass around 5, so each key walks the way it sits
 * from the middle, and 5 itself waits.
 */
const NUMPAD_MOVES: Readonly<Record<string, number>> = {
  Numpad1: 5,
  Numpad2: 1,
  Numpad3: 6,
  Numpad4: 2,
  Numpad5: 15,
  Numpad6: 3,
  Numpad7: 7,
  Numpad8: 4,
  Numpad9: 8,
};

/**
 * The turns the number pad types with Shift held: the four straight keys face the way they sit from the middle.
 */
const NUMPAD_TURNS: Readonly<Record<string, number>> = {
  Numpad2: 16,
  Numpad4: 17,
  Numpad6: 18,
  Numpad8: 19,
};

/**
 * Finds the step a key on the number pad types into a route: a move without Shift, a turn with it. Only the pad's own
 * keys count, never the row of digits above the letters, so typing a number anywhere else in the editor stays typing.
 * @param {string} code The key's code, as KeyboardEvent#code names it, such as "Numpad8".
 * @param {boolean} shift Whether Shift is held.
 * @returns {number | null} The step's code, or null for a key that types no step.
 */
const numpadStep = (code: string, shift: boolean): number | null =>
{
  return (shift ? NUMPAD_TURNS : NUMPAD_MOVES)[code] ?? null;
};

export { numpadStep };
