import type {
  EventEdit,
  QuickField,
  QuickModel,
  QuickModelSource,
  QuickOption,
  QuickPanelOptions,
  SliderControl,
} from '../../core/eventKinds/quickFields.ts';
import type { PatchPath } from '../../core/model/patches.ts';
import type { RmmzMapEvent } from '../../core/model/rmmzTypes.ts';
import {
  isHexColor,
  lightLines,
  lightsOf,
  normalizeHex,
  type LightDefaults,
  type LightEffect,
  type LightLine,
  type LightPageChoice,
} from './lightTags.ts';
import { intensityPercent, lightTagParts, withColor, withEffect, withIntensity, withRadius } from './lightTagWriter.ts';

/**
 * How a light's reach is set: typed to two places anywhere above 0 up to 99 tiles, or dragged in half tiles along a
 * track from half a tile to twelve, which holds every reach the game's lights use.
 */
const RADIUS_CONTROL: SliderControl = {
  kind: 'slider',
  min: 0.01,
  max: 99,
  places: 2,
  track: [ 0.5, 12 ],
  step: 0.5,
  unit: 'tiles',
};

/**
 * How a light's intensity is set: 0 to 100 in whole numbers, described as J-Lighting describes it, as the light's
 * shape rather than its brightness.
 */
const INTENSITY_CONTROL: SliderControl = {
  kind: 'slider',
  min: 0,
  max: 100,
  places: 0,
  track: [ 0, 100 ],
  step: 1,
  unit: '',
  ends: [ 'Soft pool', 'Even disc, hard rim' ],
  about: 'How evenly the light fills its circle: its shape, not its brightness.',
};

/**
 * The ways a light can animate, in the order the effect drop-down lists them; each one's place is its choice's value.
 */
const EFFECTS: readonly LightEffect[] = [ 'steady', 'flicker', 'pulse', 'glitch' ];

/**
 * The effect drop-down's choices.
 */
const EFFECT_OPTIONS: readonly QuickOption[] = [
  { value: 0, label: 'Steady' },
  { value: 1, label: 'Flicker' },
  { value: 2, label: 'Pulse' },
  { value: 3, label: 'Glitch' },
];

/**
 * What each effect does, as J-Lighting describes it, shown under the drop-down.
 */
const EFFECT_HINTS: Readonly<Record<LightEffect, string>> = {
  steady: 'Burns without wavering.',
  flicker: 'Gutters like a torch, never quite repeating.',
  pulse: 'Swells and fades in a steady rhythm, like a crystal humming.',
  glitch: 'Holds still, then stutters, like a failing lamp.',
};

/**
 * What a value the light leaves to the project says under its control.
 */
const DEFAULT_HINT = 'The project\'s default; this light sets none.';

/**
 * The most swatches the colour setting offers.
 */
const SWATCH_LIMIT = 8;

/**
 * Says what a colour setting shows when the light names none of its own: the project's default, because the tag names
 * no colour, or because the colour it names is no colour at all.
 * @param {string} written The colour the tag puts forward, as written, or empty when it puts forward none.
 * @returns {{ hint?: string }} The hint, or none for a light showing a colour of its own.
 */
const colorHint = (written: string): { hint?: string } =>
{
  if (written === '')
  {
    return { hint: DEFAULT_HINT };
  }

  return isHexColor(written)
    ? {}
    : { hint: `${written} is not a colour, so the project's default shows.` };
};

/**
 * Builds the four settings of one light: its reach, colour, intensity and effect, each read as the game reads the tag
 * and each written back into that one comment line, in place.
 * @param {LightLine} line The line giving the light.
 * @param {number} pageIndex The page it is on.
 * @param {number} ordinal Which of the page's lights it is, from 0; the keys use it, so several lights share their
 * settings light by light.
 * @param {boolean} several Whether the page gives more than one light, which names each by its place.
 * @param {LightDefaults} defaults What the light falls back to.
 * @returns {QuickField[]} The settings.
 */
const lightFields = (line: LightLine, pageIndex: number, ordinal: number, several: boolean, defaults: LightDefaults): QuickField[] =>
{
  const { listIndex, text, light } = line;
  const parts = lightTagParts(text);
  const key = `light.${ordinal}`;
  const section = several ? `Light ${ordinal + 1}` : '';
  const path: PatchPath = [ 'pages', pageIndex, 'list', listIndex, 'parameters', 0 ];

  /**
   * Writes the line anew, as one change to its text, unless it comes out as it was.
   * @param {string} next The line as it should read.
   * @returns {EventEdit[]} The edit, or none.
   */
  const rewrite = (next: string): EventEdit[] => (next === text ? [] : [ { kind: 'set', path, value: next } ]);

  const color = parts.color === -1 ? '' : parts.values[parts.color].text;
  return [
    {
      key: `${key}.radius`,
      label: 'Radius',
      section,
      control: RADIUS_CONTROL,
      value: light.radius,
      step: 'Change light radius',
      write: value => rewrite(withRadius(text, value as number, defaults)),
    },
    {
      key: `${key}.color`,
      label: 'Colour',
      section,
      control: { kind: 'color' },
      value: normalizeHex(light.color),
      step: 'Change light colour',
      ...colorHint(color),
      write: value => rewrite(withColor(text, value as string, defaults)),
    },
    {
      key: `${key}.intensity`,
      label: 'Intensity',
      section,
      control: INTENSITY_CONTROL,
      value: intensityPercent(light.intensity),
      step: 'Change light intensity',
      ...(parts.intensity === -1 ? { hint: DEFAULT_HINT } : {}),
      write: value => rewrite(withIntensity(text, value as number, defaults)),
    },
    {
      key: `${key}.effect`,
      label: 'Effect',
      section,
      control: { kind: 'select', options: EFFECT_OPTIONS },
      value: EFFECTS.indexOf(light.effect),
      step: 'Change light effect',
      hint: EFFECT_HINTS[light.effect],
      write: value => rewrite(withEffect(text, EFFECTS[value as number], defaults)),
    },
  ];
};

