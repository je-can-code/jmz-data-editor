import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { FixedSizeList, type ListChildComponentProps } from 'react-window';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  InputBase,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Redo, RestartAlt, Save, Undo } from '@mui/icons-material';
import { SYSTEM_HISTORY_KEY } from '../../core/history/historyKeys.ts';
import { SYSTEM_KEY } from '../../core/model/documentKeys.ts';
import type { RmmzNameList } from '../../core/model/rmmzTypes.ts';
import { SWITCH_KIND, VARIABLE_KIND, type GamePreview, type PreviewKind } from '../../core/preview/GamePreview.ts';
import { readWholeNumber } from '../../core/preview/previewInput.ts';
import { previewWords } from '../../core/preview/previewWords.ts';
import {
  maximumOf,
  nameRows,
  renameEntry,
  saveNames,
  setMaximum,
  systemDocumentOf,
  type NameRow,
} from '../../core/system/systemNames.ts';
import { useMapEditorServices } from '../../services/MapEditorServicesContext.tsx';
import { CommitTextField } from '../commandList/CommitTextField.tsx';
import { useDocumentRevision, useHubChanges } from '../commandList/useCommandListState.ts';
import { commitTyping } from '../commitTyping.ts';
import { useEventWindowKeys } from '../eventWindow/useEventWindowKeys.ts';

/**
 * How tall each row of a list is, in pixels.
 */
const ROW_HEIGHT = 44;

/**
 * How tall a list is where nothing can measure it, such as a page with no way to watch its own size.
 */
const FALLBACK_LIST_HEIGHT = 480;

/**
 * What each list is called, one entry and the list as a whole, and the kind of preview state its entries are set under.
 */
const LIST_WORDS: Readonly<Record<RmmzNameList, { readonly one: string; readonly title: string; readonly kind: PreviewKind }>> = {
  switches: { one: 'switch', title: 'Switches', kind: SWITCH_KIND },
  variables: { one: 'variable', title: 'Variables', kind: VARIABLE_KIND },
};

/**
 * What a list's rows draw with: the rows, the preview, and where a rename and a preview change go.
 */
type RowData = {
  readonly list: RmmzNameList;
  readonly rows: readonly NameRow[];
  readonly preview: GamePreview;
  readonly onRename: (id: number, name: string) => void;
  readonly onSwitch: (id: number, on: boolean) => void;
  readonly onVariable: (id: number, value: number) => void;
};

/**
 * Follows how tall an element is, so a list fills whatever space its window gives it.
 * @param {React.RefObject<HTMLElement | null>} ref The element.
 * @returns {number} Its height in pixels, or a fair guess where it cannot be measured.
 */
const useElementHeight = (ref: React.RefObject<HTMLElement | null>): number =>
{
  const [ height, setHeight ] = useState(FALLBACK_LIST_HEIGHT);

  useEffect(() =>
  {
    const element = ref.current;
    if (element === null || typeof ResizeObserver === 'undefined')
    {
      return undefined;
    }

    // a list never shrinks to nothing, even in a window squeezed flat.
    const observer = new ResizeObserver(([ entry ]) => setHeight(Math.max(ROW_HEIGHT, Math.floor(entry.contentRect.height))));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ ref ]);

  return height;
};

/**
 * A variable's preview value, typed freely: what the box holds counts as soon as it is a whole number, and goes back to
 * the preview's own value once the author leaves the box.
 * @param {{ id: number, value: number, onChange: (value: number) => void }} props The variable, its value now, and where a
 * new value goes.
 * @returns {React.JSX.Element} The box.
 */
