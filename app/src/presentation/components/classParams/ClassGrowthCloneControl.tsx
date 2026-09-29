import { useState } from 'react';
import { Autocomplete, Button, Stack, TextField } from '@mui/material';
import { ContentCopy } from '@mui/icons-material';
import type { ClassGrowth } from '@services/classes/ClassGrowthCloner.ts';

/**
 * A class this one's growth can be cloned from: its identity for the picker, and the growth itself.
 */
type ClassGrowthSource = ClassGrowth & {
  id: number;
  name: string;
};

type ClassGrowthCloneControlProps = {
  /** The id of the class being edited, which can never be its own source. */
  classId: number;
  /** Every class in the database, in the order the board lists them. */
  sources: ClassGrowthSource[];
  /** Replaces the edited class's growth with the chosen class's. */
  onClone: (source: ClassGrowthSource) => void;
};

/**
 * The top of the Classes board's Parameter Growth card: pick another class, then clone its growth over this
 * one's, formulas and baked levels alike.
 *
 * The chosen class stays chosen as the author moves between classes, since the point is to build several
 * classes from one base without picking it again every time.
 */
function ClassGrowthCloneControl({ classId, sources, onClone }: ClassGrowthCloneControlProps)
{
  const [ chosen, setChosen ] = useState<ClassGrowthSource | null>(null);

  // cloning a class onto itself would change nothing, so it is never offered.
  const canClone = chosen !== null && chosen.id !== classId;

  /**
   * Clones the chosen class's growth onto the class being edited.
   */
  const handleClone = () =>
  {
    // the button only enables once another class is chosen.
    if (chosen === null)
    {
      return;
    }

    onClone(chosen);
  };

  return (
    <Stack direction={'row'} spacing={1} alignItems={'flex-start'}>
      <Autocomplete<ClassGrowthSource>
        size={'small'}
        sx={{ flex: 1 }}
        options={sources}
        value={chosen}
        onChange={(_, option) => setChosen(option)}
        getOptionKey={(option) => option.id}
        getOptionLabel={(option) => `${option.id}: ${option.name}`}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        renderInput={(params) => (
          <TextField
            {...params}
            label={'Clone growth from'}
            helperText={'Replaces every formula and level below with the chosen class\'s.'}
          />
        )}
      />
      <Button
        variant={'outlined'}
        startIcon={<ContentCopy/>}
        disabled={canClone === false}
        onClick={handleClone}
        sx={{ flexShrink: 0, mt: '2px' }}
      >
        Clone
      </Button>
    </Stack>
  );
}

export type { ClassGrowthSource, ClassGrowthCloneControlProps };
export { ClassGrowthCloneControl };
