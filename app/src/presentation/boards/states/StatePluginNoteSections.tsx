import React from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  Grid,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Add, Delete } from '@mui/icons-material';
import { RPG_StateDomainModel } from '@core/domain/entities/RPG_StateDomainModel.ts';
import type { StateCritExtension } from '@core/domain/entities/state/StateCritExtension.ts';
import type { StateDropsExtension } from '@core/domain/entities/state/StateDropsExtension.ts';
import type { StateElemBoostRow } from '@core/domain/entities/state/StateElemBoostRow.ts';
import type { StateElemExtension } from '@core/domain/entities/state/StateElemExtension.ts';
import type { StatePassiveAbsExtension } from '@core/domain/entities/state/StatePassiveAbsExtension.ts';
import type { StateLevelExtension } from '@core/domain/entities/state/StateLevelExtension.ts';
import type { StateProfExtension } from '@core/domain/entities/state/StateProfExtension.ts';
import type { StateResourcesExtension } from '@core/domain/entities/state/StateResourcesExtension.ts';
import type { StateStealExtension } from '@core/domain/entities/state/StateStealExtension.ts';
import { StealRatesFields } from '@presentation/components/resources/StealRatesFields.tsx';
import type { StateSdpExtension } from '@core/domain/entities/state/StateSdpExtension.ts';
import type { StateSksExtension } from '@core/domain/entities/state/StateSksExtension.ts';
import type { IdLabelRow } from '@presentation/components/usableItem/UsableEffectsEditor.tsx';
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';
import { StatePassiveAffixesSection } from '@boards/states/StatePassiveAffixesSection.tsx';

type StatePluginNoteSectionsProps = {
  selectedState: RPG_StateDomainModel;
  absorbElementOptions: IdLabelRow[];
  selectedAbsorbElements: IdLabelRow[];
  strictElementOptions: IdLabelRow[];
  selectedStrictElements: IdLabelRow[];
  boostElementIdOptions: IdLabelRow[];
  patchCrit: (partial: Partial<StateCritExtension>) => void;
  patchDrops: (partial: Partial<StateDropsExtension>) => void;
  patchElem: (partial: Partial<StateElemExtension>) => void;
  patchLevel: (partial: Partial<StateLevelExtension>) => void;
  patchProf: (partial: Partial<StateProfExtension>) => void;
  patchResources: (partial: Partial<StateResourcesExtension>) => void;
  patchSteal: (partial: Partial<StateStealExtension>) => void;
  patchSdp: (partial: Partial<StateSdpExtension>) => void;
  patchSks: (partial: Partial<StateSksExtension>) => void;
  patchPassiveAbs: (partial: Partial<StatePassiveAbsExtension>) => void;
  /**
   * Sum of effective affix weights for all loaded states in the prefix (or suffix) pool — same rules as the game
   * ({@code affixWeight} or 100 when omitted).
   */
  passiveAffixPrefixPoolTotal: number;
  passiveAffixSuffixPoolTotal: number;
};

/**
 * Cross-plugin state note tags (non-JABS) edited as separate domain slices.
 */
