import { describe, expect, it } from 'vitest';
import { GamePreview } from '../../../../src/mapEditor/core/preview/GamePreview.ts';
import { CORE_NOUNS, previewWords, type PreviewNouns } from '../../../../src/mapEditor/core/preview/previewWords.ts';

/*
 * The chip beside a map's clock says what the preview sets, so a preview is never on without the author seeing it: "Fresh
 * save" while it sets nothing, and otherwise how many of each kind it sets and what they are set to, switches first,
 * then variables, then each kind a module adds and names, one and several worded apart: "2 switches on, 1 variable
 * set". A kind nobody named still counts, as more, so nothing set ever goes unsaid.
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
});
