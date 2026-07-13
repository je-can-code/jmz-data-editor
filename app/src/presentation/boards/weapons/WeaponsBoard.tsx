import { ChangeEvent, useCallback, useMemo, useRef, useState } from 'react';
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
import { Build } from '@mui/icons-material';
import { MuiSnackbarSeverity, MuiSnackbarVariant } from '@core/enums/MuiSnackbar.ts';
import NumberInputWithLabel from '../../../components/core/NumberInputWithLabel.tsx';
import { BoardEmptyState } from '@presentation/components/board/BoardEmptyState.tsx';
import { useBoardActions } from '@presentation/context/board-actions.context.tsx';
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
import { StealRatesFields } from '@presentation/components/resources/StealRatesFields.tsx';
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
      searchable
      searchLabel={'Search weapons'}
    />
  );

  useBoardActions({ onSave: handleSave, canSave, isSaving, onReload: handleReload, canReload: canSave });

  if (!selectedWeapon)
  {
    return (
      <EditorBoardSplitLayout sidebarColumnWidth={listColumnWidth} sidebar={sidebar}>
        <BoardEmptyState
          icon={<Build sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }}/>}
          message={'Select a weapon from the list.'}
        />
      </EditorBoardSplitLayout>
    );
  }

  return (
    <EditorBoardSplitLayout sidebarColumnWidth={listColumnWidth} sidebar={sidebar}>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 1 }}>
        <Tabs value={tabIndex} onChange={(_, v) => setTabIndex(v)}>
          <Tab label={'Base'} id={'weapon-tab-0'} aria-controls={'weapon-tabpanel-0'}/>
          <Tab label={'Note'} id={'weapon-tab-1'} aria-controls={'weapon-tabpanel-1'}/>
        </Tabs>
      </Box>

      {tabIndex === 0 && (
        <Grid container spacing={2} sx={{ p: 2 }} alignItems={'flex-start'}>

          {/* Left column — identity + weapon + parameter modifiers */}
          <Grid size={7}>
            <Stack spacing={2}>
              <BoardSectionCard title={'Identity'}>
                <Stack spacing={2}>
                  <Stack direction={'row'} spacing={2} alignItems={'flex-start'}>
                    <Box sx={{ flexShrink: 0 }}>
                      <IconIndexField
                        value={selectedWeapon.iconIndex}
                        onChange={(v) => patch({ iconIndex: v })}
                      />
                    </Box>
                    <TextField
                      label={'Name'}
                      value={selectedWeapon.name}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => patch({ name: e.target.value })}
                      size={'small'}
                      fullWidth
                    />
                  </Stack>
                  <TextField
                    label={'Description'}
                    value={selectedWeapon.description}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => patch({ description: e.target.value })}
                    size={'small'}
                    fullWidth
                    multiline
                    minRows={2}
                  />
                </Stack>
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
                      floatingLabel
                      value={selectedWeapon.price}
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
                          value={idx === -1 ? selectedWeapon.maxTp : (selectedWeapon.params[ idx ] ?? 0)}
                          onChangeEventHandler={(e) =>
                          {
                            if (idx === -1)
                            {
                              patch({ maxTp: parseIntInput(e.target.value, 0) });
                            }
                            else
                            {
                              const next = [ ...selectedWeapon.params ];
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
                          value={selectedWeapon.params[ idx ] ?? 0}
                          onChangeEventHandler={(e) =>
                          {
                            const next = [ ...selectedWeapon.params ];
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
                          value={selectedWeapon.params[ idx ] ?? 0}
                          onChangeEventHandler={(e) =>
                          {
                            const next = [ ...selectedWeapon.params ];
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
                  Percent of on-hit HP damage converted to HP/MP/TP gained by the wielder in JABS combat.
                  Caster-wide: sums with the same tags on the actor, class, other equips, and every active
                  state. Negative values drain the wielder instead of stealing.
                </Typography>
                <StealRatesFields
                  value={{
                    lst: selectedWeapon.lst,
                    mst: selectedWeapon.mst,
                    tst: selectedWeapon.tst,
                  }}
                  onChange={(next) =>
                  {
                    patch(next);
                  }}
                />
              </BoardSectionCard>
            </Stack>
          </Grid>

          {/* Right column — traits */}
          <Grid size={5}>
            <Stack spacing={2}>
              <BoardSectionCard title={'Traits'}>
                <TraitEditor
                  selectedTraits={selectedWeapon.traits}
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
