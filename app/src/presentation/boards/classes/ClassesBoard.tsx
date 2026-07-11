import { ChangeEvent, useCallback, useRef, useState } from 'react';
import { Alert, Box, Snackbar, Stack, Tab, Tabs, TextField } from '@mui/material';
import { FixedSizeList } from 'react-window';
import { School } from '@mui/icons-material';
import { MuiSnackbarSeverity, MuiSnackbarVariant } from '@core/enums/MuiSnackbar.ts';
import { BoardEmptyState } from '@presentation/components/board/BoardEmptyState.tsx';
import { useBoardActions } from '@presentation/context/board-actions.context.tsx';
import { useClasses } from '@presentation/context/resources/classes.context.tsx';
import { RPG_ClassDomainModel } from '@core/domain/entities/RPG_ClassDomainModel.ts';
import { useProjectPath } from '@presentation/context/project-path.context.tsx';
import EditorBoardSplitLayout from '@presentation/components/board/EditorBoardSplitLayout.tsx';
import {
  type VirtualizedSidebarRow,
  VirtualizedSidebarList,
  virtualizedSidebarColumnWidth,
  VIRTUALIZED_SIDEBAR_DEFAULT_ICON_ROW_PX,
  VIRTUALIZED_SIDEBAR_DEFAULT_ITEM_SIZE,
  VIRTUALIZED_SIDEBAR_DEFAULT_LABEL_MIN_CH,
  VIRTUALIZED_SIDEBAR_DEFAULT_LIST_HEIGHT,
} from '@presentation/components/board/VirtualizedSidebarList.tsx';
import TraitEditor from '@presentation/components/traits/TraitEditor.tsx';
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';
import { ClassLearningsEditor } from '@presentation/components/classLearnings/ClassLearningsEditor.tsx';
import { AptitudeTeachingsEditor } from '@presentation/components/aptitude/AptitudeTeachingsEditor.tsx';
import { NaturalGrowthQuadrantsEditor } from '@presentation/components/naturalGrowth/NaturalGrowthQuadrantsEditor.tsx';
import RPG_Trait = Rmmz.Data.RPG_Trait;
import RPG_ClassLearning = Rmmz.Data.RPG_ClassLearning;

const noteFieldSx = { '& .MuiInputBase-input': { fontFamily: 'monospace' } };

const listColumnWidth = virtualizedSidebarColumnWidth(
  VIRTUALIZED_SIDEBAR_DEFAULT_ICON_ROW_PX,
  VIRTUALIZED_SIDEBAR_DEFAULT_LABEL_MIN_CH,
);

