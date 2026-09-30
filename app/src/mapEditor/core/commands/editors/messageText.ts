/**
 * One piece of a message's text, as the message window reads it: plain text, a line break, or an escape code
 * with its bracketed argument when it has one.
 */
type MessageToken =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'newline' }
  | { readonly kind: 'code'; readonly code: string; readonly argument: string | null; readonly raw: string };

/**
 * The one-character escape codes: MZ's own ({@code \.} and {@code \|} waits, {@code \!} a pause, {@code \>} and
 * {@code \<} instant text, {@code \^} no wait at the end, {@code \$} the gold window, {@code \{} and
 * {@code \}} the font size) and J-Message's ({@code \*} bold, {@code \_} italics, and the {@code \~},
 * {@code \%}, {@code \=} and {@code \+} animations).
 */
const SYMBOL_CODES = '$.|^!><{}*_~%=+';

/**
 * Matches a letter code's name, as MZ reads it: every letter in a row.
 */
const LETTERS = /^[A-Za-z]+/u;

/**
 * Matches a bracketed argument straight after a code's name.
 */
const ARGUMENT = /^\[([^\]\n]*)\]/u;

/**
 * Reads one escape code starting after its backslash.
 * @param {string} rest The text after the backslash.
 * @returns {{ token: MessageToken | null, length: number }} The code (null when the backslash escapes nothing a
 * window reads) and how many characters it took after the backslash.
 */
const readCode = (rest: string): { token: MessageToken | null; length: number } =>
{
  const [ first = '' ] = rest;
  if (first !== '' && SYMBOL_CODES.includes(first))
  {
    return { token: { kind: 'code', code: first, argument: null, raw: `\\${first}` }, length: 1 };
  }

  const letters = LETTERS.exec(rest);
  if (letters === null)
  {
    return { token: null, length: 0 };
  }

  const [ name ] = letters;
  const argument = ARGUMENT.exec(rest.slice(name.length));
  const length = name.length + (argument === null ? 0 : argument[0].length);
  return {
    token: { kind: 'code', code: name.toUpperCase(), argument: argument === null ? null : argument[1], raw: `\\${rest.slice(0, length)}` },
    length,
  };
};

/**
 * Splits a message into what the window draws: text, line breaks and escape codes, read the way MZ reads them.
 * A doubled backslash is a backslash; a backslash before anything that is no code shows nothing, as in MZ.
 * @param {string} message The message, its lines joined with line breaks.
 * @returns {MessageToken[]} The pieces, with neighbouring text joined.
 */
const tokenizeMessage = (message: string): MessageToken[] =>
{
  const tokens: MessageToken[] = [];
  let text = '';
  const flush = () =>
  {
    if (text !== '')
    {
      tokens.push({ kind: 'text', text });
      text = '';
    }
  };

  let index = 0;
  while (index < message.length)
  {
    const character = message[index];
    if (character === '\n')
    {
      flush();
      tokens.push({ kind: 'newline' });
      index += 1;
    }
    else if (character === '\\' && message[index + 1] === '\\')
    {
      text += '\\';
      index += 2;
    }
    else if (character === '\\')
    {
      const { token, length } = readCode(message.slice(index + 1));
      if (token !== null)
      {
        flush();
        tokens.push(token);
      }

      index += 1 + length;
    }
    else
    {
      text += character;
      index += 1;
    }
  }

  flush();
  return tokens;
};

export { tokenizeMessage };
export type { MessageToken };
