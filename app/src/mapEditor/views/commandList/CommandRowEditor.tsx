import React, { useState } from 'react';
import { Box, Button, Checkbox, FormControlLabel, Stack, Typography } from '@mui/material';
import type { MapEditorApi } from '../../core/api/MapEditorApi.ts';
import type { CommandCatalogEntry } from '../../core/commands/catalogTypes.ts';
import type {
  CommandBlockEdit,
  CommandEditor,
  CommandEditorProps,
  CommandEditorRegistry,
} from '../../core/commands/CommandEditorRegistry.ts';
import type { CommandDraft, ListOrigins } from '../../core/commands/fieldValues.ts';
import type { DatabaseNamesJson } from '../../core/commandList/databaseNames.ts';
import { chooseRowEditor } from '../../core/commandList/rowEditors.ts';
import type { SoundPlayer } from './commandListResources.ts';
import { GeneratedCommandForm } from './GeneratedCommandForm.tsx';
import { RawCommandEditor } from './RawCommandEditor.tsx';

/**
 * A conditional branch's else, which the list owns since MZ keeps it in the list's shape: whether there is one, and
 * how to change that.
 */
type ElseBranchControl = {
  readonly present: boolean;
  readonly set: (wanted: boolean) => void;
};

/**
 * What a row's editor takes.
 */
type CommandRowEditorProps = {
  readonly entry: CommandCatalogEntry;
  readonly draft: CommandDraft;

  /**
   * Takes the edited command; when the generated form reshaped a list input, also where each entry came from.
   */
  readonly onChange: (draft: CommandDraft, origins?: ListOrigins) => void;

  /**
   * The whole block, for the hand-built editors that change a block's shape (Show Choices, Conditional Branch).
   */
  readonly block: CommandBlockEdit | undefined;

  /**
   * The else of a conditional branch, offered here when no hand-built editor offers it itself.
   */
  readonly elseBranch: ElseBranchControl | null;

  readonly registry: CommandEditorRegistry;
  readonly names: DatabaseNamesJson | null;
  readonly api: MapEditorApi | null;
  readonly playSound: SoundPlayer;
};

/**
 * Shows a hand-built editor the registry handed out. The editor is registered once, so it is the same component on
 * every render; this only passes the props through.
 * @param {CommandEditorProps & { editor: CommandEditor }} props The editor and its props.
 * @returns {React.ReactElement} The editor.
 */
const HandBuiltHost = (props: CommandEditorProps & { readonly editor: CommandEditor }) =>
{
  const { editor, ...editorProps } = props;
  return React.createElement(editor, editorProps);
};

/**
 * The editor a row unfolds into: the hand-built one registered for the command, its generated form, or its
 * parameters as JSON when nothing describes it, and a plain note for a command with nothing to set. Any command
 * with an editor can also be opened as JSON.
 * @param {CommandRowEditorProps} props The command and everything its editor reads with.
 * @returns {React.JSX.Element} The editor.
 */
const CommandRowEditor = (props: CommandRowEditorProps) =>
{
  const { entry, draft, onChange, block, elseBranch, registry } = props;
  const [ asJson, setAsJson ] = useState(false);
  const kind = chooseRowEditor(registry, entry, draft);
  const handBuilt = registry.editorFor(entry);

  let editor: React.ReactNode;
  if (kind === 'none')
  {
    editor = <Typography variant={'body2'} color={'text.secondary'}>Nothing to set for this command.</Typography>;
  }
  else if (kind === 'raw' || asJson)
  {
    editor = <RawCommandEditor entry={entry} draft={draft} onChange={onChange}/>;
  }
  else if (kind === 'hand-built' && handBuilt !== null)
  {
    editor = (
      <HandBuiltHost
        editor={handBuilt}
        entry={entry}
        command={draft.command}
        continuation={draft.continuation}
        block={block}
        onChange={(command, continuation) => onChange({ command, continuation })}
      />
    );
  }
  else
  {
    editor = <GeneratedCommandForm {...props}/>;
  }

  return (
    <Stack spacing={1.5}>
      {editor}
      <Stack direction={'row'} spacing={1} alignItems={'center'}>
        {elseBranch !== null && kind !== 'hand-built' && (
          <FormControlLabel
            label={'With an else branch'}
            control={<Checkbox size={'small'} checked={elseBranch.present} onChange={event => elseBranch.set(event.target.checked)}/>}
          />
        )}
        <Box sx={{ flex: 1 }}/>
        {kind !== 'none' && kind !== 'raw' && (
          <Button size={'small'} onClick={() => setAsJson(current => current === false)}>
            {asJson ? 'Back to the form' : 'Edit as JSON'}
          </Button>
        )}
      </Stack>
    </Stack>
  );
};

export { CommandRowEditor };
export type { CommandRowEditorProps, ElseBranchControl };