function ClassesBoard()
{
  const { data: classes, setData, save, reload, loading } = useClasses();
  const { rmmzDataPath } = useProjectPath();

  const [ selectedIndex, setSelectedIndex ] = useState<number>(0);
  const [ tabIndex, setTabIndex ] = useState(0);
  const [ aptitudeExpanded, setAptitudeExpanded ] = useState(false);
  const [ learningsExpanded, setLearningsExpanded ] = useState(true);
  const [ isSaving, setIsSaving ] = useState(false);
  const [ snackbar, setSnackbar ] = useState<{
    open: boolean;
    message: string;
    severity: MuiSnackbarSeverity;
    variant: MuiSnackbarVariant;
  }>({ open: false, message: '', severity: MuiSnackbarSeverity.Success, variant: MuiSnackbarVariant.Filled });

  const listRef = useRef<FixedSizeList>(null);
  const listWrapperRef = useRef<HTMLDivElement>(null);

  const selectedClass = classes[ selectedIndex ] ?? null;

  const getRow = useCallback((index: number): VirtualizedSidebarRow =>
  {
    const c = classes[ index ];
    if (!c)
    {
      return { type: 'spacer' };
    }
    return {
      type: 'item',
      label: `${c.id}: ${c.name}`,
      title: c.name,
    };
  }, [ classes ]);

  const patch = useCallback((partial: Partial<RPG_ClassDomainModel>) =>
  {
    if (selectedClass === null)
    {
      return;
    }
    const updated = Object.assign(Object.create(Object.getPrototypeOf(selectedClass)), selectedClass, partial);
    setData((prev) => prev.map((c, i) => i === selectedIndex
      ? updated
      : c));
  }, [ selectedClass, selectedIndex, setData ]);

  const handleSave = async () =>
  {
    setIsSaving(true);
    try
    {
      await save(classes);
      setSnackbar({ open: true, message: 'Classes saved.', severity: MuiSnackbarSeverity.Success, variant: MuiSnackbarVariant.Filled });
    }
    catch
    {
      setSnackbar({ open: true, message: 'Failed to save classes.', severity: MuiSnackbarSeverity.Error, variant: MuiSnackbarVariant.Filled });
    }
    finally
    {
      setIsSaving(false);
    }
  };

  const handleReload = async () =>
  {
    await reload();
    setSnackbar({ open: true, message: 'Classes reloaded.', severity: MuiSnackbarSeverity.Info, variant: MuiSnackbarVariant.Filled });
  };

  const canSave = !loading && !isSaving && !!rmmzDataPath;

  const sidebar = (
    <VirtualizedSidebarList
      ref={listRef}
      itemCount={classes.length}
      itemSize={VIRTUALIZED_SIDEBAR_DEFAULT_ITEM_SIZE}
      listHeight={VIRTUALIZED_SIDEBAR_DEFAULT_LIST_HEIGHT}
      labelMinCh={VIRTUALIZED_SIDEBAR_DEFAULT_LABEL_MIN_CH}
      selectedIndex={selectedIndex}
      getRow={getRow}
      onSelectIndex={setSelectedIndex}
      listWrapperRef={listWrapperRef}
      fillContainer
      searchable
      searchLabel={'Search classes'}
    />
  );

  useBoardActions({ onSave: handleSave, canSave, isSaving, onReload: handleReload, canReload: canSave });

  if (!selectedClass)
  {
    return (
      <EditorBoardSplitLayout sidebarColumnWidth={listColumnWidth} sidebar={sidebar}>
        <BoardEmptyState
          icon={<School sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }}/>}
          message={'Select a class from the list.'}
        />
      </EditorBoardSplitLayout>
    );
  }

  return (
    <EditorBoardSplitLayout sidebarColumnWidth={listColumnWidth} sidebar={sidebar}>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 1 }}>
        <Tabs value={tabIndex} onChange={(_, v) => setTabIndex(v)}>
          <Tab label={'Base'} id={'class-tab-0'} aria-controls={'class-tabpanel-0'}/>
          <Tab label={'Learnings'} id={'class-tab-1'} aria-controls={'class-tabpanel-1'}/>
          <Tab label={'Natural Growth'} id={'class-tab-2'} aria-controls={'class-tabpanel-2'}/>
          <Tab label={'Note'} id={'class-tab-3'} aria-controls={'class-tabpanel-3'}/>
        </Tabs>
      </Box>

      {tabIndex === 0 && (
        <Box sx={{ p: 2 }}>
          <Stack spacing={2}>
            <BoardSectionCard title={'Identity'}>
              <TextField
                label={'Name'}
                value={selectedClass.name}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch({ name: e.target.value })}
                size={'small'}
                fullWidth
              />
            </BoardSectionCard>

            <BoardSectionCard title={'Traits'}>
              <TraitEditor
                selectedTraits={selectedClass.traits}
                updateEnemyTraits={(traits: RPG_Trait[]) => patch({ traits })}
              />
            </BoardSectionCard>
          </Stack>
        </Box>
      )}

      {tabIndex === 1 && (
        <Box sx={{ p: 2 }}>
          <Stack spacing={2}>
            <ClassLearningsEditor
              learnings={selectedClass.learnings}
              onChange={(learnings: RPG_ClassLearning[]) => patch({ learnings })}
              expanded={learningsExpanded}
              onExpandedChange={setLearningsExpanded}
            />

            <AptitudeTeachingsEditor
              note={selectedClass.note}
              onNoteChange={(note: string) => patch({ note })}
              expanded={aptitudeExpanded}
              onExpandedChange={setAptitudeExpanded}
            />
          </Stack>
        </Box>
      )}

      {tabIndex === 2 && (
        <Box sx={{ p: 2 }}>
          <NaturalGrowthQuadrantsEditor
            note={selectedClass.note}
            onNoteChange={(note: string) => patch({ note })}
          />
        </Box>
      )}

      {tabIndex === 3 && (
        <Box sx={{ p: 2, height: '100%', boxSizing: 'border-box' }}>
          <TextField
            label={'Note'}
            value={selectedClass.note}
            onChange={(e: ChangeEvent<HTMLInputElement>) => patch({ note: e.target.value })}
            multiline
            fullWidth
            minRows={20}
            sx={noteFieldSx}
          />
        </Box>
      )}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
      >
        <Alert severity={snackbar.severity} variant={snackbar.variant} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </EditorBoardSplitLayout>
  );
}

export default ClassesBoard;
