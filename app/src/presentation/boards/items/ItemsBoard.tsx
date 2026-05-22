import React, { ChangeEvent, useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  FormControlLabel,
  Grid,
  Snackbar,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
} from '@mui/material';
import { FixedSizeList } from 'react-window';
import { Inventory2 } from '@mui/icons-material';
import { MuiSnackbarSeverity, MuiSnackbarVariant } from '@core/enums/MuiSnackbar.ts';
import NumberInputWithLabel from '../../../components/core/NumberInputWithLabel.tsx';
import { BoardEmptyState } from '@presentation/components/board/BoardEmptyState.tsx';
import { useBoardActions } from '@presentation/context/board-actions.context.tsx';
import { useItems } from '@presentation/context/resources/items.context.tsx';
import { useStates } from '@presentation/context/resources/states.context.tsx';
import { useSkills } from '@presentation/context/resources/skills.context.tsx';
import { RPG_ItemDomainModel } from '@core/domain/entities/RPG_ItemDomainModel.ts';
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
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';
import {
  type UsableItemDamageEditorValue,
  UsableItemDamageSection,
} from '@presentation/components/usableItem/UsableItemDamageSection.tsx';
import {
  type UsableItemInvocationValue,
  UsableItemInvocationSection,
} from '@presentation/components/usableItem/UsableItemInvocationSection.tsx';
import { type IdLabelRow, UsableEffectsEditor } from '@presentation/components/usableItem/UsableEffectsEditor.tsx';
import { SystemService } from '@services/SystemService.ts';
import RPG_UsableEffect = Rmmz.Data.RPG_UsableEffect;

const noteFieldSx = { '& .MuiInputBase-input': { fontFamily: 'monospace' } };

const ITEM_TYPE_OPTIONS = [
  { value: 1, label: 'Regular Item' },
  { value: 2, label: 'Key Item' },
  { value: 3, label: 'Hidden Item A' },
  { value: 4, label: 'Hidden Item B' },
];

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

