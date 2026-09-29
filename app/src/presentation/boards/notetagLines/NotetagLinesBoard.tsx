import { useMemo, useRef, useState } from 'react';
import { Button, IconButton, Stack, TextField, Typography } from '@mui/material';
import { Add, DeleteOutline } from '@mui/icons-material';
import EditorBoardSplitLayout from '@presentation/components/board/EditorBoardSplitLayout.tsx';
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';
import {
  VIRTUALIZED_SIDEBAR_DEFAULT_ITEM_SIZE,
  VIRTUALIZED_SIDEBAR_DEFAULT_LABEL_MIN_CH,
  VIRTUALIZED_SIDEBAR_DEFAULT_LIST_HEIGHT,
  VirtualizedSidebarList,
  VirtualizedSidebarListRegion,
} from '@presentation/components/board/VirtualizedSidebarList.tsx';
import type { VirtualizedSidebarRow } from '@presentation/components/board/VirtualizedSidebarList.tsx';
import KeyTextField from '@components/core/KeyTextField.tsx';
import { useBoardActions } from '@presentation/context/board-actions.context.tsx';
import { useNotetagLinesConfig } from '@presentation/context/resources/notetag-lines.context.tsx';
import { useUrlSelection } from '@presentation/hooks/useUrlSelection.ts';
import { createNotetagLine } from '@core/domain/valueObjects/notetag-lines-config.ts';
import type { NotetagLineTemplate } from '@core/domain/valueObjects/notetag-lines-config.ts';

/**
 * Editor board for `config.notetag-lines.json` — the sentence each effect reads as, wherever the game lists what a
 * state does.
 *
 * The words are the author's and the numbers are the game's, so each line is a key and a sentence and nothing
 * else: the game fills in every token when it draws the line, which is why a rebalance never needs a visit here.
 */
const NotetagLinesBoard = () =>
{
  const {
    notetagLinesConfig,
    setConfig,
    save,
    reload,
    loading,
  } = useNotetagLinesConfig();

  const [ isSaving, setIsSaving ] = useState(false);
  const [ selectedIndex, setSelectedIndex ] = useState(0);
  const listWrapperRef = useRef<HTMLDivElement | null>(null);

  const lines = useMemo(() =>
  {
    return notetagLinesConfig ?? [];
  }, [ notetagLinesConfig ]);

  // keeps the selected line in the address bar, so a reload or a shared link lands back on it.
  useUrlSelection<NotetagLineTemplate>(
    'lineKey',
    lines,
    line => line.key,
    index => setSelectedIndex(index),
    () => undefined);

  const selectedLine = useMemo(() =>
  {
    return lines[ selectedIndex ] ?? null;
  }, [ lines, selectedIndex ]);

  /**
   * Applies a partial edit to the selected line, leaving every other line exactly as loaded.
   * @param {Partial<NotetagLineTemplate>} partial The fields being changed.
   */
  const patchSelectedLine = (partial: Partial<NotetagLineTemplate>) =>
  {
    if (selectedLine === null)
    {
      return;
    }

    setConfig(prev =>
    {
      const source = prev ?? lines;

      return source.map((line, index) => (index === selectedIndex
        ? { ...line, ...partial }
        : line));
    });
  };

  /**
   * Adds an empty line under a key nothing else uses, and selects it.
   */
  const handleAdd = () =>
  {
    const added = createNotetagLine(lines);

    setConfig(prev => [ ...(prev ?? lines), added ]);
    setSelectedIndex(lines.length);
  };

  /**
   * Removes the selected line, and selects the one before it.
   */
  const handleDelete = () =>
  {
    if (selectedLine === null)
    {
      return;
    }

    setConfig(prev => (prev ?? lines).toSpliced(selectedIndex, 1));
    setSelectedIndex(Math.max(0, selectedIndex - 1));
  };

  const handleSave = async () =>
  {
    if (notetagLinesConfig === null)
    {
      return;
    }

    setIsSaving(true);
    try
    {
      await save(notetagLinesConfig);
    }
    finally
    {
      setIsSaving(false);
    }
  };

  const handleReload = async () =>
  {
    await reload();
  };

  const canSave = loading === false && notetagLinesConfig !== null;
  const canReload = loading === false;

  useBoardActions({
    onSave: handleSave,
    canSave,
    isSaving,
    onReload: handleReload,
    canReload,
  });

  /**
   * Resolves one sidebar row, named by the line's key.
   * @param {number} index The row being drawn.
   * @returns {VirtualizedSidebarRow}
   */
  const getRow = (index: number): VirtualizedSidebarRow =>
  {
    const line = lines[ index ];

    if (line === undefined)
    {
      return { type: 'spacer' };
    }

    return {
      type: 'item',
      label: line.key,
    };
  };

  return (
    <EditorBoardSplitLayout
      sidebarColumnWidth={'320px'}
      sidebar={
        <VirtualizedSidebarListRegion>
          <VirtualizedSidebarList
            itemCount={lines.length}
            itemSize={VIRTUALIZED_SIDEBAR_DEFAULT_ITEM_SIZE}
            listHeight={VIRTUALIZED_SIDEBAR_DEFAULT_LIST_HEIGHT}
            labelMinCh={VIRTUALIZED_SIDEBAR_DEFAULT_LABEL_MIN_CH}
            selectedIndex={selectedIndex}
            getRow={getRow}
            onSelectIndex={setSelectedIndex}
            listWrapperRef={listWrapperRef}
            fillContainer
            searchable
            searchLabel={'Search lines'}
          />
        </VirtualizedSidebarListRegion>
      }
    >
      <Stack spacing={2} sx={{ p: 2, maxWidth: 900, overflow: 'auto' }}>
        <Stack direction={'row'} spacing={1}>
          <Button
            startIcon={<Add/>}
            variant={'outlined'}
            onClick={handleAdd}
          >
            Add Line
          </Button>
          {selectedLine === null
            ? null
            : (
              <IconButton color={'error'} onClick={handleDelete}>
                <DeleteOutline/>
              </IconButton>
            )}
        </Stack>

        {selectedLine === null
          ? null
          : (
            <BoardSectionCard title={'Line'} subtitle={'How this effect reads wherever the game lists it'}>
              <Stack spacing={1.5}>
                <KeyTextField
                  value={selectedLine.key}
                  onChange={value => patchSelectedLine({ key: value })}
                />
                <TextField
                  label={'Words'}
                  size={'small'}
                  fullWidth
                  multiline
                  rows={2}
                  value={selectedLine.template}
                  onChange={event => patchSelectedLine({ template: event.target.value })}
                />
                <Typography variant={'caption'} color={'text.secondary'}>
                  {'{value}'} is the number, colored by whether it helps or hurts whoever carries it. Every other
                  word in braces is filled in from the effect itself, so it always matches the game. Leave the words
                  empty and the effect says nothing at all.
                </Typography>
              </Stack>
            </BoardSectionCard>
          )}
      </Stack>
    </EditorBoardSplitLayout>
  );
};

export default NotetagLinesBoard;