const VariableValueField = (props: { readonly id: number; readonly value: number; readonly onChange: (value: number) => void }) =>
{
  const { id, value, onChange } = props;
  const [ draft, setDraft ] = useState(String(value));
  const [ editing, setEditing ] = useState(false);

  // while nobody is typing, the box follows the preview, whichever window changed it.
  useEffect(() =>
  {
    if (editing === false)
    {
      setDraft(String(value));
    }
  }, [ value, editing ]);

  return (
    <InputBase
      inputProps={{ 'aria-label': `Show variable ${id} at`, inputMode: 'numeric' }}
      onBlur={() => setEditing(false)}
      onChange={event =>
      {
        setEditing(true);
        setDraft(event.target.value);
        const number = readWholeNumber(event.target.value);
        if (number !== null)
        {
          onChange(number);
        }
      }}
      onFocus={event => event.target.select()}
      size={'small'}
      sx={{ width: 96, px: 1, border: 1, borderColor: value === 0 ? 'divider' : 'warning.main', borderRadius: 1, fontVariantNumeric: 'tabular-nums' }}
      value={draft}
    />
  );
};

/**
 * One switch or variable: its number, its name, which saves to the game, and its preview control, which never does: an
 * on and off toggle for a switch, a value for a variable.
 * @param {ListChildComponentProps<RowData>} props The row's place and the list's data.
 * @returns {React.JSX.Element} The row.
 */
const NameListRow = (props: ListChildComponentProps<RowData>) =>
{
  const { index, style, data } = props;
  const { list, rows, preview, onRename, onSwitch, onVariable } = data;
  const row = rows[index];
  const { one } = LIST_WORDS[list];

  return (
    <Stack direction={'row'} spacing={1.5} alignItems={'center'} style={style} sx={{ px: 1.5 }} data-testid={`${one}-row-${row.id}`}>
      <Typography variant={'body2'} color={'text.secondary'} sx={{ width: 40, flex: 'none', fontVariantNumeric: 'tabular-nums' }}>
        {String(row.id).padStart(4, '0')}
      </Typography>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <CommitTextField
          fullWidth
          onCommit={name => onRename(row.id, name)}
          placeholder={'No name'}
          size={'small'}
          slotProps={{ htmlInput: { 'aria-label': `Name of ${one} ${row.id}` } }}
          value={row.name}
          variant={'standard'}
        />
      </Box>
      {list === 'switches'
        ? (
          <Tooltip title={'On here, every map shows this switch on'}>
            <Switch
              checked={preview.isSwitchOn(row.id)}
              color={'warning'}
              onChange={(_event, checked) => onSwitch(row.id, checked)}
              size={'small'}
              slotProps={{ input: { 'aria-label': `Show switch ${row.id} on` } }}
            />
          </Tooltip>
        )
        : <VariableValueField id={row.id} value={preview.variable(row.id)} onChange={value => onVariable(row.id, value)}/>}
    </Stack>
  );
};

/**
 * One list, switches or variables: a search by number or name, the maximum, and every one up to it, named or not.
 * @param {{ list: RmmzNameList, names: readonly string[], preview: GamePreview, onProblem: (message: string) => void }}
 * props Which list, its names, the preview, and where a failure is told.
 * @returns {React.JSX.Element} The list.
 */
