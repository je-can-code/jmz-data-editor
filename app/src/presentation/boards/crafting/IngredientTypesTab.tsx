import { type ChangeEvent, type MouseEvent, useState } from 'react';
import {
  Box,
  Divider,
  Grid,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  styled,
  TextField,
  Typography,
} from '@mui/material';
import { Add, ContentCopy, Key, LocalDining, Remove, Restaurant } from '@mui/icons-material';
import { BoardEmptyState } from '@presentation/components/board/BoardEmptyState.tsx';
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';
import { IconIndexField } from '@presentation/components/icons/IconIndexField.tsx';

import IngredientType = Crafting.IngredientType;

// matches the monospaced list rows the other crafting tabs use, so keys line up while scanning.
const EntryText = styled(ListItemText)`
  font-family: monospace;
`;

/**
 * The properties required to author the ingredient type vocabulary.
 */
type IngredientTypesTabProps = {
  /** The types as they currently stand. */
  types: IngredientType[];
  /** Called with the full replacement list whenever anything changes. */
  onChange: (updated: IngredientType[]) => void;
};

/**
 * Builds a blank type, ready to be named.
 * @returns {IngredientType} An empty type row.
 */
const buildEmptyType = (): IngredientType =>
{
  return {
    key: '',
    name: '',
    iconIndex: 0,
    description: '',
  };
};

/**
 * The vocabulary of ingredient types that items, weapons, and armors can count as, and that recipe slots can ask
 * for.
 *
 * Everything else in the editor reads its choices from this list, so a type only exists once it is defined here.
 * The list is deliberately flat: an ingredient carries whatever combination of types makes sense for it, and a
 * recipe slot accepts anything carrying all the types it asks for.
 * @param {IngredientTypesTabProps} props The types and the change handler.
 */
