import { describe, expect, it } from 'vitest';
import { CORE_EVENT_KINDS } from '../../../../src/mapEditor/core/eventKinds/coreKinds.ts';
import { command, event, oreChest, page, text, transferPage } from '../../support/eventKindFixtures.ts';

/*
 * The core registers four kinds, every MZ project has them, and no event is ever two of them: each is recognised
 * by exactly one, and an event carrying a plugin's tags in its comments by none, so a plugin module's kind never
 * has to outrank a core one to claim it. Priorities run from the most specific kind down.
 */
describe('coreKinds', () =>
{
  it('lists the chest, transfer, dialogue and decor kinds, most specific first', () =>
  {
    // Arrange: nothing to set up; the list is fixed.

    // Act.
    const kinds = CORE_EVENT_KINDS.map(kind => [ kind.id, kind.title, kind.priority ]);

    // Assert.
    expect(kinds)
      .toStrictEqual([
        [ 'core.chest', 'Chest', 40 ],
        [ 'core.transfer', 'Transfer', 30 ],
        [ 'core.dialogue', 'Dialogue', 20 ],
        [ 'core.decor', 'Decor', 10 ],
      ]);
  });

  it('recognises each kind of event by exactly one kind, and a battler by none', () =>
  {
    // Arrange.
    const events = [
      oreChest(1),
      event(2, [ transferPage() ]),
      event(3, [ page(text([ 'North: Harbor' ])) ]),
      event(4, [ page([]) ]),
      event(5, [ page([ command(108, [ '<enemyId:12>' ]), command(408, [ '<level:3>' ]) ]) ]),
    ];

    // Act.
    const recognised = events.map(each => CORE_EVENT_KINDS.filter(kind => kind.detect(each)).map(kind => kind.id));

    // Assert.
    expect(recognised)
      .toStrictEqual([ [ 'core.chest' ], [ 'core.transfer' ], [ 'core.dialogue' ], [ 'core.decor' ], [] ]);
  });
});
