import { describe, expect, it } from 'vitest';
import { tokenizeMessage } from '../../../../../src/mapEditor/core/commands/editors/messageText.ts';

/*
 * The Show Text editor previews a message the way the window will draw it, so it has to read escape codes the
 * way MZ does: a backslash then either one symbol or a run of letters, with a bracketed argument when one
 * follows; a doubled backslash is a backslash, and a backslash before anything else shows nothing. J-Message's
 * own codes (bold, italics, animations, database names) and J-Message-Bubbles' \pop read the same way.
 */
describe('tokenizeMessage', () =>
{
  it('splits text, codes with and without arguments, and line breaks', () =>
  {
    // Arrange.
    const message = 'Hi \\N[1],\\. look\\I[64]!\nYou owe \\C[2]\\V[12]\\C[0]\\G.';

    // Act.
    const tokens = tokenizeMessage(message);

    // Assert.
    expect(tokens)
      .toStrictEqual([
        { kind: 'text', text: 'Hi ' },
        { kind: 'code', code: 'N', argument: '1', raw: '\\N[1]' },
        { kind: 'text', text: ',' },
        { kind: 'code', code: '.', argument: null, raw: '\\.' },
        { kind: 'text', text: ' look' },
        { kind: 'code', code: 'I', argument: '64', raw: '\\I[64]' },
        { kind: 'text', text: '!' },
        { kind: 'newline' },
        { kind: 'text', text: 'You owe ' },
        { kind: 'code', code: 'C', argument: '2', raw: '\\C[2]' },
        { kind: 'code', code: 'V', argument: '12', raw: '\\V[12]' },
        { kind: 'code', code: 'C', argument: '0', raw: '\\C[0]' },
        { kind: 'code', code: 'G', argument: null, raw: '\\G' },
        { kind: 'text', text: '.' },
      ]);
  });

  it('reads J-Message\'s and J-Message-Bubbles\' codes, names in any case', () =>
  {
    // Arrange.
    const message = '\\pop[self]\\*bold\\* \\~wave\\~ \\Item[12]\\more';

    // Act.
    const codes = tokenizeMessage(message).flatMap(token => (token.kind === 'code' ? [ [ token.code, token.argument ] ] : []));

    // Assert.
    expect(codes)
      .toStrictEqual([ [ 'POP', 'self' ], [ '*', null ], [ '*', null ], [ '~', null ], [ '~', null ], [ 'ITEM', '12' ], [ 'MORE', null ] ]);
  });

  it('reads a doubled backslash as a backslash, and a backslash before anything else as nothing', () =>
  {
    // Arrange.
    const message = 'a\\\\b \\?c \\';

    // Act.
    const tokens = tokenizeMessage(message);

    // Assert.
    expect(tokens)
      .toStrictEqual([ { kind: 'text', text: 'a\\b ?c ' } ]);
  });

  it('leaves an unclosed bracket as text after the code', () =>
  {
    // Arrange.
    const message = '\\C[2 red';

    // Act.
    const tokens = tokenizeMessage(message);

    // Assert.
    expect(tokens)
      .toStrictEqual([ { kind: 'code', code: 'C', argument: null, raw: '\\C' }, { kind: 'text', text: '[2 red' } ]);
  });

  it('reads an empty message as nothing', () =>
  {
    // Arrange: no text.

    // Act.
    const tokens = tokenizeMessage('');

    // Assert.
    expect(tokens)
      .toStrictEqual([]);
  });
});
