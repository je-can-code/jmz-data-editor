import { Box, Chip, FormControlLabel, Stack, Switch, Tooltip, Typography } from '@mui/material';
import { RestartAlt } from '@mui/icons-material';
import IconButton from '@mui/material/IconButton';
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';
import DifficultyParameterControl from '@boards/difficulty/DifficultyParameterControl.tsx';
import {
  BATTLER_SIDES,
  countModifiedInFamily,
  countModifiedParameters,
  DIFFICULTY_PARAMETER_FAMILIES,
  isParameterRowModified,
  readParameter,
  totalParameterSlots,
} from '@core/domain/valueObjects/difficulty-parameters.ts';
import type {
  BattlerSideKey,
  ParameterFamily,
  ParameterFamilyKey,
} from '@core/domain/valueObjects/difficulty-parameters.ts';
import { UNCHANGED_PERCENT } from '@core/domain/valueObjects/difficulty-config.ts';
import type { DifficultyLayer } from '@core/domain/valueObjects/difficulty-config.ts';

/**
 * Column widths, shared by the header row and every parameter row so the two stay aligned.
 */
const LABEL_WIDTH = 170;
const FIELD_WIDTH = 300;
const DELTA_WIDTH = 48;

type DifficultyParametersSectionProps = {
  layer: DifficultyLayer;
  onChange: (next: DifficultyLayer) => void;
  showOnlyModified: boolean;
  onShowOnlyModifiedChange: (next: boolean) => void;
};

/**
 * The parameter half of a difficulty layer: fifty-six values across three families and both sides
 * of a fight.
 *
 * Two decisions shape this surface, both driven by what the data actually looks like rather than by
 * what the file structure suggests.
 *
 * The sides sit **side by side on one row** rather than in two separate blocks. Difficulty is
 * authored as a relationship - actors up, enemies down - so the two numbers being compared belong
 * next to each other, and the reader scans twenty-eight rows instead of hunting fifty-six fields.
 *
 * Every parameter is always **rendered and editable**, and the change filter is opt-in rather than
 * the default. Across a real seventeen-layer configuration barely an eighth of the values differ
 * from unchanged, which makes filtering tempting - but the parameters a layer has not touched are
 * precisely the ones somebody opening this board is usually here to touch, so hiding them by default
 * hides the job. The filter earns its place for reviewing what a layer already does; it is a lens,
 * not a starting position.
 *
 * What carries the eye instead is emphasis: an unchanged value is dimmed and a changed one is not,
 * so the meaningful handful stand out of the wall of hundreds without anything being hidden.
 */
