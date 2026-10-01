import { linesToText, textToLines, writeShowText, type ShowTextModel } from '../commands/editors/showText.ts';
import type { JsonValue } from '../model/json.ts';
import type { RmmzMapEvent } from '../model/rmmzTypes.ts';
import { isEmptyPage, readTextPage, type PageMessage } from './eventPages.ts';
import type { EventEdit, QuickField, QuickModel } from './quickFields.ts';

/**
 * The id the core registers dialogue under.
 */
const DIALOGUE_KIND_ID = 'core.dialogue';

/**
 * One message of a dialogue event, and the page it is on.
 */
type DialogueMessage = PageMessage & {
  readonly pageIndex: number;
};

/**
 * Reads an event as dialogue: every page either says something and does nothing else, or runs nothing at all, and
 * at least one page says something. A sign, or a villager with a line or two.
 * @param {RmmzMapEvent} event The event.
 * @returns {DialogueMessage[] | null} Every message in page order, or null when the event is not dialogue.
 */
const readDialogue = (event: RmmzMapEvent): DialogueMessage[] | null =>
{
  const messages: DialogueMessage[] = [];
  for (const [ pageIndex, page ] of event.pages.entries())
  {
    if (isEmptyPage(page))
    {
      continue;
    }

    const said = readTextPage(page);
    if (said === null)
    {
      return null;
    }

    messages.push(...said.map(message => ({ ...message, pageIndex })));
  }

  return messages.length > 0
    ? messages
    : null;
};

/**
 * Recognises dialogue: an event that only ever talks.
 * @param {RmmzMapEvent} event The event.
 * @returns {boolean} True for dialogue.
 */
const isDialogue = (event: RmmzMapEvent): boolean =>
{
  return readDialogue(event) !== null;
};

/**
 * Says who speaks a message, in the words the message window uses: the face and the name shown above the text.
 * @param {ShowTextModel} model The message.
 * @returns {string} Such as "face_je 2 · \N[1]", or empty when neither is set.
 */
const speakerHint = (model: ShowTextModel): string =>
{
  const face = model.faceName === ''
    ? ''
    : `${model.faceName} ${model.faceIndex + 1}`;
  return [ face, model.speakerName ].filter(part => part !== '').join(' · ');
};

/**
 * Works out the edit that gives a message new text: the Show Text and its lines replaced by the same message with
 * the new lines, so its face, window and speaker stay as they were, however many lines the text now runs to. Text
 * the message already says changes nothing: a message holding one empty line reads as an empty box, and writing
 * that box back must not take the line away.
 * @param {PageMessage} message The message, as the page holds it.
 * @param {number} pageIndex The page it is on.
 * @param {string} text The new text, lines separated by newlines.
 * @returns {EventEdit[]} The edit, or none when the text is unchanged.
 */
const messageTextEdits = (message: PageMessage, pageIndex: number, text: string): EventEdit[] =>
{
  if (text === linesToText(message.model.lines))
  {
    return [];
  }

  const written = writeShowText(message.command, message.lines, { ...message.model, lines: textToLines(text) });
  return [ {
    kind: 'splice',
    path: [ 'pages', pageIndex, 'list' ],
    index: message.index,
    deleteCount: 1 + message.lines.length,
    inserted: [ written.command, ...written.continuation ] as unknown as JsonValue[],
  } ];
};

/**
 * Builds the field for one message's text.
 * @param {PageMessage} message The message.
 * @param {number} pageIndex The page it is on.
 * @param {{ key: string, label: string, section: string, step: string }} naming What the field is called and filed under.
 * @returns {QuickField} The field.
 */
const messageField = (
  message: PageMessage,
  pageIndex: number,
  naming: { key: string; label: string; section: string; step: string },
): QuickField =>
{
  const hint = speakerHint(message.model);
  return {
    ...naming,
    control: { kind: 'text', multiline: true },
    value: linesToText(message.model.lines),
    ...(hint === '' ? {} : { hint }),
    write: value => messageTextEdits(message, pageIndex, String(value)),
  };
};

/**
 * What a dialogue event's quick panel offers: the text of every message, with who says it beside each.
 * @param {RmmzMapEvent} event The event.
 * @returns {QuickModel} The settings; none for an event that is not dialogue.
 */
const dialogueQuickModel = (event: RmmzMapEvent): QuickModel =>
{
  const messages = readDialogue(event) ?? [];
  const pages = new Set(messages.map(message => message.pageIndex));
  return {
    fields: messages.map((message, ordinal) => messageField(message, message.pageIndex, {
      key: `message.${ordinal}`,
      label: `Message ${ordinal + 1}`,
      section: pages.size > 1 ? `Page ${message.pageIndex + 1}` : '',
      step: 'Change dialogue',
    })),
    actions: [],
  };
};

export { DIALOGUE_KIND_ID, dialogueQuickModel, isDialogue, messageField, messageTextEdits, readDialogue, speakerHint };
export type { DialogueMessage };
