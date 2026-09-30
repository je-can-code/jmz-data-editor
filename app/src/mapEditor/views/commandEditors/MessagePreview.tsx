import React, { useEffect, useMemo, useState } from 'react';
import { Box, Chip } from '@mui/material';
import { tokenizeMessage, type MessageToken } from '../../core/commands/editors/messageText.ts';
import { useEditorEnvironment } from './editorEnvironment.tsx';

/**
 * The text colours of MZ's default window skin, for when the project's own cannot be read.
 */
const DEFAULT_TEXT_COLORS = [
  '#ffffff', '#20a0d6', '#ff784c', '#66cc40', '#99ccff', '#ccc0ff', '#ffffa0', '#808080',
  '#c0c0c0', '#2080cc', '#ff3810', '#00a010', '#3e9ade', '#a098ff', '#ffcc20', '#000000',
  '#84aaff', '#ffff40', '#ff2020', '#202040', '#e08040', '#f0c040', '#4080c0', '#40c0f0',
  '#80ff80', '#c08080', '#8080ff', '#ff80ff', '#00a040', '#00e060', '#a060e0', '#c080ff',
];

/**
 * The size MZ draws message text at, which the font size codes step from.
 */
const BASE_FONT_SIZE = 26;

/**
 * The size an icon is drawn at in the preview, and its size on the icon sheet.
 */
const ICON_SIZE = 20;
const SHEET_ICON_SIZE = 32;

/**
 * What the timing codes do, for their markers' tooltips.
 */
const TIMING_CODES: Readonly<Record<string, string>> = {
  '.': 'Wait a quarter second',
  '|': 'Wait a second',
  '!': 'Wait for a button',
  '>': 'Show the rest of the line at once',
  '<': 'Stop showing at once',
  '^': 'Close without waiting',
  '$': 'Open the gold window',
};

/**
 * What the database codes name, by code.
 */
const NAMED_CODES: Readonly<Record<string, string>> = {
  V: 'Variable',
  N: 'Actor',
  P: 'Party member',
  ITEM: 'Item',
  WEAPON: 'Weapon',
  ARMOR: 'Armor',
  SKILL: 'Skill',
  STATE: 'State',
  ENEMY: 'Enemy',
  ELEMENT: 'Element',
  EQUIPTYPE: 'Equip type',
  WEAPONTYPE: 'Weapon type',
  ARMORTYPE: 'Armor type',
  SKILLTYPE: 'Skill type',
  SDP: 'Panel',
  QUEST: 'Quest',
  PARAM: 'Parameter',
  POP: 'Bubble over',
};

/**
 * Reads the project's text colours from its window skin, where MZ reads them: a grid of 32 swatches below the
 * frame. Falls back to MZ's default colours until it has, or when the image cannot be read.
 * @returns {readonly string[]} The 32 text colours.
 */
