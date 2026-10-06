import { describe, expect, it } from 'vitest';
import { editQuickField, type QuickField, type QuickModel } from '../../../../src/mapEditor/core/eventKinds/quickFields.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import { cloneJson } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import {
  lightPageNote,
  lightPanelOptions,
  lightQuickModel,
  lightSwatches,
} from '../../../../src/mapEditor/modules/lighting/lightPanel.ts';
import { firstLitPage, type LightDefaults, type LightPageChoice } from '../../../../src/mapEditor/modules/lighting/lightTags.ts';
import { applyEdits, command, event, eventIn, hubWith, page, text } from '../../support/eventKindFixtures.ts';

/*
 * A single click on a light shows its quick panel, and every value it shows and writes is the game's own reading of the
 * light's tag. The panel changes the page the light's ring is drawn from, picked by the choice the rings are handed:
 * by default the first page that gives light, past a cold first page, and never a lit page after it. Each light on that
 * page gets its reach, colour, intensity and effect, under "Light 1", "Light 2" when the page gives more than one. A
 * colour or an intensity the tag leaves out shows the project's default and says so, as does a colour that is no colour.
 *
 * A change rewrites the one comment line the light is on and nothing else: every other character of that line, the
 * lines around it, a near-miss tag beside it, the rest of the page and the event's other pages stay exactly as they
 * were. Several lights selected take one change together, as one named step, while a light beside them that is not
 * selected stays as it was; and writing back a value a light already shows changes nothing, so opening the panel can
 * never change a map by itself.
 *
 * The panel says which page it changes when that is not page 1, for one light, several on one page, or several on
 * different pages, and offers as swatches the colours the map's lights already use, most used first.
 */

/**
 * The defaults the tests read with: a colour and an intensity no tag below writes, so a fallback is plain to see.
 */
const DEFAULTS: LightDefaults = { color: '#FFFFFF', intensity: 0.3 };

/**
 * The panel's settings for an event, by the first page that gives light.
 * @param {RmmzMapEvent} lit The event.
 * @returns {QuickModel} The settings.
 */
const modelOf = (lit: RmmzMapEvent): QuickModel => lightQuickModel(DEFAULTS, firstLitPage)(lit, { events: [], names: null });

/**
 * Finds one setting of a model.
 * @param {QuickModel} model The model.
 * @param {string} key The setting's key.
 * @returns {QuickField} The setting.
 */
const fieldOf = (model: QuickModel, key: string): QuickField => model.fields.find(field => field.key === key) as QuickField;