const NameListPanel = (props: { readonly list: RmmzNameList; readonly names: readonly string[]; readonly preview: GamePreview; readonly onProblem: (message: string) => void }) =>
{
  const { list, names, preview, onProblem } = props;
  const services = useMapEditorServices();
  const [ search, setSearch ] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);
  const height = useElementHeight(listRef);
  const rows = nameRows(names, search);
  const words = LIST_WORDS[list];
  const set = preview.count(words.kind);

  /**
   * Runs a change, telling any failure rather than losing it.
   * @param {() => void} change The change.
   */
  const attempt = (change: () => void) =>
  {
    try
    {
      change();
    }
    catch (error)
    {
      onProblem((error as Error).message);
    }
  };

  const data: RowData = {
    list,
    rows,
    preview,
    onRename: (id, name) => attempt(() => renameEntry(services.hub, list, id, name)),
    onSwitch: (id, on) => services.preview.setSwitch(id, on),
    onVariable: (id, value) => services.preview.setVariable(id, value),
  };

  return (
    <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }} aria-label={words.title} role={'region'}>
      <Stack direction={'row'} spacing={1.5} alignItems={'center'} sx={{ px: 1.5, pt: 1.5, pb: 1 }}>
        <Typography variant={'subtitle1'} sx={{ flex: 1 }}>
          {words.title}
          {set > 0 && (
            <Typography component={'span'} variant={'body2'} color={'warning.main'} sx={{ ml: 1 }}>
              {list === 'switches' ? `${set} on` : `${set} set`}
            </Typography>
          )}
        </Typography>
        <Box sx={{ width: 120 }}>
          <CommitTextField
            label={'Maximum'}
            onCommit={text =>
            {
              const maximum = readWholeNumber(text);
              if (maximum === null)
              {
                return;
              }

              // a maximum that would take a name with it is refused, and the field goes back to the one there is.
              attempt(() =>
              {
                const outcome = setMaximum(services.hub, list, maximum);
                if (outcome.ok === false)
                {
                  onProblem(outcome.message);
                }
              });
            }}
            size={'small'}
            slotProps={{ htmlInput: { inputMode: 'numeric' } }}
            value={String(maximumOf(names))}
          />
        </Box>
      </Stack>
      <Box sx={{ px: 1.5, pb: 1 }}>
        <TextField
          fullWidth
          onChange={event => setSearch(event.target.value)}
          placeholder={`Find a ${words.one} by number or name`}
          size={'small'}
          value={search}
        />
      </Box>
      <Divider/>
      <Box ref={listRef} sx={{ flex: 1, minHeight: 0 }}>
        {rows.length === 0
          ? <Typography sx={{ p: 2 }} color={'text.secondary'}>{`No ${words.one} has that number or name.`}</Typography>
          : (
            <FixedSizeList
              height={height}
              itemCount={rows.length}
              itemData={data}
              itemKey={(index, itemData: RowData) => itemData.rows[index].id}
              itemSize={ROW_HEIGHT}
              overscanCount={8}
              width={'100%'}
            >
              {NameListRow}
            </FixedSizeList>
          )}
      </Box>
    </Box>
  );
};

/**
 * The switches and variables once loaded: saving and undo along the top with the preview's own line, then the two lists
 * side by side.
 * @returns {React.JSX.Element} The workspace.
 */
