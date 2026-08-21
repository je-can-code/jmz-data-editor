import React, { ChangeEvent, useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Grid,
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
import NumberInputWithLabel from '../../../components/core/NumberInputWithLabel.tsx';
import { BoardEmptyState } from '@presentation/components/board/BoardEmptyState.tsx';
import { useBoardActions } from '@presentation/context/board-actions.context.tsx';
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
import { StealRatesFields } from '@presentation/components/resources/StealRatesFields.tsx';
import { IngredientTypeChips } from '@presentation/components/crafting/IngredientTypeChips.tsx';
import { useCrafting } from '@presentation/context/resources/crafting.context.tsx';
import { SystemService } from '@services/SystemService.ts';
import RPG_Trait = Rmmz.Data.RPG_Trait;

const noteFieldSx = { '& .MuiInputBase-input': { fontFamily: 'monospace' } };

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
  return names.map((name, i) =>
  {
    // a named type shows its name; a blank one falls back to its slot, where index 0 is RMMZ's empty type.
    let label = name;
    if (name.trim().length === 0)
    {
      label = i === 0
        ? 'None'
        : `${fallbackPrefix} ${i}`;
    }

    return {
      value: i,
      label,
    };
  });
}

function ArmorsBoard()
{
  const { data: armors, setData, save, reload, loading } = useArmors();
  const { rmmzDataPath } = useProjectPath();

  // the vocabulary is authored on the crafting board; this only offers what has been defined.
  const { ingredientTypes } = useCrafting();

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

  const armorTypeValue = useMemo(
    () => armorTypeOptions.find((o) => o.value === (selectedArmor?.atypeId ?? 0)) ?? armorTypeOptions[0] ?? null,
    [ armorTypeOptions, selectedArmor?.atypeId ],
  );

  const equipTypeValue = useMemo(
    () => equipTypeOptions.find((o) => o.value === (selectedArmor?.etypeId ?? 0)) ?? equipTypeOptions[0] ?? null,
    [ equipTypeOptions, selectedArmor?.etypeId ],
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
      searchable
      searchLabel={'Search armors'}
    />
  );

  useBoardActions({ onSave: handleSave, canSave, isSaving, onReload: handleReload, canReload: canSave });

  if (!selectedArmor)
  {
    return (
      <EditorBoardSplitLayout sidebarColumnWidth={listColumnWidth} sidebar={sidebar}>
        <BoardEmptyState
          icon={<Shield sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }}/>}
          message={'Select an armor from the list.'}
        />
      </EditorBoardSplitLayout>
    );
  }

  return (
    <EditorBoardSplitLayout sidebarColumnWidth={listColumnWidth} sidebar={sidebar}>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 1 }}>
        <Tabs value={tabIndex} onChange={(_, v) => setTabIndex(v)}>
          <Tab label={'Base'} id={'armor-tab-0'} aria-controls={'armor-tabpanel-0'}/>
          <Tab label={'Note'} id={'armor-tab-1'} aria-controls={'armor-tabpanel-1'}/>
        </Tabs>
      </Box>

      {tabIndex === 0 && (
        <Grid container spacing={2} sx={{ p: 2 }} alignItems={'flex-start'}>

          {/* Left column — identity + armor + parameter modifiers */}
          <Grid size={7}>
            <Stack spacing={2}>
              <BoardSectionCard title={'Identity'}>
                <Stack spacing={2}>
                  <Stack direction={'row'} spacing={2} alignItems={'flex-start'}>
                    <Box sx={{ flexShrink: 0 }}>
                      <IconIndexField
                        value={selectedArmor.iconIndex}
                        onChange={(v) => patch({ iconIndex: v })}
                      />
                    </Box>
                    <TextField
                      label={'Name'}
                      value={selectedArmor.name}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => patch({ name: e.target.value })}
                      size={'small'}
                      fullWidth
                    />
                  </Stack>
                  <TextField
                    label={'Description'}
                    value={selectedArmor.description}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => patch({ description: e.target.value })}
                    size={'small'}
                    fullWidth
                    multiline
                    minRows={2}
                  />
                </Stack>
              </BoardSectionCard>

              <BoardSectionCard title={'Armor'}>
                <Grid container spacing={2} alignItems={'flex-start'}>
                  <Grid size={4}>
                    <Autocomplete<{ value: number; label: string }>
                      options={armorTypeOptions}
                      getOptionLabel={(o) => o.label}
                      isOptionEqualToValue={(a, b) => a.value === b.value}
                      value={armorTypeValue}
                      onChange={(_, o) => patch({ atypeId: o?.value ?? 0 })}
                      size={'small'}
                      renderInput={(params) => (
                        <TextField {...params} label={'Armor Type'}/>
                      )}
                    />
                  </Grid>
                  <Grid size={5}>
                    <Autocomplete<{ value: number; label: string }>
                      options={equipTypeOptions}
                      getOptionLabel={(o) => o.label}
                      isOptionEqualToValue={(a, b) => a.value === b.value}
                      value={equipTypeValue}
                      onChange={(_, o) => patch({ etypeId: o?.value ?? 0 })}
                      size={'small'}
                      renderInput={(params) => (
                        <TextField {...params} label={'Equip Slot'}/>
                      )}
                    />
                  </Grid>
                  <Grid size={3}>
                    <NumberInputWithLabel
                      label={'Price'}
                      floatingLabel
                      value={selectedArmor.price}
                      onChangeEventHandler={(e) => patch({ price: parseIntInput(e.target.value, 0) })}
                      variant={'outlined'}
                      size={'small'}
                      fullWidth
                    />
                  </Grid>
                </Grid>
              </BoardSectionCard>

              <BoardSectionCard title={'Parameter Modifiers'}>
                <Grid container spacing={1.5} alignItems={'flex-start'}>
                  <Grid size={4}>
                    <Stack spacing={1.5}>
                      <Typography variant={'caption'} color={'text.secondary'} fontWeight={600} textTransform={'uppercase'}>
                        Resources
                      </Typography>
                      {([ [ 'Max HP', 0 ], [ 'Max MP', 1 ], [ 'Max TP', -1 ] ] as const).map(([ label, idx ]) => (
                        <NumberInputWithLabel
                          key={label}
                          label={label}
                          floatingLabel
                          value={idx === -1 ? selectedArmor.maxTp : (selectedArmor.params[ idx ] ?? 0)}
                          onChangeEventHandler={(e) =>
                          {
                            if (idx === -1)
                            {
                              patch({ maxTp: parseIntInput(e.target.value, 0) });
                            }
                            else
                            {
                              const next = [ ...selectedArmor.params ];
                              next[ idx ] = parseIntInput(e.target.value, 0);
                              patch({ params: next });
                            }
                          }}
                          variant={'outlined'}
                          size={'small'}
                          fullWidth
                        />
                      ))}
                    </Stack>
                  </Grid>
                  <Grid size={4}>
                    <Stack spacing={1.5}>
                      <Typography variant={'caption'} color={'text.secondary'} fontWeight={600} textTransform={'uppercase'}>
                        Offense
                      </Typography>
                      {([ [ 'ATK', 2 ], [ 'MAT', 4 ], [ 'AGI', 6 ] ] as const).map(([ label, idx ]) => (
                        <NumberInputWithLabel
                          key={label}
                          label={label}
                          floatingLabel
                          value={selectedArmor.params[ idx ] ?? 0}
                          onChangeEventHandler={(e) =>
                          {
                            const next = [ ...selectedArmor.params ];
                            next[ idx ] = parseIntInput(e.target.value, 0);
                            patch({ params: next });
                          }}
                          variant={'outlined'}
                          size={'small'}
                          fullWidth
                        />
                      ))}
                    </Stack>
                  </Grid>
                  <Grid size={4}>
                    <Stack spacing={1.5}>
                      <Typography variant={'caption'} color={'text.secondary'} fontWeight={600} textTransform={'uppercase'}>
                        Defense
                      </Typography>
                      {([ [ 'DEF', 3 ], [ 'MDF', 5 ], [ 'LUK', 7 ] ] as const).map(([ label, idx ]) => (
                        <NumberInputWithLabel
                          key={label}
                          label={label}
                          floatingLabel
                          value={selectedArmor.params[ idx ] ?? 0}
                          onChangeEventHandler={(e) =>
                          {
                            const next = [ ...selectedArmor.params ];
                            next[ idx ] = parseIntInput(e.target.value, 0);
                            patch({ params: next });
                          }}
                          variant={'outlined'}
                          size={'small'}
                          fullWidth
                        />
                      ))}
                    </Stack>
                  </Grid>
                </Grid>
              </BoardSectionCard>

              <BoardSectionCard title={'Life/Magi/Tech steal'} collapsible defaultExpanded={false}>
                <Typography variant={'caption'} color={'text.secondary'} sx={{
                  display: 'block',
                  mb: 1.5
                }}>
                  Percent of on-hit HP damage converted to HP/MP/TP gained by the wearer in JABS combat.
                  Caster-wide: sums with the same tags on the actor, class, other equips, and every active
                  state. Negative values drain the wearer instead of stealing.
                </Typography>
                <StealRatesFields
                  value={{
                    lst: selectedArmor.lst,
                    mst: selectedArmor.mst,
                    tst: selectedArmor.tst,
                  }}
                  onChange={(next) =>
                  {
                    patch(next);
                  }}
                />
              </BoardSectionCard>

              <BoardSectionCard title={'Cooking'} collapsible defaultExpanded={false}>
                <IngredientTypeChips
                  options={ingredientTypes}
                  value={selectedArmor.ingredientTypeKeys}
                  onChange={(keys) => patch({ ingredientTypeKeys: keys })}
                  label={'Counts as'}
                  placeholder={'Not an ingredient'}
                  helperText={'Recipes asking for any of these will accept this.'}
                />
              </BoardSectionCard>
            </Stack>
          </Grid>

          {/* Right column — traits */}
          <Grid size={5}>
            <Stack spacing={2}>
              <BoardSectionCard title={'Traits'}>
                <TraitEditor
                  selectedTraits={selectedArmor.traits}
                  updateEnemyTraits={(traits: RPG_Trait[]) => patch({ traits })}
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
