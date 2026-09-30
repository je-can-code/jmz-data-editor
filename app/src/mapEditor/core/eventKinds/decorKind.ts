import type { RmmzEventPage, RmmzMapEvent } from '../model/rmmzTypes.ts';
import { makeChestEdits } from './chestKind.ts';
import { isEmptyPage } from './eventPages.ts';
import { pictureFields, PRIORITY_OPTIONS, TRIGGER_OPTIONS } from './pageFields.ts';
import type { QuickAction, QuickContext, QuickField, QuickModel } from './quickFields.ts';

/**
 * The id the core registers decor under.
 */
const DECOR_KIND_ID = 'core.decor';

/**
 * Recognises decor: an event that runs nothing on any page, such as a lamp, a waterfall, a butterfly or a marker.
 * A page with even a comment on it is left alone, since comments are how plugins tag their events (a J-ABS
 * battler, a light), and those belong to the kinds that read the tags.
 * @param {RmmzMapEvent} event The event.
 * @returns {boolean} True for decor.
 */
const isDecor = (event: RmmzMapEvent): boolean =>
{
  return event.pages.length > 0 && event.pages.every(isEmptyPage);
};

/**
 * Builds one page's settings: its picture, its priority and its trigger.
 * @param {RmmzEventPage} page The page.
 * @param {number} pageIndex The page's index.
 * @param {string} section The heading its settings sit under.
 * @returns {QuickField[]} The settings.
 */
const decorPageFields = (page: RmmzEventPage, pageIndex: number, section: string): QuickField[] =>
{
  const key = `page.${pageIndex}`;
  return [
    ...pictureFields(page, pageIndex, { key, label: '', section, step: 'Change graphic' }),
    {
      key: `${key}.priority`,
      label: 'Priority',
      section,
      control: { kind: 'select', options: PRIORITY_OPTIONS },
      value: page.priorityType,
      step: 'Change priority',
      write: value => [ { kind: 'set', path: [ 'pages', pageIndex, 'priorityType' ], value } ],
    },
    {
      key: `${key}.trigger`,
      label: 'Trigger',
      section,
      control: { kind: 'select', options: TRIGGER_OPTIONS },
      value: page.trigger,
      step: 'Change trigger',
      write: value => [ { kind: 'set', path: [ 'pages', pageIndex, 'trigger' ], value } ],
    },
  ];
};

/**
 * What decor's quick panel offers: each page's picture, facing, frame, priority and trigger, and, for a one-page
 * event, making it a chest. A chest graphic placed first and then made a chest keeps that graphic as its closed
 * look.
 * @param {RmmzMapEvent} event The event.
 * @param {QuickContext} context The map's events and the project's names.
 * @returns {QuickModel} The settings and actions; none for an event that is not decor.
 */
const decorQuickModel = (event: RmmzMapEvent, context: QuickContext): QuickModel =>
{
  if (isDecor(event) === false)
  {
    return { fields: [], actions: [] };
  }

  const several = event.pages.length > 1;
  const fields = event.pages.flatMap((page, pageIndex) => decorPageFields(page, pageIndex, several ? `Page ${pageIndex + 1}` : ''));
  const actions: QuickAction[] = several ? [] : [ {
    key: 'make-chest',
    label: 'Make it a chest',
    section: '',
    step: 'Make a chest',
    run: () => makeChestEdits(event, context),
  } ];

  return { fields, actions };
};

export { DECOR_KIND_ID, decorQuickModel, isDecor };