const SwitchesVariablesWorkspace = () =>
{
  const { hub, preview: windowPreview } = useMapEditorServices();
  useDocumentRevision(hub, SYSTEM_KEY);
  useHubChanges(hub);
  const preview = useSyncExternalStore(windowPreview.subscribe, windowPreview.preview);
  const [ problem, setProblem ] = useState<string | null>(null);
  const [ saving, setSaving ] = useState(false);
  const system = systemDocumentOf(hub);
  const dirty = hub.isDirty(SYSTEM_KEY);

  /**
   * Writes the names to System.json, as the editor's every save does, unless they wait for a choice about changes made
   * elsewhere, which is said instead. A name still being typed is part of the save, as Ctrl+S in its box expects.
   */
  const save = () =>
  {
    commitTyping();
    setSaving(true);
    setProblem(null);
    saveNames(hub)
      .then(outcome =>
      {
        if (outcome.ok === false)
        {
          setProblem(outcome.message);
        }
      })
      .catch((error: unknown) => setProblem(`The names were not saved: ${(error as Error).message}`))
      .finally(() => setSaving(false));
  };

  /**
   * Moves the names' history a step, telling why when it cannot.
   * @param {'undo' | 'redo'} direction Which way.
   */
  const step = (direction: 'undo' | 'redo') =>
  {
    const outcome = direction === 'undo' ? hub.undo(SYSTEM_HISTORY_KEY) : hub.redo(SYSTEM_HISTORY_KEY);
    if (outcome.ok === false && outcome.reason !== 'nothing' && outcome.reason !== 'missing-documents')
    {
      setProblem(outcome.message);
    }
  };

  // Ctrl+S saves from anywhere in the window, and Ctrl+Z and Ctrl+Y step through the names' history outside a text box.
  useEventWindowKeys({ save, undo: () => step('undo'), redo: () => step('redo') });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Stack direction={'row'} spacing={1} alignItems={'center'} sx={{ px: 1.5, py: 1, flexWrap: 'wrap' }}>
        <Button size={'small'} variant={'contained'} startIcon={<Save/>} disabled={dirty === false || saving} onClick={save}>
          Save
        </Button>
        <Typography variant={'caption'} color={'text.secondary'}>{dirty ? 'Unsaved names' : 'Names saved'}</Typography>
        <Tooltip title={'Undo (Ctrl+Z)'}>
          <span>
            <IconButton aria-label={'Undo'} disabled={hub.canUndo(SYSTEM_HISTORY_KEY).ok === false} onClick={() => step('undo')} size={'small'}>
              <Undo fontSize={'small'}/>
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={'Redo (Ctrl+Y)'}>
          <span>
            <IconButton aria-label={'Redo'} disabled={hub.canRedo(SYSTEM_HISTORY_KEY).ok === false} onClick={() => step('redo')} size={'small'}>
              <Redo fontSize={'small'}/>
            </IconButton>
          </span>
        </Tooltip>
        <Box sx={{ flex: 1 }}/>
        <Typography variant={'body2'} color={preview.isFresh ? 'text.secondary' : 'warning.main'} data-testid={'preview-words'}>
          {`Maps show: ${previewWords(preview)}`}
        </Typography>
        <Button
          size={'small'}
          variant={'outlined'}
          startIcon={<RestartAlt/>}
          disabled={preview.isFresh}
          onClick={() => windowPreview.reset()}
        >
          Back to a fresh save
        </Button>
      </Stack>
      <Typography variant={'caption'} color={'text.secondary'} sx={{ px: 1.5, pb: 1 }}>
        Names save to the game. Switches turned on and values set here only change what every map shows.
      </Typography>
      {problem !== null && <Alert severity={'error'} onClose={() => setProblem(null)} sx={{ mx: 1.5, mb: 1 }}>{problem}</Alert>}
      <Divider/>
      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <NameListPanel list={'switches'} names={system.names('switches')} preview={preview} onProblem={setProblem}/>
        <Divider orientation={'vertical'} flexItem/>
        <NameListPanel list={'variables'} names={system.names('variables')} preview={preview} onProblem={setProblem}/>
      </Box>
    </Box>
  );
};

/**
 * The Switches & Variables window: every switch and variable by number and name, each name a real edit to System.json,
 * undoable in the names' own history and saved the way the editor saves everything; and, beside each, a preview that is
 * never written anywhere in the game, a switch turned on or a variable set, which every map in every window judges its
 * events' pages against at once. "Back to a fresh save" clears the whole preview.
 *
 * The window holds System.json, as the window that renames it must: closing it with names unsaved asks first, and every
 * other window follows its renames without holding a copy of its own.
 * @returns {React.JSX.Element} The view.
 */
const SwitchesVariablesView = () =>
{
  const { hub, openDocument } = useMapEditorServices();
  const [ ready, setReady ] = useState(() => hub.has(SYSTEM_KEY));
  const [ problem, setProblem ] = useState<string | null>(null);

  useEffect(() =>
  {
    if (ready)
    {
      return undefined;
    }

    // the names may arrive from another window's copy, unsaved renames and all, before the file.
    let live = true;
    openDocument(SYSTEM_KEY)
      .then(() => live && setReady(true))
      .catch((error: unknown) => live && setProblem((error as Error).message));
    return () =>
    {
      live = false;
    };
  }, [ ready, openDocument ]);

  if (problem !== null)
  {
    return <Alert severity={'error'} sx={{ m: 2 }}>{`The switches and variables could not be opened: ${problem}`}</Alert>;
  }

  return ready
    ? <SwitchesVariablesWorkspace/>
    : <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress aria-label={'Opening the switches and variables'}/></Box>;
};

export { SwitchesVariablesView };
