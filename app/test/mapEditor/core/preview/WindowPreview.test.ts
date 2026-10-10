import { describe, expect, it } from 'vitest';
import { GamePreview } from '../../../../src/mapEditor/core/preview/GamePreview.ts';
import { WindowPreview } from '../../../../src/mapEditor/core/preview/WindowPreview.ts';

/*
 * The preview a window shows every map at starts as a fresh save. Every change that sets anything otherwise than before
 * is heard by every listener, once; a change setting everything as it was is heard by nobody, so nothing redraws for
 * it. The same preview reads back until it changes, which is what lets React follow it. A thing of a kind a plugin
 * module adds, such as a quest, is set and cleared like a switch, its value kept as the module gave it, and going back
 * to a fresh save clears it with everything else.
 */
describe('WindowPreview', () =>
{
  it('starts as a fresh save', () =>
  {
    // Arrange: a window's preview as the services make it.
    const preview = new WindowPreview();

    // Act.
    const read = preview.preview();

    // Assert.
    expect(read)
      .toBe(GamePreview.FRESH);
  });

  it('tells every listener of each change, and stops telling one that stopped listening', () =>
  {
    // Arrange: two listeners, the second of which stops after the first change.
    const preview = new WindowPreview();
    const heard: string[] = [];
    preview.subscribe(() => heard.push(`first ${preview.preview().switchesOn().join()}`));
    const stop = preview.subscribe(() => heard.push(`second ${preview.preview().switchesOn().join()}`));

    // Act: switch 74 on, the second stops, then switch 147 on.
    preview.setSwitch(74, true);
    stop();
    preview.setSwitch(147, true);

    // Assert.
    expect(heard)
      .toStrictEqual([ 'first 74', 'second 74', 'first 74,147' ]);
  });

  it('tells nobody of a change that sets everything as it was', () =>
  {
    // Arrange: variable 74 at 99, and a listener from then.
    const preview = new WindowPreview();
    preview.setVariable(74, 99);
    const before = preview.preview();
    let heard = 0;
    preview.subscribe(() =>
    {
      heard += 1;
    });

    // Act: variable 74 at 99 again, switch 9 off, and the same preview made afresh.
    preview.setVariable(74, 99);
    preview.setSwitch(9, false);
    preview.set(GamePreview.FRESH.withVariable(74, 99));

    // Assert.
    expect([ heard, preview.preview() === before ])
      .toStrictEqual([ 0, true ]);
  });

  it('puts everything back as a fresh save holds it', () =>
  {
    // Arrange: switch 74 on and variable 74 at 99.
    const preview = new WindowPreview();
    preview.setSwitch(74, true);
    preview.setVariable(74, 99);
    let heard = 0;
    preview.subscribe(() =>
    {
      heard += 1;
    });

    // Act.
    preview.reset();

    // Assert.
    expect([ preview.preview(), heard ])
      .toStrictEqual([ GamePreview.FRESH, 1 ]);
  });

  it('sets a thing of a module\'s kind as the module gives it, telling every listener, and puts it back on undefined', () =>
  {
    // Arrange: a listener writing down what each change leaves set.
    const preview = new WindowPreview();
    const heard: unknown[] = [];
    preview.subscribe(() => heard.push(preview.preview().toJson()));

    // Act: objective 1 of a quest set, then the quest put back.
    preview.setValue('quest.states', 'cecil-001', { objectives: { 1: 'active' } });
    preview.setValue('quest.states', 'cecil-001', undefined);

    // Assert.
    expect([ heard, preview.preview() === GamePreview.FRESH ])
      .toStrictEqual([ [ { 'quest.states': { 'cecil-001': { objectives: { 1: 'active' } } } }, {} ], true ]);
  });

  it('puts a module\'s kind back as a fresh save holds it too', () =>
  {
    // Arrange: a quest set beside switch 74.
    const preview = new WindowPreview();
    preview.setSwitch(74, true);
    preview.setValue('quest.states', 'cecil-001', { state: 'completed' });

    // Act.
    preview.reset();

    // Assert.
    expect([ preview.preview() === GamePreview.FRESH, preview.preview().count('quest.states') ])
      .toStrictEqual([ true, 0 ]);
  });
});
