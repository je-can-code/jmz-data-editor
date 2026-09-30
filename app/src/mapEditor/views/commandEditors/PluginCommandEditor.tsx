import React, { useMemo } from 'react';
import { Alert, Box, MenuItem, TextField, Typography } from '@mui/material';
import type { CommandEditorProps } from '../../core/commands/CommandEditorRegistry.ts';
import {
  choosePluginCommand,
  parsePluginCommand,
  setPluginArg,
  writePluginCommand,
  type PluginCommandModel,
} from '../../core/commands/editors/pluginCommand.ts';
import { PluginHeaderLibrary } from '../../core/commands/pluginHeaders/PluginHeaderLibrary.ts';
import { usePluginHeaders } from './editorEnvironment.tsx';
import { EditorStack, FieldRow, UneditableCommand } from './editorFields.tsx';
import { PluginArgField } from './PluginArgField.tsx';

/**
 * Edits the arguments a command stores that its plugin's header does not list, as plain text, so none is lost.
 * @param {{ names: readonly string[], model: PluginCommandModel, change: (next: PluginCommandModel) => void }} props The arguments and what to do with a change.
 * @returns {React.JSX.Element | null} The inputs, or nothing when there are none.
 */
const UnlistedArgs = (props: { names: readonly string[]; model: PluginCommandModel; change: (next: PluginCommandModel) => void }) =>
{
  const { names, model, change } = props;
  if (names.length === 0)
  {
    return null;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {names.map(name =>
      {
        const value = model.args[name];
        const text = typeof value === 'string' ? value : JSON.stringify(value);
        return (
          <TextField key={name} size={'small'} fullWidth label={name} value={text}
            onChange={event => change(setPluginArg(model, name, event.target.value))}/>
        );
      })}
    </Box>
  );
};

/**
 * Edits a plugin command: the plugin, the command, and its arguments as a form built from the plugin's header,
 * structs and lists included. A command the header does not list, or a plugin whose header is not available,
 * still opens: its values show as text and every one of them is kept.
 * @param {CommandEditorProps} props The command, its lines and what to do with a change.
 * @returns {React.JSX.Element} The editor.
 */
const PluginCommandEditor = (props: CommandEditorProps) =>
{
  const { command, continuation, onChange } = props;
  const library = usePluginHeaders();
  const model = useMemo(() => parsePluginCommand(command, continuation), [ command, continuation ]);
  if (model === null)
  {
    return <UneditableCommand command={command}/>;
  }

  const schema = library.command(model.plugin, model.command);
  const change = (next: PluginCommandModel) =>
  {
    const written = writePluginCommand(command, continuation, next, library.command(next.plugin, next.command));
    onChange(written.command, written.continuation);
  };

  const plugins = library.withCommands();
  const header = library.header(model.plugin);
  const commands = header?.commands ?? [];
  const listed = new Set((schema?.args ?? []).map(arg => arg.name));
  const unlisted = Object.keys(model.args).filter(name => listed.has(name) === false);

  return (
    <EditorStack>
      <FieldRow>
        <TextField select size={'small'} label={'Plugin'} value={model.plugin} sx={{ width: 260 }} onChange={event =>
        {
          const [ first ] = library.header(event.target.value)?.commands ?? [];
          if (first !== undefined)
          {
            change(choosePluginCommand(model, first));
          }
        }}>
          {plugins.map(each => <MenuItem key={each.plugin} value={each.plugin}>{PluginHeaderLibrary.displayName(each.plugin)}</MenuItem>)}
          {header === null || header.commands.length === 0
            ? <MenuItem value={model.plugin}>{PluginHeaderLibrary.displayName(model.plugin)}</MenuItem>
            : null}
        </TextField>
        <TextField select size={'small'} label={'Command'} value={model.command} sx={{ width: 300 }} onChange={event =>
        {
          const picked = commands.find(each => each.command === event.target.value);
          if (picked !== undefined)
          {
            change(choosePluginCommand(model, picked));
          }
        }}>
          {commands.map(each => <MenuItem key={each.command} value={each.command}>{each.text ?? each.command}</MenuItem>)}
          {schema === null ? <MenuItem value={model.command}>{model.text === '' ? model.command : model.text}</MenuItem> : null}
        </TextField>
      </FieldRow>
      {schema?.description === undefined
        ? null
        : <Typography variant={'body2'} color={'text.secondary'} sx={{ whiteSpace: 'pre-line' }}>{schema.description}</Typography>}
      {schema === null
        ? (
          <Alert severity={'info'} variant={'outlined'}>
            {header === null
              ? 'This plugin\'s settings are not available, so its values are shown as plain text.'
              : 'This plugin does not list this command, so its values are shown as plain text.'}
          </Alert>
        )
        : null}
      {(schema?.args ?? []).map(arg =>
      {
        const value = model.args[arg.name];
        return (
          <PluginArgField key={arg.name} arg={arg} plugin={model.plugin} library={library}
            value={value === undefined ? '' : String(value)}
            onChange={next => change(setPluginArg(model, arg.name, next))}/>
        );
      })}
      <UnlistedArgs names={unlisted} model={model} change={change}/>
    </EditorStack>
  );
};

export { PluginCommandEditor };
