import {
  Checkbox,
  FormControlLabel,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { FirstPage, LastPage } from '@mui/icons-material';
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';
import { grey, orange } from '@mui/material/colors';
import { RPG_EnemyDomainModel } from '@core/domain/entities/RPG_EnemyDomainModel.ts';

type EnemyPassiveAbsProps = {
  selectedEnemy: RPG_EnemyDomainModel;
  updateEnemy: (enemy: RPG_EnemyDomainModel) => void;
};

/**
 * J-Passive-ABS enemy note tags: block random affix rolls, optional per-slot roll odds.
 */
const EnemyPassiveAbs = ({
  selectedEnemy,
  updateEnemy,
}: EnemyPassiveAbsProps) =>
{
  const setNoPrefixes = (checked: boolean) =>
  {
    selectedEnemy.noRngPassivePrefixes = checked;
    updateEnemy(selectedEnemy);
  };

  const setNoSuffixes = (checked: boolean) =>
  {
    selectedEnemy.noRngPassiveSuffixes = checked;
    updateEnemy(selectedEnemy);
  };

  const setPrefixChance = (raw: string) =>
  {
    const t = raw.trim();

    if (t === '')
    {
      selectedEnemy.passiveAffixPrefixChance = null;
      updateEnemy(selectedEnemy);
      return;
    }

    const n = parseFloat(t);

    if (Number.isNaN(n) === false)
    {
      const rounded = Math.round(n);
      selectedEnemy.passiveAffixPrefixChance = Math.min(100, Math.max(0, rounded));
      updateEnemy(selectedEnemy);
    }
  };

  const setSuffixChance = (raw: string) =>
  {
    const t = raw.trim();

    if (t === '')
    {
      selectedEnemy.passiveAffixSuffixChance = null;
      updateEnemy(selectedEnemy);
      return;
    }

    const n = parseFloat(t);

    if (Number.isNaN(n) === false)
    {
      const rounded = Math.round(n);
      selectedEnemy.passiveAffixSuffixChance = Math.min(100, Math.max(0, rounded));
      updateEnemy(selectedEnemy);
    }
  };

  return (
    <BoardSectionCard
      title={'Random passive affixes'}
      subtitle={'Prefix / suffix roll overrides'}
      collapsible
      defaultExpanded={false}
    >
        <Stack spacing={2}>
          <Typography variant={'body2'} color={'text.secondary'}>
            Applies when this enemy is built from a map event. Checked means that side never receives a rolled passive
            affix.
          </Typography>
          <FormControlLabel
            control={
              <Checkbox
                checked={selectedEnemy.noRngPassivePrefixes}
                onChange={(
                  _,
                  checked
                ) => setNoPrefixes(checked)}
                icon={<FirstPage sx={{ color: grey[ 400 ] }}/>}
                checkedIcon={<FirstPage sx={{ color: orange[ 700 ] }}/>}
              />
            }
            label={'Block rolled prefix passives'}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={selectedEnemy.noRngPassiveSuffixes}
                onChange={(
                  _,
                  checked
                ) => setNoSuffixes(checked)}
                icon={<LastPage sx={{ color: grey[ 400 ] }}/>}
                checkedIcon={<LastPage sx={{ color: orange[ 700 ] }}/>}
              />
            }
            label={'Block rolled suffix passives'}
          />
          <TextField
            type={'number'}
            variant={'outlined'}
            label={'Prefix roll gate override (%)'}
            value={selectedEnemy.passiveAffixPrefixChance === null
              ? ''
              : String(selectedEnemy.passiveAffixPrefixChance)}
            onChange={(e) =>
            {
              setPrefixChance(e.target.value);
            }}
            size={'small'}
            fullWidth
            helperText={
              'Leave blank to use the engine default for this slot. 0 never rolls; 100 always attempts the weighted pool. Event comments can override this per spawn.'
            }
            slotProps={{ htmlInput: { min: 0, max: 100, step: 1 } }}
          />
          <TextField
            type={'number'}
            variant={'outlined'}
            label={'Suffix roll gate override (%)'}
            value={selectedEnemy.passiveAffixSuffixChance === null
              ? ''
              : String(selectedEnemy.passiveAffixSuffixChance)}
            onChange={(e) =>
            {
              setSuffixChance(e.target.value);
            }}
            size={'small'}
            fullWidth
            helperText={
              'Leave blank for engine default. Same rules as prefix. Map event Comment commands can use the same tags; last comment wins per slot.'
            }
            slotProps={{ htmlInput: { min: 0, max: 100, step: 1 } }}
          />
        </Stack>
    </BoardSectionCard>
  );
};

export { EnemyPassiveAbs };
