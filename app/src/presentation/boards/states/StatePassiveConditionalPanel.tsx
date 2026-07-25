import React from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Divider,
  Grid,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Add, DeleteOutline } from '@mui/icons-material';
import {
  autoApplyStateConditionOptionForValue,
  RMMZ_AUTO_APPLY_STATE_CONDITION_OPTIONS,
  type RmmzAutoApplyStateCondition,
} from '@core/enums/RmmzAutoApplyStateCondition.ts';
import {
  autoExecuteSkillConditionOptionForValue,
  RMMZ_AUTO_EXECUTE_SKILL_CONDITION_OPTIONS,
  type RmmzAutoExecuteSkillCondition,
} from '@core/enums/RmmzAutoExecuteSkillCondition.ts';
import {
  createEmptyStatePassiveAutoApplyRule,
  createEmptyStatePassiveAutoExecuteSkillRule,
  type StatePassiveConditionalExtension,
} from '@core/domain/entities/state/StatePassiveConditionalExtension.ts';
import {
  isCompleteStatePassiveAutoApplyRule,
  type StatePassiveAutoApplyRule,
} from '@core/domain/entities/state/StatePassiveAutoApplyRule.ts';
import {
  isCompleteStatePassiveAutoExecuteSkillRule,
  type StatePassiveAutoExecuteSkillRule,
} from '@core/domain/entities/state/StatePassiveAutoExecuteSkillRule.ts';
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';
import { type IdLabelRow } from '@presentation/components/usableItem/UsableEffectsEditor.tsx';

/**
 * Human-readable approximate duration for summary lines (60 frames ≈ 1 second).
 *
 * @param frames Duration in frames.
 * @returns Empty string when invalid; otherwise {@code (~N seconds)}.
 */
const formatApproxSecondsForSummary = (frames: number): string =>
{
  if (!Number.isFinite(frames) || frames < 0)
  {
    return '';
  }
  const sec = Math.round((frames / 60) * 100) / 100;
  const display = parseFloat(sec.toFixed(2));
  const unit = display === 1 ? 'second' : 'seconds';
  return `(~${display} ${unit})`;
};

/**
 * Inline approximate seconds without wrapping parentheses.
 *
 * @param frames Duration in frames.
 * @returns Empty string when invalid; otherwise {@code ~N seconds}.
 */
const formatApproxSecondsInline = (frames: number): string =>
{
  if (!Number.isFinite(frames) || frames < 0)
  {
    return '';
  }
  const sec = Math.round((frames / 60) * 100) / 100;
  const display = parseFloat(sec.toFixed(2));
  const unit = display === 1 ? 'second' : 'seconds';
  return `~${display} ${unit}`;
};

/**
 * Builds the param clause for rule summary copy ({@code tiles} vs approximate seconds).
 *
 * @param condition Trigger kind for the rule.
 * @param param Frame or tile count.
 * @returns Parenthetical suffix for the summary sentence.
 */
const passiveRuleSummaryParamClause = (
  condition: RmmzAutoApplyStateCondition | RmmzAutoExecuteSkillCondition | null,
  param: number | null
): string =>
{
  if (param === null)
  {
    return '';
  }
  if (condition === 'move')
  {
    const unit = param === 1 ? 'tile' : 'tiles';
    return `(${param} ${unit})`;
  }
  const approx = formatApproxSecondsForSummary(param);
  if (approx === '')
  {
    return '';
  }
  return approx;
};

/**
 * Builds a positive integer for passive param fields; empty clears to {@code null}.
 *
 * @param raw Raw text from the input.
 * @returns Parsed integer {@code >= 1}, or {@code null}.
 */
const parsePassivePositiveIntOrNull = (raw: string): number | null =>
{
  const t = raw.trim();
  if (t === '')
  {
    return null;
  }
  const n = parseInt(t, 10);
  if (Number.isNaN(n) || n < 1)
  {
    return null;
  }
  return n;
};

/**
 * Builds a non-negative integer for cooldown fields; empty clears to {@code null}.
 *
 * @param raw Raw text from the input.
 * @returns Parsed integer {@code >= 0}, or {@code null}.
 */
const parsePassiveNonNegativeIntOrNull = (raw: string): number | null =>
{
  const t = raw.trim();
  if (t === '')
  {
    return null;
  }
  const n = parseInt(t, 10);
  if (Number.isNaN(n) || n < 0)
  {
    return null;
  }
  return n;
};

