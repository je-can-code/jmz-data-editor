/**
 * The cards the natural growth panel lays its parameters out in: each a title and the long ids it lists, in the
 * order the cards stack.
 *
 * Every parameter the panel's parser reads and rewrites belongs to exactly one card. A parameter left out of
 * every card would still have its tags kept on save, but nobody could see or change them from the panel.
 *
 * The rewards card only shows on the Buff+ tab, since experience, gold and SDP rewards take no other tag.
 */
const NATURAL_GROWTH_UI_CATEGORIES: { title: string; longIds: number[] }[] = [
  {
    title: 'Rewards',
    longIds: [ 31, 32, 33 ]
  },
  {
    title: 'Core Stats',
    longIds: [ 0, 1, 30, 2, 3, 4, 5, 6, 7 ]
  },
  {
    title: 'Hit/Evasion',
    longIds: [ 8, 9, 12, 13, 14 ]
  },
  {
    title: 'Recovery',
    longIds: [ 15, 16, 17, 20, 21, 34 ]
  },
  {
    title: 'Damage/Defense',
    longIds: [ 18, 19, 22, 23, 40, 24, 25, 26, 27 ]
  },
  {
    title: 'Critical',
    longIds: [ 10, 11, 28, 29 ]
  },
  {
    title: 'Steal',
    longIds: [ 35, 36, 37 ]
  },
  {
    title: 'Shield',
    longIds: [ 38, 39 ]
  },
  {
    title: 'Movement',
    longIds: [ 41 ]
  },
  {
    title: 'Gains',
    longIds: [ 42, 43, 44, 45, 46 ]
  },
];

export { NATURAL_GROWTH_UI_CATEGORIES };
