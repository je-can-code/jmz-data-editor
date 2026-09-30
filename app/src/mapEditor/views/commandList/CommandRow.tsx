import React from 'react';
import { Box, Chip, IconButton, Tooltip, Typography } from '@mui/material';
import { Add, ChevronRight, DragIndicator, ExpandMore, PlayArrow } from '@mui/icons-material';
import type { AudioFolder, MapEditorApi } from '../../core/api/MapEditorApi.ts';
import type { CommandCatalogEntry } from '../../core/commands/catalogTypes.ts';
import { parsePluginCommand } from '../../core/commands/editors/pluginCommand.ts';
import { readFieldValue, type CommandDraft } from '../../core/commands/fieldValues.ts';
import { areaEventTag, joinsChoicesAbove } from '../../core/commandList/commandGuards.ts';
import type { ListRow } from '../../core/commandList/listRows.ts';
import type { PluginCommandRegistration } from '../../core/commands/pluginHeaders/pluginCommandRegistration.ts';
import type { PluginHeaderLibrary } from '../../core/commands/pluginHeaders/PluginHeaderLibrary.ts';
import { isJsonObject } from '../../core/model/json.ts';
import type { RmmzEventCommand } from '../../core/model/rmmzTypes.ts';
import type { SoundPlayer } from './commandListResources.ts';

/**
 * How far each indent level moves a row in.
 */
const INDENT_PX = 20;

/**
 * The folders sounds can be played from.
 */
const AUDIO_FOLDERS: ReadonlySet<string> = new Set([ 'bgm', 'bgs', 'me', 'se' ]);

/**
 * What a row header shows and does.
 */
type CommandRowProps = {
  readonly row: ListRow;
  readonly list: readonly RmmzEventCommand[];
  readonly entry: CommandCatalogEntry;
  readonly draft: CommandDraft;
  readonly sentence: string;
  readonly selected: boolean;
  readonly focused: boolean;
  readonly open: boolean;
  readonly api: MapEditorApi | null;
  readonly pluginLibrary: PluginHeaderLibrary;
  readonly playSound: SoundPlayer;
  readonly onClick: (event: React.MouseEvent) => void;
  readonly onContextMenu: (event: React.MouseEvent) => void;
  readonly onToggleFold: () => void;
  readonly onHandlePointerDown: (event: React.PointerEvent) => void;
  readonly onHandlePointerMove: (event: React.PointerEvent) => void;
  readonly onHandlePointerUp: (event: React.PointerEvent) => void;
};

/**
 * A face from a face sheet, cut out of MZ's four by two grid of faces.
 * @param {{ api: MapEditorApi, name: string, index: number, size?: number }} props The sheet, which face, and how big.
 * @returns {React.JSX.Element} The face.
 */
const FaceThumbnail = (props: { readonly api: MapEditorApi; readonly name: string; readonly index: number; readonly size?: number }) =>
{
  const { api, name, index, size = 40 } = props;
  const column = index % 4;
  const line = Math.floor(index / 4);
  return (
    <Box
      role={'img'}
      aria-label={`Face ${name} ${index}`}
      sx={{
        width: size,
        height: size,
        flex: 'none',
        borderRadius: 1,
        bgcolor: 'action.hover',
        backgroundImage: `url("${api.imageUrl('faces', name)}")`,
        backgroundSize: `${size * 4}px ${size * 2}px`,
        backgroundPosition: `-${column * size}px -${line * size}px`,
        backgroundRepeat: 'no-repeat',
      }}
    />
  );
};

/**
 * Lists the text of a command's lines, first and continuing.
 * @param {CommandDraft} draft The command and its lines.
 * @param {boolean} includeHead Whether the command itself holds the first line.
 * @returns {string[]} The lines.
 */
const linesOf = (draft: CommandDraft, includeHead: boolean): string[] =>
{
  const lines = includeHead
    ? [ draft.command, ...draft.continuation ]
    : draft.continuation;
  return lines.map(line => String(line.parameters[0] ?? ''));
};

/**
 * Show Text's row: the face beside the lines, the speaker's name above them.
 * @param {{ draft: CommandDraft, api: MapEditorApi | null }} props The command and the server.
 * @returns {React.JSX.Element} The row's content.
 */
const ShowTextContent = (props: { readonly draft: CommandDraft; readonly api: MapEditorApi | null }) =>
{
  const { draft, api } = props;
  const [ faceName, faceIndex, , , speaker ] = draft.command.parameters;
  const lines = linesOf(draft, false);
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', minWidth: 0 }}>
      {api !== null && typeof faceName === 'string' && faceName !== '' && (
        <FaceThumbnail api={api} name={faceName} index={Number(faceIndex ?? 0)}/>
      )}
      <Box sx={{ minWidth: 0 }}>
        {typeof speaker === 'string' && speaker !== '' && (
          <Typography variant={'body2'} sx={{ fontWeight: 600 }}>{speaker}</Typography>
        )}
        {lines.length === 0
          ? <Typography variant={'body2'} color={'text.secondary'}>(no text)</Typography>
          : lines.map((line, position) => (
            <Typography key={position} variant={'body2'} sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{line || ' '}</Typography>
          ))}
      </Box>
    </Box>
  );
};

