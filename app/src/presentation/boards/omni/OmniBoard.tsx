import { useMemo, useRef, useState } from 'react';
import { Button, FormControlLabel, IconButton, Stack, Switch, TextField, Tooltip, Typography } from '@mui/material';
import { Add, ArrowDownward, ArrowUpward, DeleteOutline } from '@mui/icons-material';
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
import { IconIndexField } from '@presentation/components/icons/IconIndexField.tsx';
import { useBoardActions } from '@presentation/context/board-actions.context.tsx';
import { useOmniConfig } from '@presentation/context/resources/omni.context.tsx';
import { useUrlSelection } from '@presentation/hooks/useUrlSelection.ts';
import { createMonsterType, moveMonsterType } from '@core/domain/valueObjects/omni-config.ts';
import type { MonsterTypeDefinition } from '@core/domain/valueObjects/omni-config.ts';

/**
 * Editor board for `config.omni.json`, the Omnipedia's settings: the pages the Monsterpedia flips between.
 *
 * Each page lists one kind of entry, and each enemy says which kind it is. A page is a key, the name shown above the
 * list while it is open, an icon, and whether its entries show their stats; the order of the pages is the order the
 * game flips through them, so the board moves pages as well as editing them.
 */
const OmniBoard = () =>
{
  const {
    omniConfig,
    setConfig,
    save,
    reload,
    loading,
    hasUnsavedEdits,
  } = useOmniConfig();

  const [ isSaving, setIsSaving ] = useState(false);
  const [ selectedIndex, setSelectedIndex ] = useState(0);
  const listWrapperRef = useRef<HTMLDivElement | null>(null);

  const monsterTypes = useMemo(() =>
  {
    return omniConfig?.monsterTypes ?? [];
  }, [ omniConfig ]);

  // keeps the selected page in the address bar, so a reload or a shared link lands back on it.
  useUrlSelection<MonsterTypeDefinition>(
    'pageKey',
    monsterTypes,
    monsterType => monsterType.key,
    index => setSelectedIndex(index),
    () => undefined);

  const selectedType = useMemo(() =>
  {
    return monsterTypes[ selectedIndex ] ?? null;
  }, [ monsterTypes, selectedIndex ]);

  /**
   * Replaces the list of pages, leaving the rest of the file exactly as loaded.
   * @param {(current: MonsterTypeDefinition[]) => MonsterTypeDefinition[]} change Builds the new list from the current one.
   */
  const changeMonsterTypes = (change: (current: MonsterTypeDefinition[]) => MonsterTypeDefinition[]) =>
  {
    setConfig(prev =>
    {
      const source = prev ?? { monsterTypes };

      return { ...source, monsterTypes: change(source.monsterTypes) };
    });
  };

  /**
   * Applies a partial edit to the selected page, leaving every other page exactly as loaded.
   * @param {Partial<MonsterTypeDefinition>} partial The fields being changed.
   */
  const patchSelectedType = (partial: Partial<MonsterTypeDefinition>) =>
  {
    if (selectedType === null)
    {
      return;
    }

    changeMonsterTypes(current => current.map((monsterType, index) => (index === selectedIndex
      ? { ...monsterType, ...partial }
      : monsterType)));
  };

  /**
   * Adds an empty page under a key nothing else uses, at the end of the order, and selects it.
   */
  const handleAdd = () =>
  {
    const added = createMonsterType(monsterTypes);

    changeMonsterTypes(current => [ ...current, added ]);
    setSelectedIndex(monsterTypes.length);
  };

  /**
   * Removes the selected page, and selects the one before it.
   */
  const handleDelete = () =>
  {
    if (selectedType === null)
    {
      return;
    }

    changeMonsterTypes(current => current.toSpliced(selectedIndex, 1));
    setSelectedIndex(Math.max(0, selectedIndex - 1));
  };

  /**
   * Moves the selected page a step through the order, and keeps it selected where it lands.
   * @param {number} step -1 to move it earlier, 1 to move it later.
   */
  const handleMove = (step: number) =>
  {
    const destination = selectedIndex + step;

    if (destination < 0 || destination >= monsterTypes.length)
    {
      return;
    }

    changeMonsterTypes(current => moveMonsterType(current, selectedIndex, step));
    setSelectedIndex(destination);
  };

  const handleSave = async () =>
  {
    if (omniConfig === null)
    {
      return;
    }

    setIsSaving(true);
    try
    {
      await save(omniConfig);
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

  const canSave = loading === false && hasUnsavedEdits;
  const canReload = loading === false;

  useBoardActions({
    onSave: handleSave,
    canSave,
    isSaving,
    onReload: handleReload,
    canReload,
  });

  /**
   * Resolves one sidebar row, named by the page's name, or by its key while it has none.
   * @param {number} index The row being drawn.
   * @returns {VirtualizedSidebarRow}
   */
  const getRow = (index: number): VirtualizedSidebarRow =>
  {
    const monsterType = monsterTypes[ index ];

    if (monsterType === undefined)
    {
      return { type: 'spacer' };
    }

    return {
      type: 'item',
      label: monsterType.name === '' ? monsterType.key : monsterType.name,
    };
  };

  return (
    <EditorBoardSplitLayout
      sidebarColumnWidth={'320px'}
      sidebar={
        <VirtualizedSidebarListRegion>
          <VirtualizedSidebarList
            itemCount={monsterTypes.length}
            itemSize={VIRTUALIZED_SIDEBAR_DEFAULT_ITEM_SIZE}
            listHeight={VIRTUALIZED_SIDEBAR_DEFAULT_LIST_HEIGHT}
            labelMinCh={VIRTUALIZED_SIDEBAR_DEFAULT_LABEL_MIN_CH}
            selectedIndex={selectedIndex}
            getRow={getRow}
            onSelectIndex={setSelectedIndex}
            listWrapperRef={listWrapperRef}
            fillContainer
            searchable
            searchLabel={'Search pages'}
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
            Add Page
          </Button>
          {selectedType === null
            ? null
            : (
              <>
                <Tooltip title={'Move earlier'}>
                  <span>
                    <IconButton disabled={selectedIndex === 0} onClick={() => handleMove(-1)}>
                      <ArrowUpward/>
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title={'Move later'}>
                  <span>
                    <IconButton disabled={selectedIndex === monsterTypes.length - 1} onClick={() => handleMove(1)}>
                      <ArrowDownward/>
                    </IconButton>
                  </span>
                </Tooltip>
                <IconButton color={'error'} onClick={handleDelete}>
                  <DeleteOutline/>
                </IconButton>
              </>
            )}
        </Stack>

        {selectedType === null
          ? null
          : (
            <BoardSectionCard title={'Monsterpedia Page'} subtitle={'One kind of entry, listed on a page of its own'}>
              <Stack spacing={1.5}>
                <KeyTextField
                  value={selectedType.key}
                  onChange={value => patchSelectedType({ key: value })}
                />
                <TextField
                  label={'Name'}
                  size={'small'}
                  fullWidth
                  value={selectedType.name}
                  helperText={'Shown above the list while this page is open.'}
                  onChange={event => patchSelectedType({ name: event.target.value })}
                />
                <IconIndexField
                  value={selectedType.iconIndex}
                  onChange={next => patchSelectedType({ iconIndex: next })}
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={selectedType.showsStats}
                      onChange={event => patchSelectedType({ showsStats: event.target.checked })}
                    />
                  }
                  label={selectedType.showsStats
                    ? 'Each entry shows its level and stats'
                    : 'Entries leave out their level and stats'}
                />
                <Typography variant={'caption'} color={'text.secondary'}>
                  Each enemy is filed under one of these pages by its key, and an enemy filed under none of them is an
                  ordinary monster, listed on the page keyed "enemy". The game flips through the pages in this order,
                  and opens the Monsterpedia on the first.
                </Typography>
              </Stack>
            </BoardSectionCard>
          )}
      </Stack>
    </EditorBoardSplitLayout>
  );
};

export default OmniBoard;
