import type { FieldOption } from '../catalogTypes.ts';

/**
 * Builds options from pairs of value and label.
 * @param {readonly (readonly [ number | string, string ])[]} pairs The pairs.
 * @returns {FieldOption[]} The options.
 */
const options = (pairs: readonly (readonly [ number | string, string ])[]): FieldOption[] =>
{
  return pairs.map(([ value, label ]) => ({ value, label }));
};

/**
 * A switch set ON or OFF, which MZ stores as 0 for ON.
 */
const ON_OFF = options([ [ 0, 'ON' ], [ 1, 'OFF' ] ]);

/**
 * Something switched off or on, which MZ stores as 0 for off (save, menu, encounter and formation access).
 */
const DISABLE_ENABLE = options([ [ 0, 'Disable' ], [ 1, 'Enable' ] ]);

/**
 * The four self switches.
 */
const SELF_SWITCHES = options([ [ 'A', 'A' ], [ 'B', 'B' ], [ 'C', 'C' ], [ 'D', 'D' ] ]);

/**
 * Whether an amount is added or taken away.
 */
const INCREASE_DECREASE = options([ [ 0, 'Increase' ], [ 1, 'Decrease' ] ]);

/**
 * Where an amount comes from: typed in, or read from a variable.
 */
const CONSTANT_VARIABLE = options([ [ 0, 'Constant' ], [ 1, 'Variable' ] ]);

/**
 * How an actor is chosen: by name, or by the id a variable holds.
 */
const FIXED_VARIABLE = options([ [ 0, 'Fixed' ], [ 1, 'Variable' ] ]);

/**
 * How a place is given: directly, or by variables holding it.
 */
const DIRECT_VARIABLES = options([ [ 0, 'Direct' ], [ 1, 'Variables' ] ]);

/**
 * The four directions, as MZ numbers them.
 */
const DIRECTIONS = options([ [ 2, 'Down' ], [ 4, 'Left' ], [ 6, 'Right' ], [ 8, 'Up' ] ]);

/**
 * The four directions, or keeping the current one.
 */
const DIRECTIONS_OR_RETAIN = options([ [ 0, 'Retain' ], [ 2, 'Down' ], [ 4, 'Left' ], [ 6, 'Right' ], [ 8, 'Up' ] ]);

/**
 * How the screen fades around a transfer.
 */
const FADES = options([ [ 0, 'Black' ], [ 1, 'White' ], [ 2, 'None' ] ]);

/**
 * The three vehicles.
 */
const VEHICLES = options([ [ 0, 'Boat' ], [ 1, 'Ship' ], [ 2, 'Airship' ] ]);

/**
 * The balloon icons, in the order of the system sheet.
 */
const BALLOONS = options([
  [ 1, 'Exclamation' ],
  [ 2, 'Question' ],
  [ 3, 'Music Note' ],
  [ 4, 'Heart' ],
  [ 5, 'Anger' ],
  [ 6, 'Sweat' ],
  [ 7, 'Frustration' ],
  [ 8, 'Silence' ],
  [ 9, 'Light Bulb' ],
  [ 10, 'Zzz' ],
  [ 11, 'User-defined 1' ],
  [ 12, 'User-defined 2' ],
  [ 13, 'User-defined 3' ],
  [ 14, 'User-defined 4' ],
  [ 15, 'User-defined 5' ],
]);

/**
 * The weather types.
 */
const WEATHERS = options([ [ 'none', 'None' ], [ 'rain', 'Rain' ], [ 'storm', 'Storm' ], [ 'snow', 'Snow' ] ]);

/**
 * A message window's background.
 */
const MESSAGE_BACKGROUNDS = options([ [ 0, 'Window' ], [ 1, 'Dim' ], [ 2, 'Transparent' ] ]);

/**
 * Where a message window sits.
 */
const MESSAGE_POSITIONS = options([ [ 0, 'Top' ], [ 1, 'Middle' ], [ 2, 'Bottom' ] ]);

/**
 * Where a choice window sits.
 */
