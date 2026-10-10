import React, { useLayoutEffect, useRef } from 'react';
import { Box, InputBase } from '@mui/material';
import { useDraftText } from './useDraftText.ts';

/**
 * How many spaces the Tab key indents by.
 */
const INDENT = '  ';

/**
 * What the code box takes.
 */
type CodeBoxProps = {
  /**
   * The code.
   */
  readonly value: string;

  /**
   * Hands on the code after every change.
   */
  readonly onChange: (value: string) => void;

  /**
   * The fewest lines it shows.
   */
  readonly minRows?: number;

  /**
   * Its accessible name.
   */
  readonly label: string;
};

/**
 * A code box: monospaced, numbered lines, no wrapping, and Tab indenting rather than leaving the box (Shift+Tab
 * still leaves). It grows to fit its code, so the line numbers always sit beside their lines.
 * @param {CodeBoxProps} props The code and what to do with a change.
 * @returns {React.JSX.Element} The box.
 */
const CodeBox = (props: CodeBoxProps) =>
{
  const { value, onChange, minRows = 4, label } = props;
  const [ draft, change, finish ] = useDraftText(value, onChange);
  const input = useRef<HTMLTextAreaElement | null>(null);
  const caret = useRef<number | null>(null);
  const lineCount = Math.max(minRows, draft.split('\n').length);

  // put the caret back after an indent, once the new text is on screen.
  useLayoutEffect(() =>
  {
    if (caret.current !== null && input.current !== null)
    {
      input.current.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  }, [ draft ]);

  return (
    <Box
      sx={{
        display: 'flex',
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        overflowX: 'auto',
        fontFamily: 'monospace',
        fontSize: 13,
        lineHeight: '20px',
        '&:focus-within': { borderColor: 'primary.main' },
      }}
    >
      <Box
        component={'pre'}
        aria-hidden
        sx={{ m: 0, px: 1, py: '6px', color: 'text.disabled', textAlign: 'right', userSelect: 'none', borderRight: 1, borderColor: 'divider', font: 'inherit' }}
      >
        {Array.from({ length: lineCount }, (_, index) => index + 1).join('\n')}
      </Box>
      <InputBase
        multiline
        fullWidth
        minRows={minRows}
        value={draft}
        inputRef={input}
        inputProps={{ 'aria-label': label, spellCheck: false, wrap: 'off' }}
        sx={{ px: 1, py: '6px', font: 'inherit', alignItems: 'flex-start', '& textarea': { whiteSpace: 'pre', lineHeight: '20px', p: 0 } }}
        onChange={event => change(event.target.value)}
        onBlur={finish}
        onKeyDown={event =>
        {
          if (event.key !== 'Tab' || event.shiftKey)
          {
            return;
          }

          // indent at the caret, replacing any selection, as a code editor does.
          event.preventDefault();
          const target = event.target as HTMLTextAreaElement;
          const { selectionStart, selectionEnd } = target;
          caret.current = selectionStart + INDENT.length;
          change(`${draft.slice(0, selectionStart)}${INDENT}${draft.slice(selectionEnd)}`);
        }}
      />
    </Box>
  );
};

export { CodeBox };
