import { useMemo, useRef, useState } from 'react';
import { Stack, TextField } from '@mui/material';
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
import { useBoardActions } from '@presentation/context/board-actions.context.tsx';
import { useDifficultyConfig } from '@presentation/context/resources/difficulty.context.tsx';
import { useUrlSelection } from '@presentation/hooks/useUrlSelection.ts';
import DifficultyParametersSection from '@boards/difficulty/DifficultyParametersSection.tsx';
import type { DifficultyLayer } from '@core/domain/valueObjects/difficulty-config.ts';

/**
 * Editor board for `config.difficulty.json` — the layers a player stacks to reshape a playthrough.
 *
 * A layer carries far more than this board currently shows: parameter scaling for both sides of a
 * fight, reward multipliers, access flags, and optional affix biasing. Only the name is editable
 * here for now, and everything else rides through untouched on save rather than being rebuilt from
 * what the UI happens to know about.
 */
const DifficultyBoard = () =>
{
  const {
    difficultyConfig,
    setConfig,
    save,
    reload,
    loading,
  } = useDifficultyConfig();

  const [ isSaving, setIsSaving ] = useState(false);
  const [ selectedIndex, setSelectedIndex ] = useState(0);
  const listWrapperRef = useRef<HTMLDivElement | null>(null);

  // held on the board rather than inside the section, so switching layers keeps the chosen view.
  // starts off: filtering to what a layer already changes hides every parameter it does not, which
  // is exactly the set somebody opening the board is usually here to start changing.
  const [ showOnlyModified, setShowOnlyModified ] = useState(false);

  const layers = useMemo(() =>
  {
    return difficultyConfig ?? [];
  }, [ difficultyConfig ]);

  // keeps the selected layer in the address bar, so a reload or a shared link lands back on it.
  useUrlSelection<DifficultyLayer>(
    'layerKey',
    layers,
    layer => layer.key,
    index => setSelectedIndex(index),
    () => undefined);

  const selectedLayer = useMemo(() =>
  {
    return layers[ selectedIndex ] ?? null;
  }, [ layers, selectedIndex ]);

  /**
   * Replaces the selected layer, leaving every other layer exactly as loaded.
   * @param {DifficultyLayer} next The edited layer.
   */
  const updateSelectedLayer = (next: DifficultyLayer) =>
  {
    setConfig(prev =>
    {
      const source = prev ?? layers;

      return source.map((layer, index) => (index === selectedIndex
        ? next
        : layer));
    });
  };

  /**
   * Applies a partial edit to the selected layer.
   *
   * Spreads the layer rather than naming its fields: this board reads a handful of them and the file
   * carries a dozen more, so rebuilding the object by hand would drop everything the UI does not yet
   * know about, silently, on the first save.
   * @param {Partial<DifficultyLayer>} partial The fields being changed.
   */
  const patchSelectedLayer = (partial: Partial<DifficultyLayer>) =>
  {
    if (selectedLayer === null)
    {
      return;
    }

    updateSelectedLayer({
      ...selectedLayer,
      ...partial,
    });
  };

  const handleSave = async () =>
  {
    if (difficultyConfig === null)
    {
      return;
    }

    setIsSaving(true);
    try
    {
      await save(difficultyConfig);
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

  const canSave = loading === false && difficultyConfig !== null;
  const canReload = loading === false;

  useBoardActions({
    onSave: handleSave,
    canSave,
    isSaving,
    onReload: handleReload,
    canReload,
  });

  /**
   * Resolves one sidebar row, showing the layer's own icon beside its name.
   * @param {number} index The row being drawn.
   * @returns {VirtualizedSidebarRow}
   */
  const getRow = (index: number): VirtualizedSidebarRow =>
  {
    const layer = layers[ index ];

    if (layer === undefined)
    {
      return { type: 'spacer' };
    }

    // an unnamed layer still has to be findable, and its key is the only thing guaranteed present.
    const label = layer.name.trim() === ''
      ? layer.key
      : layer.name;

    return {
      type: 'item',
      label,
      iconIndex: layer.iconIndex,
    };
  };

  return (
    <EditorBoardSplitLayout
      sidebarColumnWidth={'320px'}
      sidebar={
        <VirtualizedSidebarListRegion>
          <VirtualizedSidebarList
            itemCount={layers.length}
            itemSize={VIRTUALIZED_SIDEBAR_DEFAULT_ITEM_SIZE}
            listHeight={VIRTUALIZED_SIDEBAR_DEFAULT_LIST_HEIGHT}
            labelMinCh={VIRTUALIZED_SIDEBAR_DEFAULT_LABEL_MIN_CH}
            selectedIndex={selectedIndex}
            getRow={getRow}
            onSelectIndex={setSelectedIndex}
            listWrapperRef={listWrapperRef}
            fillContainer
            searchable
            searchLabel={'Search layers'}
          />
        </VirtualizedSidebarListRegion>
      }
    >
      {selectedLayer === null
        ? null
        : (
          <Stack spacing={2} sx={{ p: 2, maxWidth: 900, overflow: 'auto' }}>
            <BoardSectionCard title={'Identity'} subtitle={'What the player sees in the difficulty menu'}>
              <TextField
                label={'Name'}
                size={'small'}
                fullWidth
                value={selectedLayer.name}
                onChange={event => patchSelectedLayer({ name: event.target.value })}
              />
            </BoardSectionCard>

            <DifficultyParametersSection
              layer={selectedLayer}
              onChange={updateSelectedLayer}
              showOnlyModified={showOnlyModified}
              onShowOnlyModifiedChange={setShowOnlyModified}
            />
          </Stack>
        )}
    </EditorBoardSplitLayout>
  );
};

export default DifficultyBoard;