describe('lightPanel', () =>
{
  describe('lightQuickModel', () =>
  {
    it('offers a light\'s reach, colour, intensity and effect as the game reads its tag', () =>
    {
      // Arrange.
      const torch = event(1, [ page([ command(108, [ '<light:[4, #FFBB73, 40, flicker]>' ]) ]) ]);

      // Act.
      const { fields, actions } = modelOf(torch);

      // Assert.
      expect([ fields.map(field => [ field.key, field.label, field.section, field.control.kind, field.value, field.hint ?? null, field.step ]), actions ])
        .toStrictEqual([
          [
            [ 'light.0.radius', 'Radius', '', 'slider', 4, null, 'Change light radius' ],
            [ 'light.0.color', 'Colour', '', 'color', '#ffbb73', null, 'Change light colour' ],
            [ 'light.0.intensity', 'Intensity', '', 'slider', 40, null, 'Change light intensity' ],
            [ 'light.0.effect', 'Effect', '', 'select', 1, 'Gutters like a torch, never quite repeating.', 'Change light effect' ],
          ],
          [],
        ]);
    });

    it('shows the project\'s default for a colour and an intensity the tag leaves out, and says so', () =>
    {
      // Arrange: a reach alone.
      const lamp = event(1, [ page([ command(108, [ '<light:[2]>' ]) ]) ]);

      // Act.
      const { fields } = modelOf(lamp);

      // Assert.
      expect(fields.map(field => [ field.value, field.hint ]))
        .toStrictEqual([
          [ 2, undefined ],
          [ '#ffffff', 'The project\'s default; this light sets none.' ],
          [ 30, 'The project\'s default; this light sets none.' ],
          [ 0, 'Burns without wavering.' ],
        ]);
    });

    it('shows the default for a colour that is no colour, saying what was written', () =>
    {
      // Arrange: four hex digits.
      const lamp = event(1, [ page([ command(108, [ '<light:[2, #ffff]>' ]) ]) ]);

      // Act.
      const color = fieldOf(modelOf(lamp), 'light.0.color');

      // Assert.
      expect([ color.value, color.hint ])
        .toStrictEqual([ '#ffffff', '#ffff is not a colour, so the project\'s default shows.' ]);
    });

    it('names each light by its place when the page gives more than one', () =>
    {
      // Arrange: a ghost carrying a torch and a glow of its own.
      const ghost = event(1, [ page([
        command(108, [ '<hourRangePage:18-5>' ]),
        command(408, [ '<light:[4, #ffbb73, 30, flicker]>' ]),
        command(108, [ '<light:[2, #bcd9ff, 10, pulse]>' ]),
      ]) ]);

      // Act.
      const { fields } = modelOf(ghost);

      // Assert.
      expect(fields.map(field => [ field.key, field.section, field.value ]))
        .toStrictEqual([
          [ 'light.0.radius', 'Light 1', 4 ],
          [ 'light.0.color', 'Light 1', '#ffbb73' ],
          [ 'light.0.intensity', 'Light 1', 30 ],
          [ 'light.0.effect', 'Light 1', 1 ],
          [ 'light.1.radius', 'Light 2', 2 ],
          [ 'light.1.color', 'Light 2', '#bcd9ff' ],
          [ 'light.1.intensity', 'Light 2', 10 ],
          [ 'light.1.effect', 'Light 2', 2 ],
        ]);
    });

    it('offers nothing for an event giving no light', () =>
    {
      // Arrange.
      const sign = event(1, [ page(text([ 'North.' ])) ]);

      // Act.
      const model = modelOf(sign);

      // Assert.
      expect(model)
        .toStrictEqual({ fields: [], actions: [] });
    });

    it('changes the first page with a light past a cold first page, never a lit page after it', () =>
    {
      // Arrange: an unlit torch on page 1, its lit page 2, and a brighter page 3 behind another switch.
      const torch = event(1, [
        page([]),
        page([ command(108, [ '<light:[4, #ffbb73, flicker]>' ]) ]),
        page([ command(108, [ '<light:[6, #ffbb73, flicker]>' ]) ]),
      ]);
      const expected = cloneJson(torch);
      expected.pages[1].list[0].parameters[0] = '<light:[5, #ffbb73, flicker]>';

      // Act.
      const written = applyEdits(torch, fieldOf(modelOf(torch), 'light.0.radius').write(5));

      // Assert.
      expect(written)
        .toStrictEqual(expected);
    });

    it('rewrites only the value changed, leaving every other character of the comment and the page as written', () =>
    {
      // Arrange: a time-gated torch whose light sits on the comment's second line, in capitals with mixed separators,
      // beside a namesake tag, a light on the line that gives none, and a message.
      const torch = event(1, [ page([
        command(108, [ '<hourRangePage:18-5>' ]),
        command(408, [ '<LIGHT: [4,#FFBB73, 30,flicker]>' ]),
        command(108, [ '<lights:[9]>' ]),
        command(108, [ '<light:[3]> spare' ]),
        ...text([ 'The torch crackles.' ]),
      ], { trigger: 0 }) ], { name: 'torch', note: '<light:[1]>' });
      const expected = cloneJson(torch);
      expected.pages[0].list[1].parameters[0] = '<LIGHT: [4,#AABBCC, 30,flicker]>';

      // Act.
      const written = applyEdits(torch, fieldOf(modelOf(torch), 'light.0.color').write('#aabbcc'));

      // Assert.
      expect(written)
        .toStrictEqual(expected);
    });

    it('writes nothing for a value a light already shows, so opening the panel changes nothing', () =>
    {
      // Arrange: lights written every way the game ships them, and a lamp leaving everything but its reach out.
      const lights = [
        event(1, [ page([ command(108, [ '<light:[4, #ffbb73, 30, flicker]>' ]) ]) ]),
        event(2, [ page([ command(108, [ '<LIGHT: [3.5,#A8F0C8,25,pulse]>' ]) ]) ]),
        event(3, [ page([ command(108, [ '<light:[2]>' ]) ]) ]),
      ];

      // Act.
      const edits = lights.flatMap(each => modelOf(each).fields.flatMap(field => field.write(field.value)));

      // Assert.
      expect(edits)
        .toStrictEqual([]);
    });

    it('reads and changes the light on whichever page the choice handed over picks', () =>
    {
      // Arrange: a choice that picks the second page whatever the first gives.
      const second: LightPageChoice = shown => ({ page: shown.pages[1], pageIndex: 1, lights: [] });
      const lamp = event(1, [ page([ command(108, [ '<light:[4]>' ]) ]), page([ command(108, [ '<light:[1]>' ]) ]) ]);
      const model = lightQuickModel(DEFAULTS, second)(lamp, { events: [], names: null });
      const expected = cloneJson(lamp);
      expected.pages[1].list[0].parameters[0] = '<light:[2]>';

      // Act.
      const written = applyEdits(lamp, fieldOf(model, 'light.0.radius').write(2));

      // Assert.
      expect([ fieldOf(model, 'light.0.radius').value, written ])
        .toStrictEqual([ 1, expected ]);
    });

    it('gives every selected light one change as one named step, leaving a light beside them as it was', () =>
    {
      // Arrange: three torches; the third is not selected.
      const torches = [ 1, 2, 3 ].map(id => event(id, [ page([ command(108, [ '<light:[4, #ffbb73, 30, flicker]>' ]) ]) ]));
      const { hub } = hubWith(torches);
      const source = lightQuickModel(DEFAULTS, firstLitPage);

      // Act.
      const step = editQuickField(hub, 1, [ 1, 2 ], source, { events: [], names: null }, 'light.0.effect', 0);
      const lines = [ 1, 2, 3 ].map(id => eventIn(hub, id)?.pages[0].list[0].parameters[0]);
      hub.undo(mapHistoryKey(1));

      // Assert.
      expect([ step?.label, lines, [ 1, 2, 3 ].map(id => eventIn(hub, id)) ])
        .toStrictEqual([
          'Change light effect',
          [ '<light:[4, #ffbb73, 30]>', '<light:[4, #ffbb73, 30]>', '<light:[4, #ffbb73, 30, flicker]>' ],
          torches,
        ]);
    });
  });

  describe('lightPageNote', () =>
  {
    it('says nothing when every light is on page 1, or none is selected', () =>
    {
      // Arrange.
      const selections = [ [ 0 ], [ 0, 0 ], [] ];

      // Act.
      const notes = selections.map(lightPageNote);

      // Assert.
      expect(notes)
        .toStrictEqual([ null, null, null ]);
    });

    it('names the page a single light on a later page changes', () =>
    {
      // Arrange: a torch lit on page 2.
      const selection = [ 1 ];

      // Act.
      const note = lightPageNote(selection);

      // Assert.
      expect(note)
        .toBe('Changes page 2, the first page with a light.');
    });

    it('names the page several lights on the same later page change', () =>
    {
      // Arrange.
      const selection = [ 2, 2 ];

      // Act.
      const note = lightPageNote(selection);

      // Assert.
      expect(note)
        .toBe('Changes page 3 of each, the first page with a light.');
    });

    it('lists the pages lights on different pages change, in order and once each', () =>
    {
      // Arrange.
      const selection = [ 3, 0, 1, 1 ];

      // Act.
      const note = lightPageNote(selection);

      // Assert.
      expect(note)
        .toBe('Changes the first page with a light on each: pages 1, 2 and 4.');
    });
  });

  describe('lightSwatches', () =>
  {
    it('lists the colours a map\'s lights use, most used first, ties by their digits, a light naming none in the default', () =>
    {
      // Arrange: two torches in one colour written two ways, a ghost and a lamp once each, a lamp lit on its second
      // page, a sign, and an empty slot.
      const events = [
        null,
        event(1, [ page([ command(108, [ '<light:[4, #FFBB73]>' ]) ]) ]),
        event(2, [ page([ command(108, [ '<light:[4, #ffbb73]>' ]) ]) ]),
        event(3, [ page([ command(108, [ '<light:[2, #bcd9ff, pulse]>' ]) ]) ]),
        event(4, [ page([ command(108, [ '<light:[2]>' ]) ]) ]),
        event(5, [ page([]), page([ command(108, [ '<light:[3, #66ffff]>' ]) ]) ]),
        event(6, [ page(text([ 'North.' ])) ]),
      ];

      // Act.
      const swatches = lightSwatches(events, DEFAULTS);

      // Assert.
      expect(swatches)
        .toStrictEqual([ '#ffbb73', '#66ffff', '#bcd9ff', '#ffffff' ]);
    });

    it('offers at most eight', () =>
    {
      // Arrange: ten lamps, each its own colour.
      const events = Array.from({ length: 10 }, (_, index) => event(index, [ page([ command(108, [ `<light:[2, #00000${index}]>` ]) ]) ]));

      // Act.
      const swatches = lightSwatches(events, DEFAULTS);

      // Assert.
      expect(swatches)
        .toStrictEqual([ '#000000', '#000001', '#000002', '#000003', '#000004', '#000005', '#000006', '#000007' ]);
    });
  });

  describe('lightPanelOptions', () =>
  {
    it('says which page the selected lights change by the choice handed over, passing over an event giving none', () =>
    {
      // Arrange: a torch lit on its second page, picked beside a sign.
      const torch = event(1, [ page([]), page([ command(108, [ '<light:[4]>' ]) ]) ]);
      const sign = event(2, [ page(text([ 'North.' ])) ]);

      // Act.
      const note = lightPanelOptions(DEFAULTS, firstLitPage).note?.([ torch, sign ]);

      // Assert.
      expect(note)
        .toBe('Changes page 2, the first page with a light.');
    });

    it('offers the colours the map\'s lights use as swatches', () =>
    {
      // Arrange.
      const events = [ null, event(1, [ page([ command(108, [ '<light:[4, #ffbb73]>' ]) ]) ]) ];

      // Act.
      const swatches = lightPanelOptions(DEFAULTS, firstLitPage).swatches?.(events);

      // Assert.
      expect(swatches)
        .toStrictEqual([ '#ffbb73' ]);
    });
  });
});