const CHOICE_POSITIONS = options([ [ 0, 'Left' ], [ 1, 'Middle' ], [ 2, 'Right' ] ]);

/**
 * Movement speeds, slowest first.
 */
const SPEEDS = options([
  [ 1, '1: x8 Slower' ],
  [ 2, '2: x4 Slower' ],
  [ 3, '3: x2 Slower' ],
  [ 4, '4: Normal' ],
  [ 5, '5: x2 Faster' ],
  [ 6, '6: x4 Faster' ],
]);

/**
 * The eight basic parameters, as MZ numbers them.
 */
const PARAMETERS = options([
  [ 0, 'Max HP' ],
  [ 1, 'Max MP' ],
  [ 2, 'Attack' ],
  [ 3, 'Defense' ],
  [ 4, 'M.Attack' ],
  [ 5, 'M.Defense' ],
  [ 6, 'Agility' ],
  [ 7, 'Luck' ],
]);

/**
 * Adding or removing something (a state, a party member).
 */
const ADD_REMOVE = options([ [ 0, 'Add' ], [ 1, 'Remove' ] ]);

/**
 * One enemy of the troop, or all of them.
 */
const ENEMY_TARGETS = options([
  [ -1, 'Entire Troop' ],
  [ 0, '#1' ],
  [ 1, '#2' ],
  [ 2, '#3' ],
  [ 3, '#4' ],
  [ 4, '#5' ],
  [ 5, '#6' ],
  [ 6, '#7' ],
  [ 7, '#8' ],
]);

/**
 * One enemy of the troop, by its place.
 */
const ENEMY_INDEXES = ENEMY_TARGETS.filter(option => option.value !== -1);

/**
 * One member of the party, by place.
 */
const PARTY_INDEXES = options([
  [ 0, 'Member #1' ],
  [ 1, 'Member #2' ],
  [ 2, 'Member #3' ],
  [ 3, 'Member #4' ],
  [ 4, 'Member #5' ],
  [ 5, 'Member #6' ],
  [ 6, 'Member #7' ],
  [ 7, 'Member #8' ],
]);

/**
 * How a picture is anchored at its position.
 */
const PICTURE_ORIGINS = options([ [ 0, 'Upper Left' ], [ 1, 'Center' ] ]);

/**
 * How a picture blends with what is under it.
 */
const BLEND_MODES = options([ [ 0, 'Normal' ], [ 1, 'Additive' ], [ 2, 'Multiply' ], [ 3, 'Screen' ] ]);

/**
 * How a picture's move eases.
 */
const EASINGS = options([ [ 0, 'Constant Speed' ], [ 1, 'Slow Start' ], [ 2, 'Slow End' ], [ 3, 'Slow Start and End' ] ]);

/**
 * The pad buttons a conditional branch can test, by the names MZ gives them.
 */
const BUTTONS = options([
  [ 'ok', 'OK' ],
  [ 'cancel', 'Cancel' ],
  [ 'shift', 'Shift' ],
  [ 'down', 'Down' ],
  [ 'left', 'Left' ],
  [ 'right', 'Right' ],
  [ 'up', 'Up' ],
  [ 'pageup', 'Pageup' ],
  [ 'pagedown', 'Pagedown' ],
]);

export {
  ADD_REMOVE,
  BALLOONS,
  BLEND_MODES,
  BUTTONS,
  CHOICE_POSITIONS,
  CONSTANT_VARIABLE,
  DIRECT_VARIABLES,
  DIRECTIONS,
  DIRECTIONS_OR_RETAIN,
  DISABLE_ENABLE,
  EASINGS,
  ENEMY_INDEXES,
  ENEMY_TARGETS,
  FADES,
  FIXED_VARIABLE,
  INCREASE_DECREASE,
  MESSAGE_BACKGROUNDS,
  MESSAGE_POSITIONS,
  ON_OFF,
  options,
  PARAMETERS,
  PARTY_INDEXES,
  PICTURE_ORIGINS,
  SELF_SWITCHES,
  SPEEDS,
  VEHICLES,
  WEATHERS,
};
