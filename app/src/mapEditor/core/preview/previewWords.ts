import { SWITCH_KIND, VARIABLE_KIND, type GamePreview, type PreviewKind } from './GamePreview.ts';

/**
 * What one kind of preview state is called, one thing and several, and what a thing set is: "switch", "switches" and
 * "on".
 */
type PreviewNouns = {
  readonly one: string;
  readonly many: string;
  readonly state: string;
};

/**
 * What the core's kinds are called. A kind a plugin module adds says what it is called beside these.
 */
const CORE_NOUNS: ReadonlyMap<PreviewKind, PreviewNouns> = new Map([
  [ SWITCH_KIND, { one: 'switch', many: 'switches', state: 'on' } ],
  [ VARIABLE_KIND, { one: 'variable', many: 'variables', state: 'set' } ],
]);

/**
 * What a preview setting nothing is called: every map shows a fresh save.
 */
const FRESH_SAVE_WORDS = 'Fresh save';

/**
 * Words how many things of one kind a preview sets, such as "2 switches on".
 * @param {number} count How many.
 * @param {PreviewNouns} nouns What the kind is called.
 * @returns {string} The words.
 */
const countWords = (count: number, nouns: PreviewNouns): string =>
{
  return `${count} ${count === 1 ? nouns.one : nouns.many} ${nouns.state}`;
};

/**
 * Words what a preview sets, as the chip beside a map's clock says it, so a preview is never on unnoticed: "Fresh save"
 * while it sets nothing, and otherwise how many of each kind it sets, switches then variables then each kind a module
 * adds, such as "2 switches on, 1 variable set". A kind nobody named is counted as more, so nothing set ever goes unsaid.
 * @param {GamePreview} preview The preview.
 * @param {ReadonlyMap<PreviewKind, PreviewNouns>} nouns What each kind is called; the core's own by default.
 * @returns {string} The words.
 */
const previewWords = (preview: GamePreview, nouns: ReadonlyMap<PreviewKind, PreviewNouns> = CORE_NOUNS): string =>
{
  if (preview.isFresh)
  {
    return FRESH_SAVE_WORDS;
  }

  // the named kinds in the order they are named, then whatever else is set, counted together.
  const named = [ ...nouns ]
    .filter(([ kind ]) => preview.count(kind) > 0)
    .map(([ kind, kindNouns ]) => countWords(preview.count(kind), kindNouns));
  const unnamed = preview.kinds()
    .filter(kind => nouns.has(kind) === false)
    .reduce((total, kind) => total + preview.count(kind), 0);
  const more = unnamed === 0 ? [] : [ `${unnamed} more set` ];
  return [ ...named, ...more ].join(', ');
};

export { CORE_NOUNS, FRESH_SAVE_WORDS, previewWords };
export type { PreviewNouns };
