import React, { useEffect, useState } from 'react';
import { Button, Stack, TextField } from '@mui/material';
import type { CommandCatalogEntry } from '../../core/commands/catalogTypes.ts';
import type { CommandDraft } from '../../core/commands/fieldValues.ts';
import { rawCommandText, readRawCommandText } from '../../core/commandList/rowEditors.ts';

/**
 * What the raw editor takes.
 */
type RawCommandEditorProps = {
  readonly entry: CommandCatalogEntry;
  readonly draft: CommandDraft;
  readonly onChange: (draft: CommandDraft) => void;
};

/**
 * Edits a command's parameters and lines as JSON: the last resort for a command nothing describes yet (a plugin
 * whose header was never read), and a way into any command for someone who knows its shape. Nothing is saved until
 * Apply, and text that is not a command is refused with the reason.
 * @param {RawCommandEditorProps} props The command, its entry, and where a change goes.
 * @returns {React.JSX.Element} The editor.
 */
const RawCommandEditor = (props: RawCommandEditorProps) =>
{
  const { entry, draft, onChange } = props;
  const shown = rawCommandText(draft);
  const [ text, setText ] = useState(shown);
  const [ problem, setProblem ] = useState<string | null>(null);

  // a change from elsewhere (undo, another window) replaces what is shown.
  useEffect(() =>
  {
    setText(shown);
    setProblem(null);
  }, [ shown ]);

  /**
   * Saves the text when it reads as a command, and says why when it does not.
   */
  const apply = () =>
  {
    const read = readRawCommandText(text, draft, entry.continuation);
    if (read.ok)
    {
      setProblem(null);
      onChange(read.draft);
      return;
    }

    setProblem(read.message);
  };

  return (
    <Stack spacing={1}>
      <TextField
        label={'Parameters and lines, as JSON'}
        multiline
        minRows={4}
        fullWidth
        size={'small'}
        value={text}
        error={problem !== null}
        helperText={problem ?? 'Apply saves it; nothing changes until then.'}
        slotProps={{ htmlInput: { spellCheck: false, style: { fontFamily: 'monospace', fontSize: 13 } } }}
        onChange={event => setText(event.target.value)}
      />
      <Stack direction={'row'} spacing={1}>
        <Button size={'small'} variant={'contained'} disabled={text === shown} onClick={apply}>Apply</Button>
        <Button size={'small'} disabled={text === shown} onClick={() =>
        {
          setText(shown);
          setProblem(null);
        }}>Revert</Button>
      </Stack>
    </Stack>
  );
};

export { RawCommandEditor };
