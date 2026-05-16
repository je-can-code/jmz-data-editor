import React, { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
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
import { Build } from '@mui/icons-material';
import { MuiSnackbarSeverity, MuiSnackbarVariant } from '@core/enums/MuiSnackbar.ts';
import SaveButton from '../../../components/core/SaveButton.tsx';
import ReloadButton from '../../../components/core/ReloadButton.tsx';
import NumberInputWithLabel from '../../../components/core/NumberInputWithLabel.tsx';
import { useWeapons } from '@presentation/context/resources/weapons.context.tsx';
import { RPG_WeaponDomainModel } from '@core/domain/entities/RPG_WeaponDomainModel.ts';
import {
  type RmmzSkillAnimationOption,
  skillAnimationAutocompleteOptionsForSkill,
  skillAnimationOptionForValue,
} from '@core/enums/RmmzSkillAnimation.ts';
import {
  type RmmzWeaponTypeOption,
  weaponTypeAutocompleteOptions,
  weaponTypeOptionForValue,
} from '@core/enums/RmmzWeaponType.ts';
import { useProjectPath } from '@presentation/context/project-path.context.tsx';
import { IconIndexField } from '@presentation/components/icons/IconIndexField.tsx';
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

function WeaponsBoard()
{
  const { data: weapons, setData, save, reload, loading } = useWeapons();
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

  const selectedWeapon = weapons[ selectedIndex ] ?? null;

  const animationOptions = useMemo(
    () => skillAnimationAutocompleteOptionsForSkill(
      selectedWeapon?.animationId ?? 0,
      SystemService.skillAnimationAutocompleteOptions,
    ),
    [ selectedWeapon?.animationId ],
  );

  const animationValue = useMemo(
    () => skillAnimationOptionForValue(
      selectedWeapon?.animationId ?? 0,
      SystemService.skillAnimationAutocompleteOptions,
    ),
    [ selectedWeapon?.animationId ],
  );

  const weaponTypeOptions = useMemo(
    () => weaponTypeAutocompleteOptions(
      selectedWeapon?.wtypeId ?? 0,
      SystemService.weaponTypes,
    ),
    [ selectedWeapon?.wtypeId ],
  );

  const weaponTypeValue = useMemo(
    () => weaponTypeOptionForValue(
      selectedWeapon?.wtypeId ?? 0,
      SystemService.weaponTypes,
    ),
    [ selectedWeapon?.wtypeId ],
  );

  const getRow = useCallback((index: number): VirtualizedSidebarRow =>
  {
    const w = weapons[ index ];
    if (!w)
    {
      return { type: 'spacer' };
    }
    return {
      type: 'item',
      label: `${w.id}: ${w.name}`,
      title: w.name,
      iconIndex: w.iconIndex,
    };
  }, [ weapons ]);

  const patch = useCallback((partial: Partial<RPG_WeaponDomainModel>) =>
  {
    if (selectedWeapon === null)
    {
      return;
    }
    const updated = Object.assign(Object.create(Object.getPrototypeOf(selectedWeapon)), selectedWeapon, partial);
    setData((prev) => prev.map((w, i) => i === selectedIndex
      ? updated
      : w));
  }, [ selectedWeapon, selectedIndex, setData ]);

  const handleSave = async () =>
  {
    setIsSaving(true);
    try
    {
      await save(weapons);
      setSnackbar({ open: true, message: 'Weapons saved.', severity: MuiSnackbarSeverity.Success, variant: MuiSnackbarVariant.Filled });
    }
    catch
    {
      setSnackbar({ open: true, message: 'Failed to save weapons.', severity: MuiSnackbarSeverity.Error, variant: MuiSnackbarVariant.Filled });
    }
    finally
    {
      setIsSaving(false);
    }
  };

  const handleReload = async () =>
  {
    await reload();
    setSnackbar({ open: true, message: 'Weapons reloaded.', severity: MuiSnackbarSeverity.Info, variant: MuiSnackbarVariant.Filled });
  };

  const canSave = !loading && !isSaving && !!rmmzDataPath;

  const sidebar = (
    <VirtualizedSidebarList
      ref={listRef}
      itemCount={weapons.length}
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

  if (!selectedWeapon)
  {
    return (
      <EditorBoardSplitLayout sidebarColumnWidth={listColumnWidth} sidebar={sidebar}>
        <SaveButton handleSave={handleSave} canSave={canSave} isSaving={isSaving} extraSaveText={'Weapon Data'}/>
        <ReloadButton handleReload={handleReload} canReload={canSave}/>
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <Build sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }}/>
          <Typography color={'text.secondary'}>Select a weapon from the list.</Typography>
        </Box>
      </EditorBoardSplitLayout>
    );
  }

  return (
    <EditorBoardSplitLayout sidebarColumnWidth={listColumnWidth} sidebar={sidebar}>
      <SaveButton handleSave={handleSave} canSave={canSave} isSaving={isSaving} extraSaveText={'Weapon Data'}/>
      <ReloadButton handleReload={handleReload} canReload={canSave}/>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 1 }}>
        <Tabs value={tabIndex} onChange={(_, v) => setTabIndex(v)}>
          <Tab label={'Base'} id={'weapon-tab-0'} aria-controls={'weapon-tabpanel-0'}/>
          <Tab label={'Note'} id={'weapon-tab-1'} aria-controls={'weapon-tabpanel-1'}/>
        </Tabs>
      </Box>

      {tabIndex === 0 && (
        <Stack spacing={2} sx={{ p: 2 }}>
          <BoardSectionCard title={'Identity'}>
            <Grid container spacing={2} alignItems={'flex-start'}>
              <Grid size={1}>
                <IconIndexField
                  value={selectedWeapon.iconIndex}
                  onChange={(v) => patch({ iconIndex: v })}
                />
              </Grid>
              <Grid size={5}>
                <TextField
                  label={'Name'}
                  value={selectedWeapon.name}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => patch({ name: e.target.value })}
                  size={'small'}
                  fullWidth
                />
              </Grid>
              <Grid size={6}>
                <TextField
                  label={'Description'}
                  value={selectedWeapon.description}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => patch({ description: e.target.value })}
                  size={'small'}
                  fullWidth
                  multiline
                  minRows={2}
                />
              </Grid>
            </Grid>
          </BoardSectionCard>

          <BoardSectionCard title={'Weapon'}>
            <Grid container spacing={2} alignItems={'flex-start'}>
              <Grid size={4}>
                <Autocomplete<RmmzWeaponTypeOption>
                  options={weaponTypeOptions}
                  groupBy={(o) => o.group}
                  getOptionLabel={(o) => o.label}
                  isOptionEqualToValue={(a, b) => a.value === b.value}
                  value={weaponTypeValue}
                  onChange={(_, o) => patch({ wtypeId: o?.value ?? 0 })}
                  size={'small'}
                  renderInput={(params) => (
                    <TextField {...params} label={'Weapon Type'}/>
                  )}
                />
              </Grid>
              <Grid size={5}>
                <Autocomplete<RmmzSkillAnimationOption>
                  options={animationOptions}
                  groupBy={(o) => o.group}
                  getOptionLabel={(o) => o.label}
                  isOptionEqualToValue={(a, b) => a.value === b.value}
                  value={animationValue}
                  onChange={(_, o) => patch({ animationId: o?.value ?? 0 })}
                  size={'small'}
                  renderInput={(params) => (
                    <TextField {...params} label={'Attack Animation'}/>
                  )}
                />
              </Grid>
              <Grid size={3}>
                <NumberInputWithLabel
                  label={'Price'}
                  value={selectedWeapon.price}
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
                    value={selectedWeapon.params[ i ] ?? 0}
                    onChangeEventHandler={(e) =>
                    {
                      const next = [ ...selectedWeapon.params ];
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
                  value={selectedWeapon.maxTp}
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
              selectedTraits={selectedWeapon.traits}
              updateEnemyTraits={(traits: RPG_Trait[]) => patch({ traits })}
            />
          </BoardSectionCard>
        </Stack>
      )}

      {tabIndex === 1 && (
        <Box sx={{ p: 2, height: '100%', boxSizing: 'border-box' }}>
          <TextField
            label={'Note'}
            value={selectedWeapon.note}
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

export default WeaponsBoard;