/**
 * Resolves one picker row, including out-of-list ids from the note.
 *
 * @param id Selected database id.
 * @param rows Known picker rows.
 * @returns Matching row or a synthetic fallback label.
 */
const pickerRowForId = (
  id: number | null,
  rows: IdLabelRow[]
): IdLabelRow | null =>
{
  if (id === null || id < 1)
  {
    return null;
  }
  const found = rows.find((row) => row.id === id);
  if (found !== undefined)
  {
    return found;
  }
  return {
    id,
    label: `#${id} (not in database)`,
  };
};

/**
 * Merges picker rows with any ids referenced only in existing rules.
 *
 * @param baseRows Database rows for the autocomplete.
 * @param ruleIds Ids from hydrated rules that may be missing from the database list.
 * @returns Rows for the autocomplete control.
 */
const autocompleteOptionsForRuleIds = (
  baseRows: IdLabelRow[],
  ruleIds: number[]
): IdLabelRow[] =>
{
  const extra: IdLabelRow[] = [];
  for (const id of ruleIds)
  {
    if (id < 1)
    {
      continue;
    }
    if (baseRows.some((row) => row.id === id))
    {
      continue;
    }
    extra.push({
      id,
      label: `#${id} (not in database)`,
    });
  }
  if (extra.length === 0)
  {
    return baseRows;
  }
  return [
    ...baseRows,
    ...extra,
  ];
};

type StatePassiveConditionalPanelProps = {
  ext: StatePassiveConditionalExtension;
  onChange: (partial: Partial<StatePassiveConditionalExtension>) => void;
  statePickerRows: IdLabelRow[];
  skillPickerRows: IdLabelRow[];
};

/**
 * Authoring UI for J-Passive-Conditional scheduled behaviors on state rows.
 */
