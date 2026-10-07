import React, { useState } from 'react';
import { Box, Divider, IconButton, NativeSelect, Stack, TextField, Typography } from '@mui/material';
import { ChevronRight, ExpandMore } from '@mui/icons-material';
import type { PreviewKindDefinition } from '../../core/modules/PluginModule.ts';
import type { GamePreview } from '../../core/preview/GamePreview.ts';
import { entriesMatching, type PreviewChoice, type PreviewEntry } from '../../core/preview/previewList.ts';

/**
 * How wide the space before an entry's name is, where its opening arrow sits, in pixels, so every name lines up whether
 * or not its entry has lines to open onto.
 */
const ARROW_WIDTH = 28;

/**
 * How tall a list's heading is, in pixels: as tall as the small Maximum box in the switches' and the variables' headings
 * beside it, so every list's search box lines up.
 */
const HEADING_HEIGHT = 40;

/**
 * What a module's list draws with: its kind, the window's preview, and where a choice goes.
 */
type PreviewKindPanelProps = {
  readonly kind: PreviewKindDefinition;
  readonly preview: GamePreview;
  readonly onChoose: (key: string, choice: string, option: string) => void;
};

/**
 * One choice: its options in a drop-down, outlined as a set variable's box is while the author has set it.
 * @param {{ choice: PreviewChoice, onPick: (option: string) => void }} props The choice, and where a pick goes.
 * @returns {React.JSX.Element} The drop-down.
 */
const ChoiceSelect = (props: { readonly choice: PreviewChoice; readonly onPick: (option: string) => void }) =>
{
  const { choice, onPick } = props;
  return (
    <NativeSelect
      disableUnderline
      inputProps={{ 'aria-label': choice.label }}
      onChange={event => onPick(event.target.value)}
      size={'small'}
      sx={{ flex: 'none', px: 1, border: 1, borderColor: choice.set ? 'warning.main' : 'divider', borderRadius: 1, typography: 'body2' }}
      value={choice.value}
    >
      {choice.options.map(option => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </NativeSelect>
  );
};

/**
 * One entry: its arrow, when it has lines to open onto, its name with its key beneath, and its own choice; then, while it
 * is open, each of its lines with its number, what it is, and its choice.
 * @param {{ entry: PreviewEntry, open: boolean, onToggle: () => void, onChoose: (choice: string, option: string) => void }}
 * props The entry, whether it is open, what opening or closing it does, and where a choice goes.
 * @returns {React.JSX.Element} The entry.
 */
const EntryRows = (props: {
  readonly entry: PreviewEntry;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly onChoose: (choice: string, option: string) => void;
}) =>
{
  const { entry, open, onToggle, onChoose } = props;
  return (
    <Box data-testid={`preview-entry-${entry.key}`}>
      <Stack direction={'row'} spacing={1} alignItems={'center'} sx={{ px: 1, py: 0.5 }}>
        {entry.rows.length > 0
          ? (
            <IconButton aria-expanded={open} aria-label={entry.title} onClick={onToggle} size={'small'} sx={{ width: ARROW_WIDTH, flex: 'none' }}>
              {open ? <ExpandMore fontSize={'small'}/> : <ChevronRight fontSize={'small'}/>}
            </IconButton>
          )
          : <Box sx={{ width: ARROW_WIDTH, flex: 'none' }}/>}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant={'body2'} noWrap title={entry.title}>
            {entry.title}
          </Typography>
          <Typography variant={'caption'} color={'text.secondary'} noWrap component={'div'}>
            {entry.detail}
          </Typography>
        </Box>
        <ChoiceSelect choice={entry.choice} onPick={option => onChoose(entry.choice.id, option)}/>
      </Stack>
      {open && entry.rows.map(row => (
        <Stack key={row.choice.id} direction={'row'} spacing={1} alignItems={'center'} sx={{ pl: 5, pr: 1, py: 0.25 }}>
          <Typography variant={'caption'} color={'text.secondary'} sx={{ width: 24, flex: 'none', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            {row.label}
          </Typography>
          <Typography variant={'body2'} noWrap title={row.detail} sx={{ flex: 1, minWidth: 0 }}>
            {row.detail}
          </Typography>
          <ChoiceSelect choice={row.choice} onPick={option => onChoose(row.choice.id, option)}/>
        </Stack>
      ))}
    </Box>
  );
};

/**
 * The list of one kind of state a plugin module lets the preview set, beside the switches and variables: its heading,
 * saying how many things of it are set, a search by whatever names each thing, and every thing the module lists, each
 * opening onto its lines. Every choice changes the window's preview at once, and nothing here is ever written to the
 * game; what each choice sets is the module's to work out.
 * @param {PreviewKindPanelProps} props The kind, the preview, and where a choice goes.
 * @returns {React.JSX.Element} The list.
 */
const PreviewKindPanel = (props: PreviewKindPanelProps) =>
{
  const { kind, preview, onChoose } = props;
  const [ search, setSearch ] = useState('');
  const [ opened, setOpened ] = useState<ReadonlySet<string>>(() => new Set());
  const entries = entriesMatching(kind.entries(preview), search);
  const set = preview.count(kind.id);

  /**
   * Opens an entry, or closes it when it is open.
   * @param {string} key The entry's key.
   */
  const toggle = (key: string) =>
  {
    setOpened(current =>
    {
      const next = new Set(current);
      if (next.has(key))
      {
        next.delete(key);
      }
      else
      {
        next.add(key);
      }

      return next;
    });
  };

  return (
    <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }} aria-label={kind.title} role={'region'}>
      <Box sx={{ px: 1.5, pt: 1.5, pb: 1 }}>
        <Stack direction={'row'} alignItems={'center'} sx={{ minHeight: HEADING_HEIGHT }}>
          <Typography variant={'subtitle1'}>
            {kind.title}
            {set > 0 && (
              <Typography component={'span'} variant={'body2'} color={'warning.main'} sx={{ ml: 1 }}>
                {`${set} ${kind.nouns.state}`}
              </Typography>
            )}
          </Typography>
        </Stack>
      </Box>
      <Box sx={{ px: 1.5, pb: 1 }}>
        <TextField
          fullWidth
          onChange={event => setSearch(event.target.value)}
          placeholder={kind.searchHint}
          size={'small'}
          value={search}
        />
      </Box>
      <Divider/>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {entries.length === 0
          ? <Typography sx={{ p: 2 }} color={'text.secondary'}>{kind.noMatch}</Typography>
          : entries.map(entry => (
            <EntryRows
              key={entry.key}
              entry={entry}
              open={opened.has(entry.key)}
              onToggle={() => toggle(entry.key)}
              onChoose={(choice, option) => onChoose(entry.key, choice, option)}
            />
          ))}
      </Box>
    </Box>
  );
};

export { PreviewKindPanel };
