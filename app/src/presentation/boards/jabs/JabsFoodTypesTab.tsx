import { type ChangeEvent, useState } from 'react';
import {
  Grid,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  TextField,
} from '@mui/material';
import { Add, Delete, Key, LocalDining, Restaurant } from '@mui/icons-material';
import { Button } from '@mui/material';
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';
import { BoardEmptyState } from '@presentation/components/board/BoardEmptyState.tsx';
import { IconIndexField } from '@presentation/components/icons/IconIndexField.tsx';
import { useJabs } from '@presentation/context/resources/jabs.context.tsx';
import type { JabsFoodTypeDefinition } from '@core/domain/valueObjects/jabs-config.ts';

/**
 * The food groups a consumable can belong to.
 *
 * Eating binds the party to one group's run of states, and only one runs at a time. The keys here are the same ones
 * the chain states are tagged with, so this list is the vocabulary the item board offers rather than a second
 * opinion about what the groups are - rename a key here and the states it refers to will no longer be found.
 */
const JabsFoodTypesTab = () =>
{
  const {
    jabsConfig,
    setConfig,
  } = useJabs();

  const [ selectedIndex, setSelectedIndex ] = useState<number>(0);

  const foodTypes = jabsConfig?.foodTypes ?? [];
  const selectedType = foodTypes[ selectedIndex ] ?? null;

  /**
   * Replaces the whole list, leaving every other block of the config untouched.
   * @param {JabsFoodTypeDefinition[]} updated The full replacement list.
   */
  const applyFoodTypes = (updated: JabsFoodTypeDefinition[]) =>
  {
    setConfig(prev =>
    {
      // spread rather than naming the blocks: listing them by hand is what silently drops any block added later.
      const base = prev ?? jabsConfig!;

      return {
        ...base,
        foodTypes: updated,
      };
    });
  };

  /**
   * Applies a partial change to the selected group.
   * @param {Partial<JabsFoodTypeDefinition>} patch The fields that changed.
   */
  const patchSelected = (patch: Partial<JabsFoodTypeDefinition>) =>
  {
    if (selectedType === null)
    {
      return;
    }

    applyFoodTypes(foodTypes.map((type, index) => index === selectedIndex
      ? {
        ...type,
        ...patch,
      }
      : type));
  };

  /**
   * Appends a blank group and selects it.
   */
  const handleAdd = () =>
  {
    applyFoodTypes([
      ...foodTypes,
      {
        key: '',
        name: '',
        iconIndex: 0,
      },
    ]);
    setSelectedIndex(foodTypes.length);
  };

  /**
   * Removes the selected group.
   */
  const handleDelete = () =>
  {
    if (selectedType === null)
    {
      return;
    }

    const updated = foodTypes.filter((_, index) => index !== selectedIndex);

    applyFoodTypes(updated);
    setSelectedIndex(Math.max(0, Math.min(selectedIndex, updated.length - 1)));
  };

  /**
   * Updates the key the item tag is written with.
   * @param {ChangeEvent<HTMLInputElement>} event The field's change event.
   */
  const handleKeyOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    // the tag carries letters only, so anything else is refused as it is typed rather than written and then read
    // back by the game as a shorter key than was intended.
    const cleaned = event.target.value
      .replace(/[^a-zA-Z]/g, '')
      .toLowerCase();

    patchSelected({ key: cleaned });
  };

  /**
   * Updates the display name shown wherever this group is offered.
   * @param {ChangeEvent<HTMLInputElement>} event The field's change event.
   */
  const handleNameOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    patchSelected({ name: event.target.value });
  };

  /**
   * Updates the icon shown beside this group.
   * @param {number} value The chosen icon index.
   */
  const handleIconIndexOnChangeEvent = (value: number) =>
  {
    patchSelected({ iconIndex: value });
  };

  return (
    <Grid container rowSpacing={2} columnSpacing={2} sx={{ height: '100%', p: 2 }}>
      <Grid size={4}>
        <BoardSectionCard title={'Food Groups'} density={'compact'}>
          <Stack spacing={1}>
            <List dense>
              {foodTypes.map((type, index) => (
                <ListItem key={index} dense disableGutters>
                  <ListItemButton
                    onClick={() => setSelectedIndex(index)}
                    selected={selectedIndex === index}
                  >
                    <ListItemIcon>
                      {selectedIndex === index
                        ? <Restaurant color={'secondary'}/>
                        : <LocalDining color={'info'}/>}
                    </ListItemIcon>
                    <ListItemText primary={type.name.length > 0
                      ? type.name
                      : '(unnamed)'}/>
                  </ListItemButton>
                </ListItem>
              ))}
            </List>

            <Stack direction={'row'} spacing={1}>
              <Button size={'small'} startIcon={<Add/>} onClick={handleAdd}>
                Add
              </Button>
              <Button
                size={'small'}
                color={'error'}
                startIcon={<Delete/>}
                onClick={handleDelete}
                disabled={selectedType === null}
              >
                Remove
              </Button>
            </Stack>
          </Stack>
        </BoardSectionCard>
      </Grid>

      <Grid size={8}>
        {selectedType !== null
          ? (
            <BoardSectionCard title={'Food Group'}>
              <Grid container rowSpacing={2} columnSpacing={2} alignItems={'flex-start'}>
                <Grid size={6}>
                  <TextField
                    required
                    variant={'outlined'}
                    label={'Key'}
                    value={selectedType.key}
                    onChange={handleKeyOnChangeEvent}
                    size={'small'}
                    fullWidth
                    helperText={'Must match the key on this group\'s states.'}
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position={'start'}>
                            <Key/>
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                </Grid>

                <Grid size={6}>
                  <TextField
                    variant={'outlined'}
                    label={'Name'}
                    value={selectedType.name}
                    onChange={handleNameOnChangeEvent}
                    size={'small'}
                    fullWidth
                  />
                </Grid>

                <Grid size={12}>
                  <IconIndexField
                    value={selectedType.iconIndex}
                    onChange={handleIconIndexOnChangeEvent}
                  />
                </Grid>
              </Grid>
            </BoardSectionCard>
          )
          : (
            <BoardEmptyState
              icon={<LocalDining sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }}/>}
              message={'Select a food group from the list, or add one.'}
            />
          )}
      </Grid>
    </Grid>
  );
};

export default JabsFoodTypesTab;
