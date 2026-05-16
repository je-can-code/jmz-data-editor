import React, { ChangeEvent, useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  type SelectChangeEvent,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { FixedSizeList } from 'react-window';
import { Shield } from '@mui/icons-material';
import { MuiSnackbarSeverity, MuiSnackbarVariant } from '@core/enums/MuiSnackbar.ts';
import SaveButton from '../../../components/core/SaveButton.tsx';
import ReloadButton from '../../../components/core/ReloadButton.tsx';
import NumberInputWithLabel from '../../../components/core/NumberInputWithLabel.tsx';
import { useArmors } from '@presentation/context/resources/armors.context.tsx';
import { RPG_ArmorDomainModel } from '@core/domain/entities/RPG_ArmorDomainModel.ts';
import { useProjectPath } from '@presentation/context/project-path.context.tsx';
import { IconIndexField } from '@presentation/components/icons/IconIndexField.tsx';
import EditorBoardSplitLayout from '@presentation/components/board/EditorBoardSplitLayout.tsx';
import {
  type VirtualizedSidebarRow,
  VirtualizedSidebarList,
  virtualizedSidebarColumnWidth,
  VIRTUALIZED_SIDEBAR_DEFAULT_ITEM_SIZE,
  VIRTUALIZED_SIDEBAR_DEFAULT_LABEL_MIN_CH,
  VIRTUALIZED_SIDEBAR_DEFAULT_LIST_HEIGHT,
  VIRTUALIZED_SIDEBAR_DEFAULT_ICON_ROW_PX,
} from '@presentation/components/board/VirtualizedSidebarList.tsx';
import TraitEditor from '@presentation/components/traits/TraitEditor.tsx';
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';
import { SystemService } from '@services/SystemService.ts';
import RPG_Trait = Rmmz.Data.RPG_Trait;

const noteFieldSx = { '& .MuiInputBase-input': { fontFamily: 'monospace' } };

const PARAM_LABELS = [ 'Max HP', 'Max MP', 'ATK', 'DEF', 'MAT', 'MDF', 'AGI', 'LUK' ];

const listColumnWidth = virtualizedSidebarColumnWidth(
  VIRTUALIZED_SIDEBAR_DEFAULT_ICON_ROW_PX,
  VIRTUALIZED_SIDEBAR_DEFAULT_LABEL_MIN_CH,
);

function parseIntInput(raw: string, fallback: number): number
{
  const n = parseInt(raw, 10);
  return Number.isFinite(n)
    ? n
    : fallback;
}

function buildTypeOptions(names: readonly string[] | undefined, fallbackPrefix: string): { value: number; label: string }[]
{
  if (!names || names.length === 0)
  {
    return [ { value: 0, label: 'None' } ];
  }
  return names.map((name, i) => ({
    value: i,
    label: name.trim().length > 0
      ? name
      : (i === 0
        ? 'None'
        : `${fallbackPrefix} ${i}`),
  }));
}

function ArmorsBoard()
{
  const { data: armors, setData, save, reload, loading } = useArmors();
  const { rmmzDataPath } = useProjectPath();

  const [ selectedIndex, setSelectedIndex ] = useState<number>(0);
  const [ tabIndex, setTabIndex ] = useState(0);
  const [ isSaving, setIsSaving ] = useState(false);
  const [ snackbar, setSnackbar ] = useState<{
    open: boolean;
    message: string;
    severity: MuiSnackbarSeverity;
    variant: MuiSnackbarVariant;
  }>({ open: false, message: '', severity: MuiSnackbarSeverity.Success, variant: MuiSnackbarVariant.Filled });

  const listRef = useRef<FixedSizeList>(null);
  const listWrapperRef = useRef<HTMLDivElement>(null);

  const selectedArmor = armors[ selectedIndex ] ?? null;

  const armorTypeOptions = useMemo(
    () => buildTypeOptions(SystemService.armorTypes, 'Armor Type'),
    [],
  );

  const equipTypeOptions = useMemo(
    () => buildTypeOptions(SystemService.equipTypes, 'Equip Slot'),
    [],
  );

  const getRow = useCallback((index: number): VirtualizedSidebarRow =>
  {
    const a = armors[ index ];
    if (!a)
    {
      return { type: 'spacer' };
    }
    return {
      type: 'item',
      label: `${a.id}: ${a.name}`,
      title: a.name,
      iconIndex: a.iconIndex,
    };
  }, [ armors ]);

  const patch = useCallback((partial: Partial<RPG_ArmorDomainModel>) =>
  {
    if (selectedArmor === null)
    {
      return;
    }
    const updated = Object.assign(Object.create(Object.getPrototypeOf(selectedArmor)), selectedArmor, partial);
    setData((prev) => prev.map((a, i) => i === selectedIndex
      ? updated
      : a));
  }, [ selectedArmor, selectedIndex, setData ]);

  const handleSave = async () =>
  {
    setIsSaving(true);
    try
    {
      await save(armors);
      setSnackbar({ open: true, message: 'Armors saved.', severity: MuiSnackbarSeverity.Success, variant: MuiSnackbarVariant.Filled });
    }
    catch
    {
      setSnackbar({ open: true, message: 'Failed to save armors.', severity: MuiSnackbarSeverity.Error, variant: MuiSnackbarVariant.Filled });
    }
    finally
    {
      setIsSaving(false);
    }
  };

  const handleReload = async () =>
  {
    await reload();
    setSnackbar({ open: true, message: 'Armors reloaded.', severity: MuiSnackbarSeverity.Info, variant: MuiSnackbarVariant.Filled });
  };

  const canSave = !loading && !isSaving && !!rmmzDataPath;

  const sidebar = (
    <VirtualizedSidebarList
      ref={listRef}
      itemCount={armors.length}
      itemSize={VIRTUALIZED_SIDEBAR_DEFAULT_ITEM_SIZE}
      listHeight={VIRTUALIZED_SIDEBAR_DEFAULT_LIST_HEIGHT}
      labelMinCh={VIRTUALIZED_SIDEBAR_DEFAULT_LABEL_MIN_CH}
      selectedIndex={selectedIndex}
      getRow={getRow}
      onSelectIndex={setSelectedIndex}
      listWrapperRef={listWrapperRef}
      fillContainer
    />
  );

  if (!selectedArmor)
  {
    return (
      <EditorBoardSplitLayout sidebarColumnWidth={listColumnWidth} sidebar={sidebar}>
        <SaveButton handleSave={handleSave} canSave={canSave} isSaving={isSaving} extraSaveText={'Armor Data'}/>
        <ReloadButton handleReload={handleReload} canReload={canSave}/>
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <Shield sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }}/>
          <Typography color={'text.secondary'}>Select an armor from the list.</Typography>
        </Box>
      </EditorBoardSplitLayout>
    );
  }

  return (
    <EditorBoardSplitLayout sidebarColumnWidth={listColumnWidth} sidebar={sidebar}>
      <SaveButton handleSave={handleSave} canSave={canSave} isSaving={isSaving} extraSaveText={'Armor Data'}/>
      <ReloadButton handleReload={handleReload} canReload={canSave}/>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 1 }}>
        <Tabs value={tabIndex} onChange={(_, v) => setTabIndex(v)}>
          <Tab label={'Base'} id={'armor-tab-0'} aria-controls={'armor-tabpanel-0'}/>
          <Tab label={'Note'} id={'armor-tab-1'} aria-controls={'armor-tabpanel-1'}/>
        </Tabs>
      </Box>

      {tabIndex === 0 && (
        <Stack spacing={2} sx={{ p: 2 }}>
          <BoardSectionCard title={'Identity'}>
            <Grid container spacing={2} alignItems={'flex-start'}>
              <Grid size={1}>
                <IconIndexField
                  value={selectedArmor.iconIndex}
                  onChange={(v) => patch({ iconIndex: v })}
                />
              </Grid>
              <Grid size={5}>
                <TextField
                  label={'Name'}
                  value={selectedArmor.name}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => patch({ name: e.target.value })}
                  size={'small'}
                  fullWidth
                />
              </Grid>
              <Grid size={6}>
                <TextField
                  label={'Description'}
                  value={selectedArmor.description}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => patch({ description: e.target.value })}
                  size={'small'}
                  fullWidth
                  multiline
                  minRows={2}
                />
              </Grid>
            </Grid>
          </BoardSectionCard>

          <BoardSectionCard title={'Armor'}>
            <Grid container spacing={2} alignItems={'flex-start'}>
              <Grid size={4}>
                <FormControl size={'small'} fullWidth>
                  <InputLabel id={'armor-atype-label'}>Armor Type</InputLabel>
                  <Select<number>
                    labelId={'armor-atype-label'}
                    label={'Armor Type'}
                    value={selectedArmor.atypeId}
                    onChange={(e: SelectChangeEvent<number>) =>
                    {
                      const v = typeof e.target.value === 'string'
                        ? parseInt(e.target.value, 10)
                        : e.target.value;
                      patch({ atypeId: v });
                    }}
                  >
                    {armorTypeOptions.map((o) => (
                      <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={5}>
                <FormControl size={'small'} fullWidth>
                  <InputLabel id={'armor-etype-label'}>Equip Slot</InputLabel>
                  <Select<number>
                    labelId={'armor-etype-label'}
                    label={'Equip Slot'}
                    value={selectedArmor.etypeId}
                    onChange={(e: SelectChangeEvent<number>) =>
                    {
                      const v = typeof e.target.value === 'string'
                        ? parseInt(e.target.value, 10)
                        : e.target.value;
                      patch({ etypeId: v });
                    }}
                  >
                    {equipTypeOptions.map((o) => (
                      <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={3}>
                <NumberInputWithLabel
                  label={'Price'}
                  value={selectedArmor.price}
                  onChangeEventHandler={(e) => patch({ price: parseIntInput(e.target.value, 0) })}
                  variant={'outlined'}
                  size={'small'}
                  fullWidth
                />
              </Grid>
            </Grid>
          </BoardSectionCard>

          <BoardSectionCard title={'Parameters'}>
            <Grid container spacing={1.5} alignItems={'flex-start'}>
              {PARAM_LABELS.map((label, i) => (
                <Grid size={3} key={i}>
                  <NumberInputWithLabel
                    label={label}
                    value={selectedArmor.params[ i ] ?? 0}
                    onChangeEventHandler={(e) =>
                    {
                      const next = [ ...selectedArmor.params ];
                      next[ i ] = parseIntInput(e.target.value, 0);
                      patch({ params: next });
                    }}
                    variant={'outlined'}
                    size={'small'}
                    fullWidth
                  />
                </Grid>
              ))}
              <Grid size={3}>
                <NumberInputWithLabel
                  label={'Max TP'}
                  value={selectedArmor.maxTp}
                  onChangeEventHandler={(e) => patch({ maxTp: parseIntInput(e.target.value, 0) })}
                  variant={'outlined'}
                  size={'small'}
                  fullWidth
                />
              </Grid>
            </Grid>
          </BoardSectionCard>

          <BoardSectionCard title={'Traits'}>
            <TraitEditor
              selectedTraits={selectedArmor.traits}
              updateEnemyTraits={(traits: RPG_Trait[]) => patch({ traits })}
            />
          </BoardSectionCard>
        </Stack>
      )}

      {tabIndex === 1 && (
        <Box sx={{ p: 2, height: '100%', boxSizing: 'border-box' }}>
          <TextField
            label={'Note'}
            value={selectedArmor.note}
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

export default ArmorsBoard;