const IngredientTypesTab = ({ types, onChange }: IngredientTypesTabProps) =>
{
  //region state
  const [ selectedIndex, setSelectedIndex ] = useState<number>(0);
  const [ contextMenu, setContextMenu ] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);
  //endregion state

  // the selection is held as an index so that adding and removing rows keeps the cursor somewhere sensible.
  const selectedType = types[ selectedIndex ] ?? null;

  //region actions
  /**
   * Selects a type for editing.
   * @param {number} index The index of the type that was clicked.
   */
  const handleListItemOnClickEvent = (index: number) =>
  {
    setSelectedIndex(index);
  };

  /**
   * Opens the list's context menu where the pointer is.
   * @param {MouseEvent} event The originating right-click.
   */
  const handleListContextMenu = (event: MouseEvent) =>
  {
    event.preventDefault();

    const next = contextMenu === null
      ? {
        mouseX: event.clientX + 2,
        mouseY: event.clientY - 6,
      }
      : null;

    setContextMenu(next);
  };

  /**
   * Closes the list's context menu.
   */
  const handleContextMenuOnCloseEvent = () =>
  {
    setContextMenu(null);
  };
  //endregion actions

  //region updates
  /**
   * Inserts a blank type at a position and selects it.
   * @param {number} index Where the new type should sit.
   */
  const handleAddType = (index: number) =>
  {
    const updated = [ ...types ];
    updated.splice(index, 0, buildEmptyType());

    onChange(updated);
    setSelectedIndex(index);
  };

  /**
   * Copies the selected type to a position and selects the copy.
   * @param {number} index Where the copy should sit.
   */
  const handleCloneType = (index: number) =>
  {
    if (selectedType === null)
    {
      return;
    }

    const updated = [ ...types ];
    updated.splice(index, 0, { ...selectedType });

    onChange(updated);
    setSelectedIndex(index);
  };

  /**
   * Removes a type, leaving the cursor on the row that took its place.
   * @param {number} index The type to remove.
   */
  const handleDeleteType = (index: number) =>
  {
    if (types.length === 0)
    {
      return;
    }

    const updated = [ ...types ];
    updated.splice(index, 1);

    onChange(updated);
    setSelectedIndex(Math.max(0, Math.min(index, updated.length - 1)));
  };

  /**
   * Applies a partial change to the selected type.
   * @param {Partial<IngredientType>} patch The fields that changed.
   */
  const patchSelectedType = (patch: Partial<IngredientType>) =>
  {
    if (selectedType === null)
    {
      return;
    }

    const updated = [ ...types ];
    updated[ selectedIndex ] = {
      ...selectedType,
      ...patch,
    };

    onChange(updated);
  };

  /**
   * Updates the key an ingredient's tag is written with.
   * @param {ChangeEvent<HTMLInputElement>} event The field's change event.
   */
  const handleKeyOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    // the tag can only carry letters, digits, and underscores, so anything else is refused as it is typed rather
    // than accepted here and silently ignored by the game later.
    const cleaned = event.target.value
      .replace(/[^\w]/g, '')
      .toLowerCase();

    patchSelectedType({ key: cleaned });
  };

  /**
   * Updates the display name shown wherever this type is offered.
   * @param {ChangeEvent<HTMLInputElement>} event The field's change event.
   */
  const handleNameOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    patchSelectedType({ name: event.target.value });
  };

  /**
   * Updates the icon shown beside this type.
   * @param {number} value The chosen icon index.
   */
  const handleIconIndexOnChangeEvent = (value: number) =>
  {
    patchSelectedType({ iconIndex: value });
  };

  /**
   * Updates the note describing what belongs in this type.
   * @param {ChangeEvent<HTMLInputElement>} event The field's change event.
   */
  const handleDescriptionOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    patchSelectedType({ description: event.target.value });
  };
  //endregion updates

  //region render
  /**
   * Renders one row of the type list.
   * @param {IngredientType} type The type to render.
   * @param {number} index Its position in the list.
   */
  const renderListItem = (
    type: IngredientType,
    index: number
  ) =>
  {
    // an unnamed row still needs to be findable, or a freshly added type looks like it never arrived.
    const label = type.key.length > 0
      ? `${type.key}: ${type.name}`
      : '(unnamed)';

    return (
      <ListItem
        key={index}
        dense
        disableGutters
      >
        <ListItemButton
          onClick={() => handleListItemOnClickEvent(index)}
          selected={selectedIndex === index}
        >
          <ListItemIcon>
            {(selectedIndex === index)
              ? <Restaurant color={'secondary'}/>
              : <LocalDining color={'info'}/>}
          </ListItemIcon>
          <EntryText
            primary={label}
            disableTypography/>
        </ListItemButton>
      </ListItem>
    );
  };
  //endregion render

  return <>
    <Grid container rowSpacing={2} columnSpacing={2} sx={{ height: '100%' }}>
      <Grid size={4}>
        <BoardSectionCard title={'Ingredient Types'} density={'compact'}>
          {/*
            the list scrolls inside itself rather than growing the page. a vocabulary runs to dozens of entries, and
            an unbounded list pushes the editor below the fold - so picking something near the bottom meant scrolling
            back up to see what you had picked.
          */}
          <Box
            onContextMenu={handleListContextMenu}
            sx={{
              cursor: 'context-menu',
              maxHeight: '70vh',
              overflowY: 'auto',
            }}
          >
            <List dense>
              {types.map((type, index) => renderListItem(type, index))}
            </List>
          </Box>
        </BoardSectionCard>
      </Grid>

      {/* pinned so the editor stays in view no matter how far down the list the selection is. */}
      <Grid
        size={8}
        sx={{
          position: 'sticky',
          top: 0,
          alignSelf: 'flex-start',
        }}
      >
        {selectedType !== null
          ? (
            <BoardSectionCard title={'Ingredient Type'}>
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
                    helperText={'Letters, numbers, and underscores.'}
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
                    helperText={'Shown when a recipe asks for this type.'}
                  />
                </Grid>

                <Grid size={12}>
                  <IconIndexField
                    value={selectedType.iconIndex}
                    onChange={handleIconIndexOnChangeEvent}
                  />
                </Grid>

                <Grid size={12}>
                  <TextField
                    variant={'outlined'}
                    label={'Description'}
                    value={selectedType.description}
                    onChange={handleDescriptionOnChangeEvent}
                    size={'small'}
                    multiline
                    fullWidth
                    rows={4}
                    helperText={'What belongs in this type. For your reference while authoring.'}
                  />
                </Grid>
              </Grid>
            </BoardSectionCard>
          )
          : (
            <BoardEmptyState
              icon={<LocalDining sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }}/>}
              message={'Select an ingredient type from the list, or right-click to add one.'}
            />
          )}
      </Grid>
    </Grid>

    <Menu
      open={contextMenu !== null}
      onClose={handleContextMenuOnCloseEvent}
      anchorReference={'anchorPosition'}
      anchorPosition={contextMenu !== null
        ? {
          top: contextMenu.mouseY,
          left: contextMenu.mouseX
        }
        : undefined}
    >
      <MenuItem onClick={() =>
      {
        handleAddType(selectedIndex);
        handleContextMenuOnCloseEvent();
      }}>
        <ListItemIcon><Add/></ListItemIcon>
        <Typography>Add new above</Typography>
      </MenuItem>

      <MenuItem onClick={() =>
      {
        handleAddType(selectedIndex + 1);
        handleContextMenuOnCloseEvent();
      }}>
        <ListItemIcon><Add/></ListItemIcon>
        <Typography>Add new below</Typography>
      </MenuItem>

      <Divider/>

      <MenuItem onClick={() =>
      {
        handleCloneType(selectedIndex);
        handleContextMenuOnCloseEvent();
      }}>
        <ListItemIcon><ContentCopy/></ListItemIcon>
        <Typography>Clone above</Typography>
      </MenuItem>

      <MenuItem onClick={() =>
      {
        handleCloneType(selectedIndex + 1);
        handleContextMenuOnCloseEvent();
      }}>
        <ListItemIcon><ContentCopy/></ListItemIcon>
        <Typography>Clone below</Typography>
      </MenuItem>

      <MenuItem dense onClick={() =>
      {
        handleDeleteType(selectedIndex);
        handleContextMenuOnCloseEvent();
      }}>
        <ListItemIcon><Remove/></ListItemIcon>
        <Typography>Remove Selected</Typography>
      </MenuItem>
    </Menu>
  </>;
};

export { IngredientTypesTab };
