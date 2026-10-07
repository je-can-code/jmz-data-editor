import { describe, expect, it } from 'vitest';
import { GamePreview } from '../../../../src/mapEditor/core/preview/GamePreview.ts';
import { CORE_NOUNS, previewNouns, previewWords, type PreviewNouns } from '../../../../src/mapEditor/core/preview/previewWords.ts';

/*
 * The chip beside a map's clock says what the preview sets, so a preview is never on without the author seeing it: "Fresh
 * save" while it sets nothing, and otherwise how many of each kind it sets and what they are set to, switches first,
 * then variables, then each kind a module adds and names, one and several worded apart: "2 switches on, 1 variable
 * set, 1 quest set". A kind nobody named still counts, as more, so nothing set ever goes unsaid. What each kind is
 * called is gathered from the core's own and then the active modules', in the order they added their kinds.
 */
describe('previewWords', () =>
{
  it('says a fresh save when the preview sets nothing', () =>
  {
    // Arrange: a switch turned on and off again.
    const preview = GamePreview.FRESH.withSwitch(74, true).withSwitch(74, false);

    // Act.
    const words = previewWords(preview);

    // Assert.
    expect(words)
      .toBe('Fresh save');
  });

  it('counts the switches and the variables set, one and several worded apart, switches first', () =>
  {
    // Arrange: variable 74 set first, then switches 24 and 147; and switch 9 alone.
    const both = GamePreview.FRESH.withVariable(74, 99).withSwitch(24, true).withSwitch(147, true);
    const one = GamePreview.FRESH.withSwitch(9, true);

    // Act.
    const words = [ previewWords(both), previewWords(one), previewWords(GamePreview.FRESH.withVariable(1, 5).withVariable(2, 6)) ];

    // Assert.
    expect(words)
      .toStrictEqual([ '2 switches on, 1 variable set', '1 switch on', '2 variables set' ]);
  });

  it('counts a kind a module names after the core\'s, and one nobody named as more', () =>
  {
    // Arrange: one switch, two quests, and three of a kind nobody named.
    const preview = GamePreview.FRESH.withSwitch(9, true)
      .with('quest.states', 'A', 'done')
      .with('quest.states', 'B', 'active')
      .with('mystery.kind', 'x', 1)
      .with('mystery.kind', 'y', 2)
      .with('mystery.kind', 'z', 3);
    const nouns = new Map<string, PreviewNouns>([ ...CORE_NOUNS, [ 'quest.states', { one: 'quest', many: 'quests', state: 'moved on' } ] ]);

    // Act.
    const words = previewWords(preview, nouns);

    // Assert.
    expect(words)
      .toBe('1 switch on, 2 quests moved on, 3 more set');
  });

  it('says switches, variables and quests mixed, each counted apart, one quest and several worded apart', () =>
  {
    // Arrange: two switches, a variable and one quest; then a second quest; the quests named as their module names them.
    const nouns = previewNouns([ { id: 'quest.states', nouns: { one: 'quest', many: 'quests', state: 'set' } } ]);
    const one = GamePreview.FRESH.withSwitch(24, true)
      .with('quest.states', 'cecil-001', { state: 'completed' })
      .withVariable(74, 99)
      .withSwitch(147, true);
    const two = one.with('quest.states', 'cecil-002', { objectives: { 1: 'active' } });

    // Act.
    const words = [ previewWords(one, nouns), previewWords(two, nouns) ];

    // Assert.
    expect(words)
      .toStrictEqual([ '2 switches on, 1 variable set, 1 quest set', '2 switches on, 1 variable set, 2 quests set' ]);
  });

  describe('previewNouns', () =>
  {
    it('names the switches and the variables first, then each module\'s kind in the order the modules added them', () =>
    {
      // Arrange: two modules' kinds.
      const kinds = [
        { id: 'weather.states', nouns: { one: 'sky', many: 'skies', state: 'set' } },
        { id: 'quest.states', nouns: { one: 'quest', many: 'quests', state: 'set' } },
      ];

      // Act.
      const nouns = previewNouns(kinds);

      // Assert.
      expect([ [ ...nouns.keys() ], nouns.get('weather.states')?.many, nouns.get('switch') ])
        .toStrictEqual([ [ 'switch', 'variable', 'weather.states', 'quest.states' ], 'skies', { one: 'switch', many: 'switches', state: 'on' } ]);
    });
  });
});
