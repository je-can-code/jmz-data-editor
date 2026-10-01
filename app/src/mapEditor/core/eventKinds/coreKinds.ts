import type { RmmzMapEvent } from '../model/rmmzTypes.ts';
import { CHEST_KIND_ID, chestQuickModel, isChest } from './chestKind.ts';
import { DECOR_KIND_ID, decorQuickModel, isDecor } from './decorKind.ts';
import { DIALOGUE_KIND_ID, dialogueQuickModel, isDialogue } from './dialogueKind.ts';
import type { QuickModelSource } from './quickFields.ts';
import { isTransfer, TRANSFER_KIND_ID, transferQuickModel } from './transferKind.ts';

/**
 * One of the kinds every MZ project has, whatever its plugins: how to recognise it, and what its quick panel
 * offers. The views give each one its panel when the kinds are registered.
 */
type CoreEventKind = {
  readonly id: string;
  readonly title: string;
  readonly priority: number;
  readonly detect: (event: RmmzMapEvent) => boolean;
  readonly quick: QuickModelSource;
};

/**
 * The core's kinds. No event is ever two of them: a chest gives something, a transfer moves the player and does
 * nothing that talks, dialogue only talks, and decor runs nothing at all, so the priorities only say which is the
 * most specific. None of them ever claims an event whose pages carry nothing but comments (a J-ABS battler, a
 * light), which leaves those to the plugin modules that read their tags.
 */
const CORE_EVENT_KINDS: readonly CoreEventKind[] = [
  { id: CHEST_KIND_ID, title: 'Chest', priority: 40, detect: isChest, quick: chestQuickModel },
  { id: TRANSFER_KIND_ID, title: 'Transfer', priority: 30, detect: isTransfer, quick: transferQuickModel },
  { id: DIALOGUE_KIND_ID, title: 'Dialogue', priority: 20, detect: isDialogue, quick: dialogueQuickModel },
  { id: DECOR_KIND_ID, title: 'Decor', priority: 10, detect: isDecor, quick: decorQuickModel },
];

export { CORE_EVENT_KINDS };
export type { CoreEventKind };