/**
 * Builds what a light's quick panel offers: the settings of every light on the page the light shows, the page the
 * rings are drawn from, chosen by the same choice the rings use, so the panel always changes the light the map shows.
 * @param {LightDefaults} defaults What the lights fall back to.
 * @param {LightPageChoice} choosePage Picks the page whose lights an event shows.
 * @returns {QuickModelSource} The kind's settings, for each event; none for an event giving no light.
 */
const lightQuickModel = (defaults: LightDefaults, choosePage: LightPageChoice): QuickModelSource =>
{
  return (event: RmmzMapEvent): QuickModel =>
  {
    const lit = choosePage(event, defaults);
    if (lit === null)
    {
      return { fields: [], actions: [] };
    }

    const lines = lightLines(lit.page, defaults);
    const several = lines.length > 1;
    return {
      fields: lines.flatMap((line, ordinal) => lightFields(line, lit.pageIndex, ordinal, several, defaults)),
      actions: [],
    };
  };
};

/**
 * Joins page numbers the way a sentence lists them.
 * @param {readonly number[]} numbers The page numbers, from 1, in order.
 * @returns {string} Such as "1 and 2", or "1, 2 and 4".
 */
const listed = (numbers: readonly number[]): string =>
{
  const head = numbers.slice(0, -1);
  const last = numbers[numbers.length - 1];
  return `${head.join(', ')} and ${last}`;
};

/**
 * Says which page the settings change, when it is not page 1: the first page with a light, for one event or several on
 * the same page, or each event's own when they differ.
 * @param {readonly number[]} pageIndexes The page each selected light shows, counted from 0.
 * @returns {string | null} The line, or null when every light is on page 1.
 */
const lightPageNote = (pageIndexes: readonly number[]): string | null =>
{
  const pages = [ ...new Set(pageIndexes) ].sort((left, right) => left - right).map(index => index + 1);
  if (pages.length === 0 || (pages.length === 1 && pages[0] === 1))
  {
    return null;
  }

  if (pages.length > 1)
  {
    return `Changes the first page with a light on each: pages ${listed(pages)}.`;
  }

  return pageIndexes.length === 1
    ? `Changes page ${pages[0]}, the first page with a light.`
    : `Changes page ${pages[0]} of each, the first page with a light.`;
};

/**
 * Lists the colours a map's lights use, most used first, ties in the order of their digits: the colour every light on
 * every page shows, the default for one naming none, as six lowercase digits.
 * @param {readonly (RmmzMapEvent | null)[]} events The map's events, with empty slots.
 * @param {LightDefaults} defaults What the lights fall back to.
 * @returns {string[]} The colours, at most {@link SWATCH_LIMIT}.
 */
const lightSwatches = (events: readonly (RmmzMapEvent | null)[], defaults: LightDefaults): string[] =>
{
  const counts = new Map<string, number>();
  events.forEach(event =>
  {
    const pages = event === null ? [] : event.pages;
    pages.flatMap(page => lightsOf(page, defaults)).forEach(light =>
    {
      const color = normalizeHex(light.color);
      counts.set(color, (counts.get(color) ?? 0) + 1);
    });
  });

  return [ ...counts ]
    .sort(([ leftColor, left ], [ rightColor, right ]) => right - left || leftColor.localeCompare(rightColor))
    .slice(0, SWATCH_LIMIT)
    .map(([ color ]) => color);
};

/**
 * Builds what a light's panel shows besides each light's settings: which page they change when it is not page 1, and
 * the colours the map's lights already use, as swatches.
 * @param {LightDefaults} defaults What the lights fall back to.
 * @param {LightPageChoice} choosePage Picks the page whose lights an event shows.
 * @returns {QuickPanelOptions} The panel's note and swatches.
 */
const lightPanelOptions = (defaults: LightDefaults, choosePage: LightPageChoice): QuickPanelOptions =>
{
  return {
    note: events => lightPageNote(events.flatMap(event =>
    {
      const lit = choosePage(event, defaults);
      return lit === null ? [] : [ lit.pageIndex ];
    })),
    swatches: events => lightSwatches(events, defaults),
  };
};

export { DEFAULT_HINT, EFFECT_HINTS, EFFECT_OPTIONS, INTENSITY_CONTROL, lightPageNote, lightPanelOptions, lightQuickModel, lightSwatches, RADIUS_CONTROL };