const StatePluginNoteSections = (props: StatePluginNoteSectionsProps) =>
{
  const {
    selectedState,
    absorbElementOptions,
    selectedAbsorbElements,
    strictElementOptions,
    selectedStrictElements,
    boostElementIdOptions,
    patchCrit,
    patchDrops,
    patchElem,
    patchLevel,
    patchProf,
    patchResources,
    patchSteal,
    patchSdp,
    patchSks,
    patchPassiveAbs,
    passiveAffixPrefixPoolTotal,
    passiveAffixSuffixPoolTotal,
  } = props;

  const defaultBoostElementId = boostElementIdOptions.find((o) => o.id > 0)?.id ?? 1;

  const patchElemBoostRow = (
    index: number,
    row: StateElemBoostRow
  ) =>
  {
    const next = selectedState.elem.elementBoosts.map((
      r,
      i
    ) =>
    {
      return i === index
        ? row
        : r;
    });
    patchElem({ elementBoosts: next });
  };

  const removeElemBoostRow = (index: number) =>
  {
    const next = selectedState.elem.elementBoosts.filter((
      _r,
      i
    ) =>
    {
      return i !== index;
    });
    patchElem({ elementBoosts: next });
  };

  const addElemBoostRow = () =>
  {
    patchElem({
      elementBoosts: [
        ...selectedState.elem.elementBoosts,
        {
          elementId: defaultBoostElementId,
          boost: 0,
        },
      ],
    });
  };

  return (
    <>
        <BoardSectionCard title={'Critical damage'} collapsible defaultExpanded={false}>
          <Stack spacing={2} alignItems={'stretch'}>
            <Typography variant={'body2'} sx={{ lineHeight: 1.6 }}>
              Two separate mechanics: how hard you crit others, and how much you soften crits taken. Each side uses a
              base tag and a stacking tag: critMultiplierBase + critMultiplier (outgoing) vs critReductionBase +
              critReduction (incoming). Values are percent points summed like in-game.
            </Typography>
            <Typography variant={'subtitle2'} sx={{ pt: 0.5 }}>
              Outgoing — damage when you score a critical hit
            </Typography>
            <Grid container spacing={2}>
              <Grid size={6}>
                <TextField
                  type={'number'}
                  variant={'outlined'}
                  label={'Multiplier base (%)'}
                  helperText={'critMultiplierBase — summed into the base crit damage factor.'}
                  value={selectedState.crit.critMultiplierBase === null
                    ? ''
                    : String(selectedState.crit.critMultiplierBase)}
                  onChange={(e) =>
                  {
                    const t = e.target.value.trim();
                    if (t === '')
                    {
                      patchCrit({ critMultiplierBase: null });
                      return;
                    }
                    const n = parseInt(t, 10);
                    if (Number.isNaN(n) === false && n >= 0)
                    {
                      patchCrit({ critMultiplierBase: n });
                    }
                  }}
                  size={'small'}
                  fullWidth
                  slotProps={{ htmlInput: { min: 0 } }}
                />
              </Grid>
              <Grid size={6}>
                <TextField
                  type={'number'}
                  variant={'outlined'}
                  label={'Multiplier extra (%)'}
                  helperText={'critMultiplier — extra percent stacked with other sources.'}
                  value={selectedState.crit.critMultiplier === null
                    ? ''
                    : String(selectedState.crit.critMultiplier)}
                  onChange={(e) =>
                  {
                    const t = e.target.value.trim();
                    if (t === '')
                    {
                      patchCrit({ critMultiplier: null });
                      return;
                    }
                    const n = parseInt(t, 10);
                    if (Number.isNaN(n) === false && n >= 0)
                    {
                      patchCrit({ critMultiplier: n });
                    }
                  }}
                  size={'small'}
                  fullWidth
                  slotProps={{ htmlInput: { min: 0 } }}
                />
              </Grid>
            </Grid>
            <Typography variant={'subtitle2'} sx={{ pt: 0.5 }}>
              Incoming — damage when you are hit by a critical hit
            </Typography>
            <Grid container spacing={2}>
              <Grid size={6}>
                <TextField
                  type={'number'}
                  variant={'outlined'}
                  label={'Reduction base (%)'}
                  helperText={'critReductionBase — base reduction factor for crits you take.'}
                  value={selectedState.crit.critReductionBase === null
                    ? ''
                    : String(selectedState.crit.critReductionBase)}
                  onChange={(e) =>
                  {
                    const t = e.target.value.trim();
                    if (t === '')
                    {
                      patchCrit({ critReductionBase: null });
                      return;
                    }
                    const n = parseInt(t, 10);
                    if (Number.isNaN(n) === false && n >= 0)
                    {
                      patchCrit({ critReductionBase: n });
                    }
                  }}
                  size={'small'}
                  fullWidth
                  slotProps={{ htmlInput: { min: 0 } }}
                />
              </Grid>
              <Grid size={6}>
                <TextField
                  type={'number'}
                  variant={'outlined'}
                  label={'Reduction extra (%)'}
                  helperText={'critReduction — extra reduction stacked with other sources.'}
                  value={selectedState.crit.critReduction === null
                    ? ''
                    : String(selectedState.crit.critReduction)}
                  onChange={(e) =>
                  {
                    const t = e.target.value.trim();
                    if (t === '')
                    {
                      patchCrit({ critReduction: null });
                      return;
                    }
                    const n = parseInt(t, 10);
                    if (Number.isNaN(n) === false && n >= 0)
                    {
                      patchCrit({ critReduction: n });
                    }
                  }}
                  size={'small'}
                  fullWidth
                  slotProps={{ htmlInput: { min: 0 } }}
                />
              </Grid>
            </Grid>
          </Stack>
      </BoardSectionCard>

        <BoardSectionCard title={'Drops and gold'} collapsible defaultExpanded={false}>
          <Stack spacing={2} alignItems={'stretch'}>
            <Typography variant={'body2'} sx={{ lineHeight: 1.6 }}>
              Party drop and gold multiplier bonuses while an actor has this state (percent points summed before the
              engine divides by 100).
            </Typography>
            <Grid container spacing={2}>
              <Grid size={6}>
                <TextField
                  type={'number'}
                  variant={'outlined'}
                  label={'Drop multiplier (%)'}
                  value={selectedState.drops.dropMultiplier === null
                    ? ''
                    : String(selectedState.drops.dropMultiplier)}
                  onChange={(e) =>
                  {
                    const t = e.target.value.trim();
                    if (t === '')
                    {
                      patchDrops({ dropMultiplier: null });
                      return;
                    }
                    const n = parseInt(t, 10);
                    if (Number.isNaN(n) === false)
                    {
                      patchDrops({ dropMultiplier: n });
                    }
                  }}
                  size={'small'}
                  fullWidth
                />
              </Grid>
              <Grid size={6}>
                <TextField
                  type={'number'}
                  variant={'outlined'}
                  label={'Gold multiplier (%)'}
                  value={selectedState.drops.goldMultiplier === null
                    ? ''
                    : String(selectedState.drops.goldMultiplier)}
                  onChange={(e) =>
                  {
                    const t = e.target.value.trim();
                    if (t === '')
                    {
                      patchDrops({ goldMultiplier: null });
                      return;
                    }
                    const n = parseInt(t, 10);
                    if (Number.isNaN(n) === false)
                    {
                      patchDrops({ goldMultiplier: n });
                    }
                  }}
                  size={'small'}
                  fullWidth
                />
              </Grid>
            </Grid>
          </Stack>
      </BoardSectionCard>

        <BoardSectionCard title={'Elements'} collapsible defaultExpanded={false}>
          <Stack spacing={2} alignItems={'stretch'}>
            <Typography variant={'body2'} sx={{ lineHeight: 1.6 }}>
              Absorb and strict element lists, plus per-element rate boosts.
            </Typography>
            <Autocomplete<IdLabelRow, true, false, false>
              multiple
              size={'small'}
              options={absorbElementOptions}
              getOptionLabel={(o) => o.label}
              isOptionEqualToValue={(
                a,
                b
              ) => a.id === b.id}
              value={selectedAbsorbElements}
              onChange={(
                _e,
                next
              ) =>
              {
                const ids = next.map((o) => o.id);
                patchElem({
                  absorbElementList: ids.length === 0
                    ? ''
                    : ids.join(', '),
                });
              }}
              filterOptions={(
                options,
                state
              ) =>
              {
                const q = state.inputValue.trim()
                  .toLowerCase();
                if (q === '')
                {
                  return options;
                }
                return options.filter((o) => o.label.toLowerCase()
                  .includes(q));
              }}
              renderTags={(
                tagValue,
                getTagProps
              ) => tagValue.map((
                option,
                index
              ) =>
              {
                const {
                  key,
                  ...chipProps
                } = getTagProps({ index });
                return (
                  <Chip
                    key={key}
                    {...chipProps}
                    label={option.label}
                    size={'small'}
                  />
                );
              })}
              renderInput={(params) =>
                (
                  <TextField
                    {...params}
                    variant={'outlined'}
                    label={'Absorb elements'}
                    placeholder={'Search…'}
                  />
                )}
              sx={{ width: '100%' }}
            />
            <Autocomplete<IdLabelRow, true, false, false>
              multiple
              size={'small'}
              options={strictElementOptions}
              getOptionLabel={(o) => o.label}
              isOptionEqualToValue={(
                a,
                b
              ) => a.id === b.id}
              value={selectedStrictElements}
              onChange={(
                _e,
                next
              ) =>
              {
                const ids = next.map((o) => o.id);
                patchElem({
                  strictElementList: ids.length === 0
                    ? ''
                    : ids.join(', '),
                });
              }}
              filterOptions={(
                options,
                state
              ) =>
              {
                const q = state.inputValue.trim()
                  .toLowerCase();
                if (q === '')
                {
                  return options;
                }
                return options.filter((o) => o.label.toLowerCase()
                  .includes(q));
              }}
              renderTags={(
                tagValue,
                getTagProps
              ) => tagValue.map((
                option,
                index
              ) =>
              {
                const {
                  key,
                  ...chipProps
                } = getTagProps({ index });
                return (
                  <Chip
                    key={key}
                    {...chipProps}
                    label={option.label}
                    size={'small'}
                  />
                );
              })}
              renderInput={(params) =>
                (
                  <TextField
                    {...params}
                    variant={'outlined'}
                    label={'Strict elements'}
                    placeholder={'Search…'}
                    helperText={'If set, only these elements can affect the battler.'}
                  />
                )}
              sx={{ width: '100%' }}
            />
            <Typography variant={'subtitle2'} sx={{ mt: 1 }}>
              Element rate boosts
            </Typography>
            {selectedState.elem.elementBoosts.map((
              row,
              index
            ) =>
            {
              const rowOption =
                boostElementIdOptions.find((o) => o.id === row.elementId) ?? {
                  id: row.elementId,
                  label: `#${row.elementId}`,
                };
              return (
                <Grid container spacing={1} alignItems={'center'}
                      key={`boost-${String(index)}-${String(row.elementId)}`}>
                  <Grid size={6}>
                    <Autocomplete<IdLabelRow, false, false, false>
                      size={'small'}
                      options={boostElementIdOptions}
                      getOptionLabel={(o) => o.label}
                      isOptionEqualToValue={(
                        a,
                        b
                      ) => a.id === b.id}
                      value={rowOption}
                      onChange={(
                        _e,
                        next
                      ) =>
                      {
                        if (next === null)
                        {
                          return;
                        }
                        patchElemBoostRow(index, {
                          elementId: next.id,
                          boost: row.boost,
                        });
                      }}
                      renderInput={(params) =>
                        (
                          <TextField
                            {...params}
                            variant={'outlined'}
                            label={'Element'}
                          />
                        )}
                      sx={{ width: '100%' }}
                    />
                  </Grid>
                  <Grid size={4}>
                    <TextField
                      type={'number'}
                      variant={'outlined'}
                      label={'Boost %'}
                      value={String(row.boost)}
                      onChange={(e) =>
                      {
                        const n = parseInt(e.target.value, 10);
                        if (Number.isNaN(n) === false)
                        {
                          patchElemBoostRow(index, {
                            elementId: row.elementId,
                            boost: n,
                          });
                        }
                      }}
                      size={'small'}
                      fullWidth
                    />
                  </Grid>
                  <Grid size={2}>
                    <Tooltip title={'Remove row'}>
                      <IconButton
                        size={'small'}
                        onClick={() =>
                        {
                          removeElemBoostRow(index);
                        }}
                        aria-label={'Remove element boost row'}
                      >
                        <Delete fontSize={'small'}/>
                      </IconButton>
                    </Tooltip>
                  </Grid>
                </Grid>
              );
            })}
            <Box>
              <Button
                size={'small'}
                startIcon={<Add/>}
                onClick={addElemBoostRow}
              >
                Add boost
              </Button>
            </Box>
          </Stack>
      </BoardSectionCard>

        <BoardSectionCard title={'Level'} collapsible defaultExpanded={false}>
          <Stack spacing={2} alignItems={'stretch'}>
            <Typography variant={'body2'} sx={{ lineHeight: 1.6 }}>
              Level offset from this state and max-level boost for actors (stacked with equipment and other states).
            </Typography>
            <Grid container spacing={2}>
              <Grid size={6}>
                <TextField
                  type={'number'}
                  variant={'outlined'}
                  label={'Level offset'}
                  value={selectedState.level.levelOffset === null
                    ? ''
                    : String(selectedState.level.levelOffset)}
                  onChange={(e) =>
                  {
                    const t = e.target.value.trim();
                    if (t === '')
                    {
                      patchLevel({ levelOffset: null });
                      return;
                    }
                    const n = parseInt(t, 10);
                    if (Number.isNaN(n) === false)
                    {
                      patchLevel({ levelOffset: n });
                    }
                  }}
                  size={'small'}
                  fullWidth
                />
              </Grid>
              <Grid size={6}>
                <TextField
                  type={'number'}
                  variant={'outlined'}
                  label={'Max level boost'}
                  value={selectedState.level.maxLevelBoost === null
                    ? ''
                    : String(selectedState.level.maxLevelBoost)}
                  onChange={(e) =>
                  {
                    const t = e.target.value.trim();
                    if (t === '')
                    {
                      patchLevel({ maxLevelBoost: null });
                      return;
                    }
                    const n = parseInt(t, 10);
                    if (Number.isNaN(n) === false)
                    {
                      patchLevel({ maxLevelBoost: n });
                    }
                  }}
                  size={'small'}
                  fullWidth
                />
              </Grid>
            </Grid>
          </Stack>
      </BoardSectionCard>

        <BoardSectionCard title={'Skill proficiency'} collapsible defaultExpanded={false}>
          <Stack spacing={2} alignItems={'stretch'}>
            <Typography variant={'body2'} sx={{ lineHeight: 1.6 }}>
              Bonus proficiency gains and flow blocks while this state is active.
            </Typography>
            <TextField
              type={'number'}
              variant={'outlined'}
              label={'Proficiency bonus'}
              value={selectedState.prof.proficiencyBonus === null
                ? ''
                : String(selectedState.prof.proficiencyBonus)}
              onChange={(e) =>
              {
                const t = e.target.value.trim();
                if (t === '')
                {
                  patchProf({ proficiencyBonus: null });
                  return;
                }
                const n = parseInt(t, 10);
                if (Number.isNaN(n) === false && n >= 0)
                {
                  patchProf({ proficiencyBonus: n });
                }
              }}
              size={'small'}
              fullWidth
              slotProps={{ htmlInput: { min: 0 } }}
            />
            <FormControlLabel
              control={(
                <Checkbox
                  checked={selectedState.prof.proficiencyGivingBlock}
                  onChange={(e) =>
                  {
                    patchProf({ proficiencyGivingBlock: e.target.checked });
                  }}
                  size={'small'}
                />
              )}
              label={'Block granting proficiency to others'}
            />
            <FormControlLabel
              control={(
                <Checkbox
                  checked={selectedState.prof.proficiencyGainingBlock}
                  onChange={(e) =>
                  {
                    patchProf({ proficiencyGainingBlock: e.target.checked });
                  }}
                  size={'small'}
                />
              )}
              label={'Block gaining proficiency'}
            />
          </Stack>
      </BoardSectionCard>

        <BoardSectionCard title={'HP cost reduction'} collapsible defaultExpanded={false}>
          <Stack spacing={2} alignItems={'stretch'}>
            <Typography variant={'body2'} sx={{ lineHeight: 1.6 }}>
              Formula inside the tag reduces effective HP skill costs (evaluated in-game).
            </Typography>
            <TextField
              variant={'outlined'}
              label={'hrc formula (bracket interior)'}
              value={selectedState.resources.hpCostReductionFormula}
              onChange={(e) =>
              {
                patchResources({ hpCostReductionFormula: e.target.value });
              }}
              size={'small'}
              fullWidth
              placeholder={'e.g. a.mhp * 0.01'}
            />
          </Stack>
      </BoardSectionCard>

        <BoardSectionCard title={'Life/Magi/Tech steal'} collapsible defaultExpanded={false}>
          <Stack spacing={2} alignItems={'stretch'}>
            <Typography variant={'body2'} sx={{ lineHeight: 1.6 }}>
              Percent of on-hit HP damage converted to HP/MP/TP gained by the caster in JABS combat.
              Caster-wide: sums with the same tags on the actor, class, equips, and every other active
              state. Negative values drain the caster instead of stealing.
            </Typography>
            <StealRatesFields
              value={{
                lst: selectedState.steal.lst,
                mst: selectedState.steal.mst,
                tst: selectedState.steal.tst,
              }}
              onChange={(next) =>
              {
                patchSteal(next);
              }}
            />
          </Stack>
      </BoardSectionCard>

        <BoardSectionCard title={'SDP multiplier'} collapsible defaultExpanded={false}>
          <Stack spacing={2} alignItems={'stretch'}>
            <Typography variant={'body2'} sx={{ lineHeight: 1.6 }}>
              Bonus added to the actor SDP points multiplier (base 100 in engine, then divided by 100).
            </Typography>
            <TextField
              type={'number'}
              variant={'outlined'}
              label={'Multiplier bonus'}
              value={selectedState.sdp.sdpMultiplierBonus === null
                ? ''
                : String(selectedState.sdp.sdpMultiplierBonus)}
              onChange={(e) =>
              {
                const t = e.target.value.trim();
                if (t === '')
                {
                  patchSdp({ sdpMultiplierBonus: null });
                  return;
                }
                const n = parseFloat(t);
                if (Number.isNaN(n) === false)
                {
                  patchSdp({ sdpMultiplierBonus: n });
                }
              }}
              size={'small'}
              fullWidth
              slotProps={{ htmlInput: { step: 'any' } }}
            />
          </Stack>
      </BoardSectionCard>

        <StatePassiveAffixesSection
          selectedState={selectedState}
          patchPassiveAbs={patchPassiveAbs}
          passiveAffixPrefixPoolTotal={passiveAffixPrefixPoolTotal}
          passiveAffixSuffixPoolTotal={passiveAffixSuffixPoolTotal}
        />

        <BoardSectionCard title={'Skill slots'} collapsible defaultExpanded={false}>
          <Stack spacing={2} alignItems={'stretch'}>
            <Typography variant={'body2'} sx={{ lineHeight: 1.6 }}>
              Flat modifier to skill slot point costs while this state applies.
            </Typography>
            <TextField
              type={'number'}
              variant={'outlined'}
              label={'Slot cost modifier'}
              value={selectedState.sks.slotCostModifier === null
                ? ''
                : String(selectedState.sks.slotCostModifier)}
              onChange={(e) =>
              {
                const t = e.target.value.trim();
                if (t === '')
                {
                  patchSks({ slotCostModifier: null });
                  return;
                }
                const n = parseInt(t, 10);
                if (Number.isNaN(n) === false)
                {
                  patchSks({ slotCostModifier: n });
                }
              }}
              size={'small'}
              fullWidth
            />
          </Stack>
      </BoardSectionCard>
    </>
  );
};

export { StatePluginNoteSections };
export type { StatePluginNoteSectionsProps };