const useTextColors = (): readonly string[] =>
{
  const { api } = useEditorEnvironment();
  const [ colors, setColors ] = useState<readonly string[]>(DEFAULT_TEXT_COLORS);

  useEffect(() =>
  {
    if (api === null || typeof document === 'undefined')
    {
      return undefined;
    }

    let current = true;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () =>
    {
      try
      {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context?.drawImage(image, 0, 0);
        const sampled = DEFAULT_TEXT_COLORS.map((fallback, index) =>
        {
          const pixel = context?.getImageData(96 + (index % 8) * 12 + 6, 144 + Math.floor(index / 8) * 12 + 6, 1, 1).data;
          return pixel === undefined ? fallback : `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
        });
        if (current)
        {
          setColors(sampled);
        }
      }
      catch
      {
        // a skin the page may not read keeps the default colours.
      }
    };
    image.src = api.imageUrl('system', 'Window');

    return () =>
    {
      current = false;
    };
  }, [ api ]);

  return colors;
};

/**
 * How text is drawn at one point of the message.
 */
type TextStyle = {
  readonly color: number;
  readonly size: number;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly effect: string | null;
};

/**
 * Works out how the text after a code is drawn: colours, sizes, J-Message's bold and italics, and its
 * animations, each of which toggles.
 * @param {TextStyle} style How text was drawn before the code.
 * @param {Extract<MessageToken, { kind: 'code' }>} token The code.
 * @returns {TextStyle} How text is drawn after it.
 */
const styleAfter = (style: TextStyle, token: Extract<MessageToken, { kind: 'code' }>): TextStyle =>
{
  const number = Number(token.argument);
  switch (token.code)
  {
    case 'C':
      return Number.isInteger(number) ? { ...style, color: number } : style;
    case '{':
      return style.size <= 96 ? { ...style, size: style.size + 12 } : style;
    case '}':
      return style.size >= 24 ? { ...style, size: style.size - 12 } : style;
    case 'FS':
      return Number.isInteger(number) && number > 0 ? { ...style, size: number } : style;
    case '*':
      return { ...style, bold: !style.bold };
    case '_':
      return { ...style, italic: !style.italic };
    case '~':
    case '%':
    case '=':
    case '+':
      return { ...style, effect: style.effect === token.code ? null : token.code };
    default:
      return style;
  }
};

/**
 * Draws one icon from the project's icon sheet.
 * @param {{ index: number, url: string | null }} props The icon's index, and the sheet's address.
 * @returns {React.JSX.Element} The icon.
 */
const Icon = (props: { index: number; url: string | null }) =>
{
  const { index, url } = props;
  const scale = ICON_SIZE / SHEET_ICON_SIZE;
  return (
    <Box component={'span'} title={`Icon ${index}`}
      sx={{ display: 'inline-block', width: ICON_SIZE, height: ICON_SIZE, verticalAlign: 'text-bottom', overflow: 'hidden', bgcolor: url === null ? 'action.selected' : 'transparent' }}>
      {url === null
        ? null
        : (
          <Box component={'span'} sx={{
            display: 'block',
            width: SHEET_ICON_SIZE,
            height: SHEET_ICON_SIZE,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            backgroundImage: `url("${url}")`,
            backgroundPosition: `-${(index % 16) * SHEET_ICON_SIZE}px -${Math.floor(index / 16) * SHEET_ICON_SIZE}px`,
            imageRendering: 'pixelated',
          }}/>
        )}
    </Box>
  );
};

/**
 * Draws a code the preview does not draw as text: a small marker for timing codes, a chip naming what a database
 * or plugin code will show, and the code itself for anything else.
 * @param {{ token: Extract<MessageToken, { kind: 'code' }> }} props The code.
 * @returns {React.JSX.Element} The marker.
 */
const CodeMarker = (props: { token: Extract<MessageToken, { kind: 'code' }> }) =>
{
  const { token } = props;
  const timing = TIMING_CODES[token.code];
  if (timing !== undefined)
  {
    return <Box component={'span'} title={timing} sx={{ color: 'grey.500', fontSize: '0.7em', px: '1px' }}>{token.code}</Box>;
  }

  const named = NAMED_CODES[token.code];
  let label = token.raw;
  if (token.code === 'MORE')
  {
    label = 'continues into the next message';
  }
  else if (token.code === 'G')
  {
    label = 'currency';
  }
  else if (named !== undefined)
  {
    label = `${named} ${token.argument ?? ''}`.trim();
  }

  return <Chip size={'small'} label={label} variant={'outlined'} sx={{ height: 18, fontSize: 11, mx: '2px', color: 'grey.300', borderColor: 'grey.600' }}/>;
};

/**
 * Previews a message the way the window draws it: colours, icons, sizes and J-Message's styles applied, and
 * everything whose value only the game knows (a variable, an actor's name) shown as a chip saying what goes
 * there. Timing codes show as small marks.
 * @param {{ text: string }} props The message, its lines joined with line breaks.
 * @returns {React.JSX.Element} The preview.
 */
const MessagePreview = (props: { text: string }) =>
{
  const { api } = useEditorEnvironment();
  const colors = useTextColors();
  const tokens = useMemo(() => tokenizeMessage(props.text), [ props.text ]);
  const iconSheet = api === null ? null : api.imageUrl('system', 'IconSet');

  let style: TextStyle = { color: 0, size: BASE_FONT_SIZE, bold: false, italic: false, effect: null };
  const pieces = tokens.map((token, index) =>
  {
    const key = `${index}`;
    if (token.kind === 'newline')
    {
      return <br key={key}/>;
    }

    if (token.kind === 'text')
    {
      return (
        <Box component={'span'} key={key} sx={{
          color: colors[style.color] ?? colors[0],
          fontSize: `${(style.size / BASE_FONT_SIZE).toFixed(3)}em`,
          fontWeight: style.bold ? 700 : 400,
          fontStyle: style.italic ? 'italic' : 'normal',
          textDecoration: style.effect === '~' ? 'underline wavy' : 'none',
          letterSpacing: style.effect === '%' ? '0.08em' : 'normal',
        }}>
          {token.text}
        </Box>
      );
    }

    style = styleAfter(style, token);
    if (token.code === 'I')
    {
      return <Icon key={key} index={Number(token.argument) || 0} url={iconSheet}/>;
    }

    const drawsNothing = [ 'C', '{', '}', 'FS', '*', '_', '~', '%', '=', '+' ].includes(token.code);
    return drawsNothing ? null : <CodeMarker key={key} token={token}/>;
  });

  return (
    <Box aria-label={'Message preview'} sx={{
      bgcolor: 'rgba(16, 20, 40, 0.92)',
      color: '#ffffff',
      borderRadius: 1,
      px: 2,
      py: 1.5,
      fontSize: 15,
      lineHeight: 1.6,
      whiteSpace: 'pre-wrap',
      minHeight: 48,
    }}>
      {pieces}
    </Box>
  );
};

export { MessagePreview };