/**
 * A comment's row: every line, and a note when a line gives the event a trigger area KMS_AreaEvent reads, or a
 * warning when it sits where the plugin never reads it.
 * @param {{ draft: CommandDraft, list: readonly RmmzEventCommand[], index: number }} props The command and its list.
 * @returns {React.JSX.Element} The row's content.
 */
const CommentContent = (props: { readonly draft: CommandDraft; readonly list: readonly RmmzEventCommand[]; readonly index: number }) =>
{
  const { draft, list, index } = props;
  const area = areaEventTag(list, index);
  return (
    <Box sx={{ minWidth: 0 }}>
      {linesOf(draft, true).map((line, position) => (
        <Typography key={position} variant={'body2'} sx={{ color: 'success.main', fontStyle: 'italic', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {line || ' '}
        </Typography>
      ))}
      {area !== null && (
        <Chip
          size={'small'}
          color={area.effective ? 'default' : 'warning'}
          label={area.effective
            ? `Trigger area ${area.width} x ${area.height} tiles`
            : `Trigger area ${area.width} x ${area.height} is only read at the top of the page`}
          sx={{ mt: 0.5 }}
        />
      )}
    </Box>
  );
};

/**
 * A script's row: its lines, as code.
 * @param {{ draft: CommandDraft }} props The command.
 * @returns {React.JSX.Element} The row's content.
 */
const ScriptContent = (props: { readonly draft: CommandDraft }) =>
{
  return (
    <Box component={'pre'} sx={{ m: 0, fontFamily: 'monospace', fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {linesOf(props.draft, true).join('\n')}
    </Box>
  );
};

/**
 * Finds the sound a command plays, for its row's play button.
 * @param {CommandCatalogEntry} entry The command's entry.
 * @param {CommandDraft} draft The command.
 * @returns {{ folder: AudioFolder, name: string, volume: number, pitch: number } | null} The sound, or null when there is none.
 */
const soundOf = (entry: CommandCatalogEntry, draft: CommandDraft) =>
{
  const field = entry.fields.find(each => each.kind === 'audio' && AUDIO_FOLDERS.has(each.folder ?? ''));
  const value = field === undefined
    ? undefined
    : readFieldValue(draft, field);
  if (field === undefined || isJsonObject(value) === false || typeof value['name'] !== 'string' || value['name'] === '')
  {
    return null;
  }

  return {
    folder: field.folder as AudioFolder,
    name: value['name'],
    volume: Number(value['volume'] ?? 90),
    pitch: Number(value['pitch'] ?? 100),
  };
};

/**
 * Checks a plugin command's row for the angry-red flag: whether its plugin and command actually resolve to
 * something the game would run, or null when the command is not MZ-shaped enough to say.
 * @param {CommandDraft} draft The command and its lines.
 * @param {PluginHeaderLibrary} pluginLibrary The plugin headers read so far, and every plugin {@code js/plugins.js} lists.
 * @returns {PluginCommandRegistration | null} The check, or null when there is nothing to check.
 */
const pluginRegistrationOf = (draft: CommandDraft, pluginLibrary: PluginHeaderLibrary): PluginCommandRegistration | null =>
{
  const model = parsePluginCommand(draft.command, draft.continuation);
  return model === null
    ? null
    : pluginLibrary.registrationOf(model.plugin, model.command);
};

/**
 * What a command's row shows: its own rendering for the commands that read better that way, and its sentence for
 * every other, with the lines MZ lists under a plugin command and a play button on a sound.
 * @param {CommandRowProps} props The row's props.
 * @returns {React.JSX.Element} The content.
 */
const CommandContent = (props: CommandRowProps) =>
{
  const { row, list, entry, draft, sentence, api, pluginLibrary, playSound } = props;
  const { code } = draft.command;
  if (code === 101)
  {
    return <ShowTextContent draft={draft} api={api}/>;
  }

  if (code === 108)
  {
    return <CommentContent draft={draft} list={list} index={row.index}/>;
  }

  if (code === 355)
  {
    return <ScriptContent draft={draft}/>;
  }

  const sound = soundOf(entry, draft);
  const registration = code === 357
    ? pluginRegistrationOf(draft, pluginLibrary)
    : null;
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
        <Typography variant={'body2'} sx={{ wordBreak: 'break-word' }}>{sentence}</Typography>
        {sound !== null && api !== null && (
          <Tooltip title={`Play ${sound.name}`}>
            <IconButton
              aria-label={`Play ${sound.name}`}
              size={'small'}
              onClick={event =>
              {
                event.stopPropagation();
                playSound(api.audioUrl(sound.folder, sound.name), sound);
              }}
            >
              <PlayArrow fontSize={'small'}/>
            </IconButton>
          </Tooltip>
        )}
        {code === 102 && joinsChoicesAbove(list, row.index) && <Chip size={'small'} label={'Shown with the choices above'}/>}
        {registration !== null && registration.registered === false && (
          <Tooltip title={registration.message}>
            <Chip size={'small'} color={'error'} label={'Unregistered plugin command'}/>
          </Tooltip>
        )}
      </Box>
      {code === 357 && draft.continuation.map((line, position) => (
        <Typography key={position} variant={'caption'} component={'div'} color={'text.secondary'}>
          {String(line.parameters[0] ?? '')}
        </Typography>
      ))}
    </Box>
  );
};

/**
 * What a row that is not a command shows: a branch's sentence, a block's end, or the place to add a command.
 * @param {{ row: ListRow, sentence: string, focused: boolean }} props The row.
 * @returns {React.JSX.Element} The content.
 */
const StructureContent = (props: { readonly row: ListRow; readonly sentence: string; readonly focused: boolean }) =>
{
  const { row, sentence, focused } = props;
  if (row.kind === 'terminator')
  {
    return (
      <Box className={'add-command'} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.disabled', opacity: focused ? 1 : 0.6 }}>
        <Add fontSize={'small'}/>
        <Typography variant={'body2'}>Add a command</Typography>
      </Box>
    );
  }

  return (
    <Typography variant={'body2'} sx={{ color: row.kind === 'closer' ? 'text.disabled' : 'text.secondary', fontWeight: row.kind === 'branch' ? 600 : 400 }}>
      {row.kind === 'closer' ? 'End' : sentence}
    </Typography>
  );
};

/**
 * One row's header: a handle to drag it by, its fold chevron, and what it reads as. Clicking selects it and, for a
 * command, unfolds its editor below.
 * @param {CommandRowProps} props The row's props.
 * @returns {React.JSX.Element} The header.
 */
const CommandRow = (props: CommandRowProps) =>
{
  const { row, selected, focused, open, sentence, onClick, onContextMenu, onToggleFold } = props;
  const isCommand = row.kind === 'line' || row.kind === 'opener';
  const draggable = row.kind !== 'terminator';
  return (
    <Box
      data-row-kind={row.kind}
      data-command-index={row.index}
      aria-selected={selected}
      onClick={onClick}
      onContextMenu={onContextMenu}
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 0.5,
        minHeight: 28,
        py: 0.25,
        pr: 1,
        pl: `${4 + row.indent * INDENT_PX}px`,
        borderRadius: 1,
        cursor: 'pointer',
        bgcolor: selected ? 'action.selected' : 'transparent',
        outline: focused ? '1px solid' : 'none',
        outlineColor: 'primary.main',
        '&:hover': { bgcolor: selected ? 'action.selected' : 'action.hover' },
        '&:hover .add-command': { opacity: 1 },
      }}
    >
      <Box
        aria-label={draggable ? 'Drag to move' : undefined}
        onPointerDown={draggable ? props.onHandlePointerDown : undefined}
        onPointerMove={draggable ? props.onHandlePointerMove : undefined}
        onPointerUp={draggable ? props.onHandlePointerUp : undefined}
        onClick={event => event.stopPropagation()}
        sx={{ display: 'flex', alignItems: 'center', height: 24, color: 'text.disabled', cursor: draggable ? 'grab' : 'default', visibility: draggable ? 'visible' : 'hidden', touchAction: 'none' }}
      >
        <DragIndicator fontSize={'small'}/>
      </Box>
      <Box sx={{ width: 24, height: 24, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {row.foldable && (
          <IconButton
            size={'small'}
            aria-label={row.folded ? 'Unfold' : 'Fold'}
            aria-expanded={row.folded === false}
            onClick={event =>
            {
              event.stopPropagation();
              onToggleFold();
            }}
            sx={{ p: 0.25 }}
          >
            {row.folded ? <ChevronRight fontSize={'small'}/> : <ExpandMore fontSize={'small'}/>}
          </IconButton>
        )}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0, py: 0.25 }} aria-expanded={isCommand ? open : undefined}>
        {isCommand
          ? <CommandContent {...props}/>
          : <StructureContent row={row} sentence={sentence} focused={focused}/>}
        {row.folded && row.hidden > 0 && (
          <Typography variant={'caption'} color={'text.disabled'}>{`${row.hidden} more folded away`}</Typography>
        )}
      </Box>
    </Box>
  );
};

export { CommandRow, FaceThumbnail, INDENT_PX };
export type { CommandRowProps };
