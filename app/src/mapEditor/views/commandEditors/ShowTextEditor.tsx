import React, { useMemo } from 'react';
import { Box, TextField } from '@mui/material';
import type { CommandEditorProps } from '../../core/commands/CommandEditorRegistry.ts';
import { linesToText, parseShowText, textToLines, writeShowText, type ShowTextModel } from '../../core/commands/editors/showText.ts';
import { DraftTextField, EditorStack, FieldRow, SelectField, UneditableCommand } from './editorFields.tsx';
import { FacePicker } from './FacePicker.tsx';
import { MessagePreview } from './MessagePreview.tsx';
import { useDraftText } from './useDraftText.ts';

/**
 * The message window's looks, in MZ's order.
 */
const BACKGROUNDS = [
  { value: 0, label: 'Window' },
  { value: 1, label: 'Dim' },
  { value: 2, label: 'Transparent' },
];

/**
 * Where the message window sits, in MZ's order.
 */
const POSITIONS = [
  { value: 0, label: 'Top' },
  { value: 1, label: 'Middle' },
  { value: 2, label: 'Bottom' },
];

/**
 * The message's text box, which keeps its own copy of the text so typing never loses the caret, and hands it on once
 * per burst of typing, so a line typed is one step in history; the preview follows every key.
 * @param {{ text: string, onChange: (text: string) => void }} props The text and what to do with a change.
 * @returns {React.JSX.Element} The text box and its preview.
 */
const MessageText = (props: { text: string; onChange: (text: string) => void }) =>
{
  const [ draft, change, finish ] = useDraftText(props.text, props.onChange);
  const lineCount = draft === '' ? 0 : draft.split('\n').length;

  return (
    <>
      <TextField
        multiline
        fullWidth
        minRows={4}
        label={'Text'}
        value={draft}
        helperText={lineCount === 1 ? '1 line' : `${lineCount} lines`}
        onChange={event => change(event.target.value)}
        onBlur={finish}
        slotProps={{ htmlInput: { spellCheck: true } }}
      />
      <MessagePreview text={draft}/>
    </>
  );
};

/**
 * Edits a Show Text command: the face, the speaker, the window's look and place, and the text, with no cap on
 * its lines and a preview of what its escape codes draw.
 * @param {CommandEditorProps} props The command, its lines and what to do with a change.
 * @returns {React.JSX.Element} The editor.
 */
const ShowTextEditor = (props: CommandEditorProps) =>
{
  const { command, continuation, onChange } = props;
  const model = useMemo(() => parseShowText(command, continuation), [ command, continuation ]);
  if (model === null)
  {
    return <UneditableCommand command={command}/>;
  }

  const change = (next: ShowTextModel) =>
  {
    const written = writeShowText(command, continuation, next);
    onChange(written.command, written.continuation);
  };

  return (
    <EditorStack>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <FacePicker faceName={model.faceName} faceIndex={model.faceIndex}
          onChange={(faceName, faceIndex) => change({ ...model, faceName, faceIndex })}/>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, flex: 1, minWidth: 240 }}>
          <DraftTextField size={'small'} label={'Speaker'} value={model.speakerName}
            onText={speakerName => change({ ...model, speakerName })}/>
          <FieldRow>
            <SelectField label={'Window'} value={model.background} options={BACKGROUNDS} width={150}
              onChange={background => change({ ...model, background })}/>
            <SelectField label={'Position'} value={model.position} options={POSITIONS} width={150}
              onChange={position => change({ ...model, position })}/>
          </FieldRow>
        </Box>
      </Box>
      <MessageText text={linesToText(model.lines)} onChange={text => change({ ...model, lines: textToLines(text) })}/>
    </EditorStack>
  );
};

export { ShowTextEditor };