function ItemsBoard()
{
  const { data: items, setData, save, reload, loading } = useItems();
  const { states } = useStates();
  const { skills } = useSkills();
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

  const selectedItem = items[ selectedIndex ] ?? null;

  const stateEffectPickerRows = useMemo((): IdLabelRow[] =>
  {
    const rows: IdLabelRow[] = [ { id: 0, label: '0: Normal attack states' } ];
    for (const s of states)
    {
      if (s.id > 0)
      {
        rows.push({ id: s.id, label: `${s.id}: ${s.name}` });
      }
    }
    return rows;
  }, [ states ]);

  const skillEffectPickerRows = useMemo((): IdLabelRow[] =>
    skills
      .filter((s) => !s.name.startsWith('==='))
      .map((s) => ({ id: s.id, label: `${s.id}: ${s.name}` })),
  [ skills ],
  );

  const commonEventPickerRows = useMemo(
    (): IdLabelRow[] => SystemService.commonEventAutocompleteRows.slice(),
    [],
  );

  const itemTypeValue = useMemo(
    () => ITEM_TYPE_OPTIONS.find((o) => o.value === selectedItem?.itypeId) ?? ITEM_TYPE_OPTIONS[0],
    [ selectedItem?.itypeId ],
  );

  const getRow = useCallback((index: number): VirtualizedSidebarRow =>
  {
    const it = items[ index ];
    if (!it)
    {
      return { type: 'spacer' };
    }
    return {
      type: 'item',
      label: `${it.id}: ${it.name}`,
      title: it.name,
      iconIndex: it.iconIndex,
    };
  }, [ items ]);

  const patch = useCallback((partial: Partial<RPG_ItemDomainModel>) =>
  {
    if (selectedItem === null)
    {
      return;
    }
    const updated = Object.assign(Object.create(Object.getPrototypeOf(selectedItem)), selectedItem, partial);
    setData((prev) => prev.map((it, i) => i === selectedIndex
      ? updated
      : it));
  }, [ selectedItem, selectedIndex, setData ]);

  const handleSave = async () =>
  {
    setIsSaving(true);
    try
    {
      await save(items);
      setSnackbar({ open: true, message: 'Items saved.', severity: MuiSnackbarSeverity.Success, variant: MuiSnackbarVariant.Filled });
    }
    catch
    {
      setSnackbar({ open: true, message: 'Failed to save items.', severity: MuiSnackbarSeverity.Error, variant: MuiSnackbarVariant.Filled });
    }
    finally
    {
      setIsSaving(false);
    }
  };

  const handleReload = async () =>
  {
    await reload();
    setSnackbar({ open: true, message: 'Items reloaded.', severity: MuiSnackbarSeverity.Info, variant: MuiSnackbarVariant.Filled });
  };

  const canSave = !loading && !isSaving && !!rmmzDataPath;

  const sidebar = (
    <VirtualizedSidebarList
      ref={listRef}
      itemCount={items.length}
      itemSize={VIRTUALIZED_SIDEBAR_DEFAULT_ITEM_SIZE}
      listHeight={VIRTUALIZED_SIDEBAR_DEFAULT_LIST_HEIGHT}
      labelMinCh={VIRTUALIZED_SIDEBAR_DEFAULT_LABEL_MIN_CH}
      selectedIndex={selectedIndex}
      getRow={getRow}
      onSelectIndex={setSelectedIndex}
      listWrapperRef={listWrapperRef}
      fillContainer
      searchable
      searchLabel={'Search items'}
    />
  );

  useBoardActions({ onSave: handleSave, canSave, isSaving, onReload: handleReload, canReload: canSave });

  if (!selectedItem)
  {
    return (
      <EditorBoardSplitLayout sidebarColumnWidth={listColumnWidth} sidebar={sidebar}>
        <BoardEmptyState
          icon={<Inventory2 sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }}/>}
          message={'Select an item from the list.'}
        />
      </EditorBoardSplitLayout>
    );
  }

  const damageValue: UsableItemDamageEditorValue = {
    damageType: selectedItem.damageType,
    damageElementId: selectedItem.damageElementId,
    damageFormula: selectedItem.damageFormula,
    damageVariance: selectedItem.damageVariance,
    damageCritical: selectedItem.damageCritical,
    attackElementIds: selectedItem.attackElementIds,
    thisCritChanceFormula: selectedItem.thisCritChanceFormula,
    thisCritDamageMultiplierFormula: selectedItem.thisCritDamageMultiplierFormula,
    thisCritsAlways: selectedItem.thisCritsAlways,
  };

  const invocationValue: UsableItemInvocationValue = {
    scope: selectedItem.scope,
    occasion: selectedItem.occasion,
    speed: selectedItem.speed,
    successRate: selectedItem.successRate,
    repeats: selectedItem.repeats,
    tpGain: selectedItem.tpGain,
    hitType: selectedItem.hitType,
  };

  return (
    <EditorBoardSplitLayout sidebarColumnWidth={listColumnWidth} sidebar={sidebar}>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 1 }}>
        <Tabs value={tabIndex} onChange={(_, v) => setTabIndex(v)}>
          <Tab label={'Base'} id={'item-tab-0'} aria-controls={'item-tabpanel-0'}/>
          <Tab label={'Note'} id={'item-tab-1'} aria-controls={'item-tabpanel-1'}/>
        </Tabs>
      </Box>

      {tabIndex === 0 && (
        <Grid container spacing={2} sx={{ p: 2 }} alignItems={'flex-start'}>

          {/* Left column — identity + item + invocation */}
          <Grid size={5}>
            <Stack spacing={2}>
              <BoardSectionCard title={'Identity'}>
                <Stack spacing={2}>
                  <Stack direction={'row'} spacing={2} alignItems={'flex-start'}>
                    <Box sx={{ flexShrink: 0 }}>
                      <IconIndexField
                        value={selectedItem.iconIndex}
                        onChange={(v) => patch({ iconIndex: v })}
                      />
                    </Box>
                    <TextField
                      label={'Name'}
                      value={selectedItem.name}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => patch({ name: e.target.value })}
                      size={'small'}
                      fullWidth
                    />
                  </Stack>
                  <TextField
                    label={'Description'}
                    value={selectedItem.description}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => patch({ description: e.target.value })}
                    size={'small'}
                    fullWidth
                    multiline
                    minRows={2}
                  />
                </Stack>
              </BoardSectionCard>

              <BoardSectionCard title={'Item'}>
                <Stack spacing={2}>
                  <Autocomplete<{ value: number; label: string }>
                    options={ITEM_TYPE_OPTIONS}
                    getOptionLabel={(o) => o.label}
                    isOptionEqualToValue={(a, b) => a.value === b.value}
                    value={itemTypeValue}
                    onChange={(_, o) => patch({ itypeId: o?.value ?? ITEM_TYPE_OPTIONS[0].value })}
                    size={'small'}

                    renderInput={(params) => (
                      <TextField {...params} label={'Item Type'}/>
                    )}
                  />
                  <Stack direction={'row'} spacing={2} alignItems={'center'}>
                    <NumberInputWithLabel
                      label={'Price'}
                      floatingLabel
                      value={selectedItem.price}
                      onChangeEventHandler={(e) => patch({ price: Math.max(0, parseIntInput(e.target.value, 0)) })}
                      variant={'outlined'}
                      size={'small'}
                      fullWidth
                    />
                    <FormControlLabel
                      label={'Consumable'}
                      control={
                        <Switch
                          size={'small'}
                          checked={selectedItem.consumable}
                          onChange={(e) => patch({ consumable: e.target.checked })}
                        />
                      }
                    />
                  </Stack>
                </Stack>
              </BoardSectionCard>

              <BoardSectionCard title={'Invocation'}>
                <UsableItemInvocationSection
                  value={invocationValue}
                  onChange={(next) => patch({
                    scope: next.scope,
                    occasion: next.occasion,
                    speed: next.speed,
                    successRate: next.successRate,
                    repeats: next.repeats,
                    tpGain: next.tpGain,
                    hitType: next.hitType,
                  })}
                />
              </BoardSectionCard>
            </Stack>
          </Grid>

          {/* Right column — damage + effects */}
          <Grid size={7}>
            <Stack spacing={2}>
              <BoardSectionCard title={'Damage'}>
                <UsableItemDamageSection
                  value={damageValue}
                  onChange={(next) => patch({
                    damageType: next.damageType,
                    damageElementId: next.damageElementId,
                    damageFormula: next.damageFormula,
                    damageVariance: next.damageVariance,
                    damageCritical: next.damageCritical,
                    attackElementIds: next.attackElementIds,
                    thisCritChanceFormula: next.thisCritChanceFormula,
                    thisCritDamageMultiplierFormula: next.thisCritDamageMultiplierFormula,
                    thisCritsAlways: next.thisCritsAlways,
                  })}
                  elementNames={SystemService.elements ?? []}
                  embedded
                />
              </BoardSectionCard>
              <BoardSectionCard title={'Effects'}>
                <UsableEffectsEditor
                  value={selectedItem.effects}
                  onChange={(effects: RPG_UsableEffect[]) => patch({ effects })}
                  stateRows={stateEffectPickerRows}
                  skillRows={skillEffectPickerRows}
                  commonEventRows={commonEventPickerRows}
                />
              </BoardSectionCard>
            </Stack>
          </Grid>

        </Grid>
      )}

      {tabIndex === 1 && (
        <Box sx={{ p: 2, height: '100%', boxSizing: 'border-box' }}>
          <TextField
            label={'Note'}
            value={selectedItem.note}
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

export default ItemsBoard;