const DifficultyParametersSection = ({
  layer,
  onChange,
  showOnlyModified,
  onShowOnlyModifiedChange,
}: DifficultyParametersSectionProps) =>
{
  const modifiedCount = countModifiedParameters(layer);
  const totalCount = totalParameterSlots();

  /**
   * Writes one parameter back into the layer, leaving every other value as it was.
   * @param {BattlerSideKey} side Which side of the fight is being edited.
   * @param {ParameterFamilyKey} family Which family the parameter belongs to.
   * @param {number} parameterId The parameter's index within its family.
   * @param {number} value The new percentage.
   */
  const setParameter = (
    side: BattlerSideKey,
    family: ParameterFamilyKey,
    parameterId: number,
    value: number) =>
  {
    const effects = layer[ side ];
    const nextValues = effects[ family ].map((existing, index) => (index === parameterId
      ? value
      : existing));

    onChange({
      ...layer,
      [ side ]: {
        ...effects,
        [ family ]: nextValues,
      },
    });
  };

  /**
   * Returns both sides of one parameter to unchanged in a single edit.
   * @param {ParameterFamilyKey} family Which family the parameter belongs to.
   * @param {number} parameterId The parameter's index within its family.
   */
  const resetParameterRow = (family: ParameterFamilyKey, parameterId: number) =>
  {
    const nextLayer = { ...layer };

    BATTLER_SIDES.forEach(side =>
    {
      const effects = nextLayer[ side.key ];

      nextLayer[ side.key ] = {
        ...effects,
        [ family ]: effects[ family ].map((existing, index) => (index === parameterId
          ? UNCHANGED_PERCENT
          : existing)),
      };
    });

    onChange(nextLayer);
  };

  /**
   * Draws the legend once per family, naming what each track colour means.
   *
   * Needed because the tracks stack rather than sitting in labelled columns: the two are told apart
   * by colour, and a colour has to be introduced somewhere.
   * @returns {JSX.Element}
   */
  const renderHeaderRow = () => (
    <Stack direction={'row'} spacing={2} alignItems={'center'} sx={{ pb: 0.5, pl: `${String(LABEL_WIDTH)}px` }}>
      {BATTLER_SIDES.map(side => (
        <Stack key={side.key} direction={'row'} spacing={0.75} alignItems={'center'}>
          <Box sx={{ width: 16, height: 4, borderRadius: 2, bgcolor: `${side.tone}.main` }}/>
          <Typography variant={'caption'} color={'text.secondary'}>
            {side.label}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );

  /**
   * Draws one parameter: its name, a stacked track per side, and a way back to unchanged.
   *
   * The two sides stack rather than sitting side by side so their bars share an axis. Difficulty is
   * authored as a relationship between them, and a relationship read by comparing two lengths in
   * different places on the screen is a relationship read badly - stacked, one bar being twice the
   * other is simply visible.
   * @param {ParameterFamily} family The family being drawn.
   * @param {number} parameterId The parameter's index within that family.
   * @param {string} name The parameter's display name.
   * @returns {JSX.Element}
   */
  const renderParameterRow = (family: ParameterFamily, parameterId: number, name: string) =>
  {
    const rowModified = isParameterRowModified(layer, family.key, parameterId);

    return (
      <Stack
        key={`${family.key}-${String(parameterId)}`}
        direction={'row'}
        spacing={1}
        alignItems={'center'}
        sx={{ py: 0.25 }}
      >
        <Box sx={{ width: LABEL_WIDTH }}>
          <Typography
            variant={'body2'}
            sx={{ fontWeight: rowModified ? 600 : 400 }}
          >
            {name}
          </Typography>
        </Box>

        <Stack spacing={0.25} sx={{ width: FIELD_WIDTH }}>
          {BATTLER_SIDES.map(side => (
            <DifficultyParameterControl
              key={side.key}
              value={readParameter(layer[ side.key ], family.key, parameterId)}
              onChange={next => setParameter(side.key, family.key, parameterId, next)}
              ariaLabel={`${name} for ${side.label}`}
              tone={side.tone}
            />
          ))}
        </Stack>

        <Box sx={{ width: DELTA_WIDTH, textAlign: 'right' }}>
          {rowModified
            ? (
              <Tooltip title={'Return both sides to 100'}>
                <IconButton
                  size={'small'}
                  onClick={() => resetParameterRow(family.key, parameterId)}
                >
                  <RestartAlt fontSize={'small'}/>
                </IconButton>
              </Tooltip>
            )
            : null}
        </Box>
      </Stack>
    );
  };

  /**
   * Draws one family, or reports that the filter has emptied it.
   * @param {ParameterFamily} family The family being drawn.
   * @returns {JSX.Element}
   */
  const renderFamily = (family: ParameterFamily) =>
  {
    const familyModifiedCount = countModifiedInFamily(layer, family.key);

    const visibleParameters = family.parameters.filter(parameter => (showOnlyModified === false
      || isParameterRowModified(layer, family.key, parameter.id)));

    return (
      <BoardSectionCard
        key={family.key}
        title={family.title}
        subtitle={family.subtitle}
        collapsible
        defaultExpanded
      >
        <Stack spacing={1}>
          <Box>
            <Chip
              size={'small'}
              label={familyModifiedCount === 0
                ? 'No changes'
                : `${String(familyModifiedCount)} changed`}
              color={familyModifiedCount === 0
                ? 'default'
                : 'primary'}
              variant={familyModifiedCount === 0
                ? 'outlined'
                : 'filled'}
            />
          </Box>

          {visibleParameters.length === 0
            ? (
              <Typography variant={'body2'} color={'text.secondary'}>
                Nothing changed here.
              </Typography>
            )
            : (
              <Stack spacing={0.75}>
                {renderHeaderRow()}
                {visibleParameters.map(parameter => renderParameterRow(family, parameter.id, parameter.name))}
              </Stack>
            )}
        </Stack>
      </BoardSectionCard>
    );
  };

  return (
    <Stack spacing={2}>
      <Stack direction={'row'} spacing={2} alignItems={'center'}>
        <FormControlLabel
          control={
            <Switch
              checked={showOnlyModified}
              onChange={event => onShowOnlyModifiedChange(event.target.checked)}
            />
          }
          label={'Only what this layer changes'}
        />
        <Typography variant={'body2'} color={'text.secondary'}>
          {`${String(modifiedCount)} of ${String(totalCount)} changed`}
        </Typography>
      </Stack>

      {DIFFICULTY_PARAMETER_FAMILIES.map(renderFamily)}
    </Stack>
  );
};

export default DifficultyParametersSection;
