import React, { useMemo, useState } from 'react';
import { Box, List, ListItemButton, ListItemText, Paper, TextField, Typography } from '@mui/material';
import type { CommandCatalogEntry } from '../../core/commands/catalogTypes.ts';
import type { CommandCatalog } from '../../core/commands/CommandCatalog.ts';

/**
 * How many matches the search shows at once.
 */
const RESULTS_SHOWN = 12;

/**
 * What the search takes.
 */
type CommandSearchProps = {
  readonly catalog: CommandCatalog;

  /**
   * Events using each command, by entry id, so what the project uses most comes first.
   */
  readonly usage: ReadonlyMap<string, number>;

  /**
   * What is already typed, such as the key that opened the search.
   */
  readonly initialQuery: string;

  readonly onPick: (entry: CommandCatalogEntry) => void;
  readonly onClose: () => void;
};

/**
 * Finds a command by typing: every key narrows the list, best matches first and then what the project uses most,
 * built-in and plugin commands alike. Arrows move through the matches, Enter adds the highlighted one, and Escape or
 * leaving the box gives up.
 * @param {CommandSearchProps} props The catalog, the usage counts, and what to do with a pick.
 * @returns {React.JSX.Element} The search.
 */
const CommandSearch = (props: CommandSearchProps) =>
{
  const { catalog, usage, initialQuery, onPick, onClose } = props;
  const [ query, setQuery ] = useState(initialQuery);
  const [ highlighted, setHighlighted ] = useState(0);
  const results = useMemo(() => catalog.search(query, { usage, limit: RESULTS_SHOWN }), [ catalog, query, usage ]);

  /**
   * Moves through the matches, adds one, or gives up.
   * @param {React.KeyboardEvent} event The key.
   */
  const onKeyDown = (event: React.KeyboardEvent) =>
  {
    event.stopPropagation();
    const moves: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };
    const move = moves[event.key];
    if (move !== undefined)
    {
      event.preventDefault();
      setHighlighted(current => Math.min(Math.max(current + move, 0), Math.max(results.length - 1, 0)));
      return;
    }

    if (event.key === 'Enter' && results[highlighted] !== undefined)
    {
      event.preventDefault();
      onPick(results[highlighted]);
      return;
    }

    if (event.key === 'Escape')
    {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <Box data-command-search sx={{ position: 'relative', my: 0.5 }}>
      <TextField
        autoFocus
        fullWidth
        size={'small'}
        placeholder={'Type a command: text, transfer, switch, plugin...'}
        value={query}
        onChange={event =>
        {
          setQuery(event.target.value);
          setHighlighted(0);
        }}
        onKeyDown={onKeyDown}
        onBlur={onClose}
        slotProps={{ htmlInput: { 'aria-label': 'Find a command' } }}
      />
      <Paper elevation={4} sx={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 'modal', mt: 0.5 }}>
        {results.length === 0
          ? <Typography variant={'body2'} color={'text.secondary'} sx={{ p: 1.5 }}>No command matches.</Typography>
          : (
            <List dense disablePadding role={'listbox'} aria-label={'Matching commands'}>
              {results.map((entry, position) => (
                <ListItemButton
                  key={entry.id}
                  role={'option'}
                  selected={position === highlighted}
                  aria-selected={position === highlighted}
                  onMouseDown={event => event.preventDefault()}
                  onMouseEnter={() => setHighlighted(position)}
                  onClick={() => onPick(entry)}
                >
                  <ListItemText primary={entry.name} secondary={entry.category}/>
                </ListItemButton>
              ))}
            </List>
          )}
      </Paper>
    </Box>
  );
};

export { CommandSearch };