const StatePassiveConditionalPanel = ({
  ext,
  onChange,
  statePickerRows,
  skillPickerRows,
}: StatePassiveConditionalPanelProps): React.ReactElement =>
{
  const stateAutocompleteOptions = autocompleteOptionsForRuleIds(
    statePickerRows,
    ext.autoApplyStateRules.map((rule) => rule.stateId ?? 0)
  );
  const skillAutocompleteOptions = autocompleteOptionsForRuleIds(
    skillPickerRows,
    ext.autoExecuteSkillRules.map((rule) => rule.skillId ?? 0)
  );

  const patchAutoApplyRule = (
    index: number,
    patch: Partial<StatePassiveAutoApplyRule>
  ) =>
  {
    const next = ext.autoApplyStateRules.map((rule, i) =>
    {
      if (i !== index)
      {
        return rule;
      }
      return {
        ...rule,
        ...patch,
      };
    });
    onChange({ autoApplyStateRules: next });
  };

  const patchAutoExecuteRule = (
    index: number,
    patch: Partial<StatePassiveAutoExecuteSkillRule>
  ) =>
  {
    const next = ext.autoExecuteSkillRules.map((rule, i) =>
    {
      if (i !== index)
      {
        return rule;
      }
      return {
        ...rule,
        ...patch,
      };
    });
    onChange({ autoExecuteSkillRules: next });
  };

  const addAutoApplyRule = () =>
  {
    onChange({
      autoApplyStateRules: [
        ...ext.autoApplyStateRules,
        createEmptyStatePassiveAutoApplyRule(),
      ],
    });
  };

  const removeAutoApplyRule = (index: number) =>
  {
    onChange({
      autoApplyStateRules: ext.autoApplyStateRules.filter((_rule, i) => i !== index),
    });
  };

  const addAutoExecuteRule = () =>
  {
    onChange({
      autoExecuteSkillRules: [
        ...ext.autoExecuteSkillRules,
        createEmptyStatePassiveAutoExecuteSkillRule(),
      ],
    });
  };

  const removeAutoExecuteRule = (index: number) =>
  {
    onChange({
      autoExecuteSkillRules: ext.autoExecuteSkillRules.filter((_rule, i) => i !== index),
    });
  };

  return (
    <BoardSectionCard title={'Automatic behaviors'} collapsible defaultExpanded={false}>
      <Stack spacing={3} alignItems={'stretch'}>
        <Typography variant={'body2'} color={'text.secondary'}>
          {'Uses map skills or applies other states on timers and combat events while this state is active.'}
        </Typography>

        <Stack spacing={2} alignItems={'stretch'}>
          <Typography variant={'subtitle2'}>
            {'Use skill'}
          </Typography>
          {ext.autoExecuteSkillRules.length === 0
            ? (
              <Typography variant={'body2'} color={'text.secondary'}>
                {'No skill rules configured.'}
              </Typography>
            )
            : ext.autoExecuteSkillRules.map((rule, index) => (
              <Box
                key={`auto-exec-${index}`}
                sx={{
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                  p: 2,
                }}
              >
                <Stack spacing={2}>
                  <Stack direction={'row'} alignItems={'center'} justifyContent={'space-between'}>
                    <Typography variant={'body2'} color={'text.secondary'}>
                      {`Rule ${index + 1}`}
                    </Typography>
                    <IconButton
                      size={'small'}
                      color={'error'}
                      aria-label={'Remove skill rule'}
                      onClick={() => removeAutoExecuteRule(index)}
                    >
                      <DeleteOutline fontSize={'small'}/>
                    </IconButton>
                  </Stack>
                  <Grid container spacing={2} alignItems={'flex-start'}>
                    <Grid size={12}>
                      <Autocomplete<IdLabelRow, false, false, false>
                        fullWidth
                        size={'small'}
                        options={skillAutocompleteOptions}
                        getOptionLabel={(option) => option.label}
                        isOptionEqualToValue={(a, b) => a.id === b.id}
                        value={pickerRowForId(rule.skillId, skillAutocompleteOptions)}
                        onChange={(_event, option) =>
                        {
                          patchAutoExecuteRule(index, {
                            skillId: option === null ? null : option.id,
                          });
                        }}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            variant={'outlined'}
                            label={'Skill to use'}
                            placeholder={'Select a skill…'}
                          />
                        )}
                      />
                    </Grid>
                    <Grid size={6}>
                      <TextField
                        select
                        variant={'outlined'}
                        label={'When to use'}
                        value={rule.condition ?? ''}
                        onChange={(e) =>
                        {
                          const v = e.target.value;
                          if (v === '')
                          {
                            patchAutoExecuteRule(index, {
                              condition: null,
                              param: null,
                              enemyMinCount: null,
                              enemyCooldownFrames: null,
                              enemyTriggerTiles: null,
                            });
                            return;
                          }
                          const condition = v as RmmzAutoExecuteSkillCondition;
                          if (condition === 'enemiesNearby')
                          {
                            patchAutoExecuteRule(index, {
                              condition,
                              param: null,
                            });
                            return;
                          }
                          patchAutoExecuteRule(index, {
                            condition,
                            enemyMinCount: null,
                            enemyCooldownFrames: null,
                            enemyTriggerTiles: null,
                          });
                        }}
                        size={'small'}
                        fullWidth
                        helperText={
                          autoExecuteSkillConditionOptionForValue(rule.condition)?.helperText
                          ?? 'Choose what triggers the skill.'
                        }
                      >
                        <MenuItem value={''}>
                          {'—'}
                        </MenuItem>
                        {RMMZ_AUTO_EXECUTE_SKILL_CONDITION_OPTIONS.map((option) => (
                          <MenuItem
                            key={option.value}
                            value={option.value}
                          >
                            {option.label}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Grid>
                    {rule.condition === 'enemiesNearby'
                      ? (
                        <>
                          <Grid size={6}>
                            <TextField
                              type={'number'}
                              variant={'outlined'}
                              label={'Minimum enemies'}
                              value={rule.enemyMinCount === null ? '' : String(rule.enemyMinCount)}
                              onChange={(e) =>
                              {
                                patchAutoExecuteRule(index, {
                                  enemyMinCount: parsePassivePositiveIntOrNull(e.target.value),
                                });
                              }}
                              size={'small'}
                              fullWidth
                              slotProps={{
                                htmlInput: {
                                  min: 1,
                                  step: 1,
                                },
                              }}
                              helperText={'How many enemies must be in range.'}
                            />
                          </Grid>
                          <Grid size={6}>
                            <TextField
                              type={'number'}
                              variant={'outlined'}
                              label={'Cooldown (frames)'}
                              value={rule.enemyCooldownFrames === null
                                ? ''
                                : String(rule.enemyCooldownFrames)}
                              onChange={(e) =>
                              {
                                patchAutoExecuteRule(index, {
                                  enemyCooldownFrames: parsePassiveNonNegativeIntOrNull(e.target.value),
                                });
                              }}
                              size={'small'}
                              fullWidth
                              slotProps={{
                                htmlInput: {
                                  min: 0,
                                  step: 1,
                                },
                              }}
                              helperText={'Minimum frames between uses.'}
                            />
                          </Grid>
                          <Grid size={6}>
                            <TextField
                              type={'number'}
                              variant={'outlined'}
                              label={'Trigger range (tiles)'}
                              value={rule.enemyTriggerTiles === null ? '' : String(rule.enemyTriggerTiles)}
                              onChange={(e) =>
                              {
                                const parsed = parsePassivePositiveIntOrNull(e.target.value);
                                patchAutoExecuteRule(index, {
                                  enemyTriggerTiles: e.target.value.trim() === '' ? null : parsed,
                                });
                              }}
                              size={'small'}
                              fullWidth
                              slotProps={{
                                htmlInput: {
                                  min: 1,
                                  step: 1,
                                },
                              }}
                              helperText={'Leave blank for the default map range.'}
                            />
                          </Grid>
                        </>
                      )
                      : (
                        <Grid size={6}>
                          <TextField
                            type={'number'}
                            variant={'outlined'}
                            label={
                              autoExecuteSkillConditionOptionForValue(rule.condition)?.paramLabel ?? 'Interval'
                            }
                            value={rule.param === null ? '' : String(rule.param)}
                            onChange={(e) =>
                            {
                              patchAutoExecuteRule(index, {
                                param: parsePassiveNonNegativeIntOrNull(e.target.value),
                              });
                            }}
                            size={'small'}
                            fullWidth
                            slotProps={{
                              htmlInput: {
                                min: 0,
                                step: 1,
                              },
                            }}
                            helperText={(() =>
                            {
                              const option = autoExecuteSkillConditionOptionForValue(rule.condition);
                              if (option === null)
                              {
                                return 'Set a trigger first.';
                              }
                              return option.paramHelperText;
                            })()}
                          />
                        </Grid>
                      )}
                    <Grid size={12}>
                      {isCompleteStatePassiveAutoExecuteSkillRule(rule)
                        ? (
                          <Typography variant={'body2'} color={'text.secondary'}>
                            {(() =>
                            {
                              const skillLabel = pickerRowForId(rule.skillId, skillAutocompleteOptions)?.label
                                ?? 'the selected skill';
                              const triggerLabel = autoExecuteSkillConditionOptionForValue(rule.condition)?.label
                                .toLowerCase() ?? 'configured';
                              if (rule.condition === 'enemiesNearby')
                              {
                                const rangeLabel = rule.enemyTriggerTiles === null
                                  ? 'default range'
                                  : `${rule.enemyTriggerTiles} tiles`;
                                const cooldownInline = rule.enemyCooldownFrames === null
                                  ? ''
                                  : formatApproxSecondsInline(rule.enemyCooldownFrames);
                                const cooldownText = cooldownInline === ''
                                  ? `at most every ${rule.enemyCooldownFrames} frames`
                                  : `at most every ${cooldownInline}`;
                                return `Uses ${skillLabel} when ${rule.enemyMinCount} or more enemies are within ${rangeLabel}, ${cooldownText}.`;
                              }
                              const paramClause = passiveRuleSummaryParamClause(rule.condition, rule.param);
                              return `Uses ${skillLabel} when "${triggerLabel}" fires ${paramClause}.`;
                            })()}
                          </Typography>
                        )
                        : (
                          <Typography variant={'body2'} color={'text.secondary'}>
                            {'Incomplete — finish all fields to save this rule.'}
                          </Typography>
                        )}
                    </Grid>
                  </Grid>
                </Stack>
              </Box>
            ))}
          <Button
            variant={'outlined'}
            size={'small'}
            startIcon={<Add/>}
            onClick={addAutoExecuteRule}
            sx={{ alignSelf: 'flex-start' }}
          >
            {'Add skill rule'}
          </Button>
        </Stack>

        <Divider/>

        <Stack spacing={2} alignItems={'stretch'}>
          <Typography variant={'subtitle2'}>
            {'Apply state'}
          </Typography>
          {ext.autoApplyStateRules.length === 0
            ? (
              <Typography variant={'body2'} color={'text.secondary'}>
                {'No apply-state rules configured.'}
              </Typography>
            )
            : ext.autoApplyStateRules.map((rule, index) => (
              <Box
                key={`auto-apply-${index}`}
                sx={{
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                  p: 2,
                }}
              >
                <Stack spacing={2}>
                  <Stack direction={'row'} alignItems={'center'} justifyContent={'space-between'}>
                    <Typography variant={'body2'} color={'text.secondary'}>
                      {`Rule ${index + 1}`}
                    </Typography>
                    <IconButton
                      size={'small'}
                      color={'error'}
                      aria-label={'Remove apply-state rule'}
                      onClick={() => removeAutoApplyRule(index)}
                    >
                      <DeleteOutline fontSize={'small'}/>
                    </IconButton>
                  </Stack>
                  <Grid container spacing={2} alignItems={'flex-start'}>
                    <Grid size={12}>
                      <Autocomplete<IdLabelRow, false, false, false>
                        fullWidth
                        size={'small'}
                        options={stateAutocompleteOptions}
                        getOptionLabel={(option) => option.label}
                        isOptionEqualToValue={(a, b) => a.id === b.id}
                        value={pickerRowForId(rule.stateId, stateAutocompleteOptions)}
                        onChange={(_event, option) =>
                        {
                          patchAutoApplyRule(index, {
                            stateId: option === null ? null : option.id,
                          });
                        }}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            variant={'outlined'}
                            label={'State to apply'}
                            placeholder={'Select a state…'}
                          />
                        )}
                      />
                    </Grid>
                    <Grid size={6}>
                      <TextField
                        select
                        variant={'outlined'}
                        label={'When to apply'}
                        value={rule.condition ?? ''}
                        onChange={(e) =>
                        {
                          const v = e.target.value;
                          if (v === '')
                          {
                            patchAutoApplyRule(index, {
                              condition: null,
                              param: null,
                            });
                            return;
                          }
                          patchAutoApplyRule(index, {
                            condition: v as RmmzAutoApplyStateCondition,
                          });
                        }}
                        size={'small'}
                        fullWidth
                        helperText={
                          autoApplyStateConditionOptionForValue(rule.condition)?.helperText
                          ?? 'Choose what triggers the apply.'
                        }
                      >
                        <MenuItem value={''}>
                          {'—'}
                        </MenuItem>
                        {RMMZ_AUTO_APPLY_STATE_CONDITION_OPTIONS.map((option) => (
                          <MenuItem
                            key={option.value}
                            value={option.value}
                          >
                            {option.label}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Grid>
                    <Grid size={6}>
                      <TextField
                        type={'number'}
                        variant={'outlined'}
                        label={
                          autoApplyStateConditionOptionForValue(rule.condition)?.paramLabel ?? 'Interval'
                        }
                        value={rule.param === null ? '' : String(rule.param)}
                        onChange={(e) =>
                        {
                          patchAutoApplyRule(index, {
                            param: parsePassivePositiveIntOrNull(e.target.value),
                          });
                        }}
                        size={'small'}
                        fullWidth
                        slotProps={{
                          htmlInput: {
                            min: 1,
                            step: 1,
                          },
                        }}
                        helperText={
                          autoApplyStateConditionOptionForValue(rule.condition)?.paramHelperText
                          ?? 'Set a trigger first.'
                        }
                      />
                    </Grid>
                    <Grid size={12}>
                      {isCompleteStatePassiveAutoApplyRule(rule)
                        ? (
                          <Typography variant={'body2'} color={'text.secondary'}>
                            {`Applies ${
                              pickerRowForId(rule.stateId, stateAutocompleteOptions)?.label ?? 'the selected state'
                            } when "${
                              autoApplyStateConditionOptionForValue(rule.condition)?.label.toLowerCase()
                              ?? 'configured'
                            }" fires ${passiveRuleSummaryParamClause(rule.condition, rule.param)}.`}
                          </Typography>
                        )
                        : (
                          <Typography variant={'body2'} color={'text.secondary'}>
                            {'Incomplete — finish all fields to save this rule.'}
                          </Typography>
                        )}
                    </Grid>
                  </Grid>
                </Stack>
              </Box>
            ))}
          <Button
            variant={'outlined'}
            size={'small'}
            startIcon={<Add/>}
            onClick={addAutoApplyRule}
            sx={{ alignSelf: 'flex-start' }}
          >
            {'Add apply-state rule'}
          </Button>
        </Stack>
      </Stack>
    </BoardSectionCard>
  );
};

export { StatePassiveConditionalPanel };
