import { type ChangeEvent, type MouseEvent, useState } from 'react';
import {
  Box,
  Divider,
  Grid,
  IconButton,
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
  Tooltip,
  Typography,
} from '@mui/material';
import { Add, Construction, ContentCopy, Engineering, Key, Remove } from '@mui/icons-material';
import { BoardEmptyState } from '@presentation/components/board/BoardEmptyState.tsx';
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';
import { IconIndexField } from '@presentation/components/icons/IconIndexField.tsx';

import Profession = Crafting.Profession;

// matches the monospaced list rows the other crafting tabs use, so keys line up while scanning.
const EntryText = styled(ListItemText)`
  font-family: monospace;
`;

/**
 * The properties required to author the professions.
 */
type ProfessionsTabProps = {
  /** The professions as they currently stand. */
  professions: Profession[];
  /** Called with the full replacement list whenever anything changes. */
  onChange: (updated: Profession[]) => void;
};

/**
 * Builds a blank profession, ready to be named.
 * @returns {Profession} An empty profession row.
 */
const buildEmptyProfession = (): Profession =>
{
  return {
    key: '',
    name: '',
    iconIndex: 0,
    description: '',
    scrapItemId: 0,
    tierPrices: [],
  };
};

/**
 * The crafts a category can belong to, each with the currency it is bought with and the ladder its tiers cost.
 *
 * A profession answers the two questions a category cannot: which scrap buys its recipes, and what a tier costs.
 * The price table is indexed by tier with the lowest first, so its length is the profession's depth - cooking runs
 * four rungs deep and survival runs ten, and neither needs to know the other exists. A tier past the end of the
 * table has no price, which lets a roster grow past its economy without pricing itself by accident, and a
 * profession with no prices at all is simply not for sale.
 * @param {ProfessionsTabProps} props The professions and the change handler.
 */
const ProfessionsTab = ({ professions, onChange }: ProfessionsTabProps) =>
{
  //region state
  const [ selectedIndex, setSelectedIndex ] = useState<number>(0);
  const [ contextMenu, setContextMenu ] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);
  //endregion state

  // the selection is held as an index so that adding and removing rows keeps the cursor somewhere sensible.
  const selectedProfession = professions[ selectedIndex ] ?? null;

  // an absent table and an empty one mean the same thing here, so the editor only ever deals in an array.
  const selectedTierPrices = selectedProfession?.tierPrices ?? [];

  //region actions
  /**
   * Selects a profession for editing.
   * @param {number} index The index of the profession that was clicked.
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
   * Inserts a blank profession at a position and selects it.
   * @param {number} index Where the new profession should sit.
   */
  const handleAddProfession = (index: number) =>
  {
    const updated = [ ...professions ];
    updated.splice(index, 0, buildEmptyProfession());

    onChange(updated);
    setSelectedIndex(index);
  };

  /**
   * Copies the selected profession to a position and selects the copy.
   * @param {number} index Where the copy should sit.
   */
  const handleCloneProfession = (index: number) =>
  {
    if (selectedProfession === null)
    {
      return;
    }

    // the price table is copied rather than shared, or retuning the clone would silently retune its source.
    const clone = {
      ...selectedProfession,
      tierPrices: [ ...selectedTierPrices ],
    };

    const updated = [ ...professions ];
    updated.splice(index, 0, clone);

    onChange(updated);
    setSelectedIndex(index);
  };

  /**
   * Removes a profession, leaving the cursor on the row that took its place.
   * @param {number} index The profession to remove.
   */
  const handleDeleteProfession = (index: number) =>
  {
    if (professions.length === 0)
    {
      return;
    }

    const updated = [ ...professions ];
    updated.splice(index, 1);

    onChange(updated);
    setSelectedIndex(Math.max(0, Math.min(index, updated.length - 1)));
  };

  /**
   * Applies a partial change to the selected profession.
   * @param {Partial<Profession>} patch The fields that changed.
   */
  const patchSelectedProfession = (patch: Partial<Profession>) =>
  {
    if (selectedProfession === null)
    {
      return;
    }

    const updated = [ ...professions ];
    updated[ selectedIndex ] = {
      ...selectedProfession,
      ...patch,
    };

    onChange(updated);
  };

  /**
   * Updates the key categories name this profession by.
   * @param {ChangeEvent<HTMLInputElement>} event The field's change event.
   */
  const handleKeyOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    // categories reference a profession by this key, so it is held to the same shape as every other key in the
    // configuration rather than accepting punctuation that would have to be escaped later.
    const cleaned = event.target.value
      .replace(/[^\w-]/g, '')
      .toLowerCase();

    patchSelectedProfession({ key: cleaned });
  };

  /**
   * Updates the display name shown wherever this profession is offered.
   * @param {ChangeEvent<HTMLInputElement>} event The field's change event.
   */
  const handleNameOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    patchSelectedProfession({ name: event.target.value });
  };

  /**
   * Updates the icon shown beside this profession.
   * @param {number} value The chosen icon index.
   */
  const handleIconIndexOnChangeEvent = (value: number) =>
  {
    patchSelectedProfession({ iconIndex: value });
  };

  /**
   * Updates the note describing what this profession makes.
   * @param {ChangeEvent<HTMLInputElement>} event The field's change event.
   */
  const handleDescriptionOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    patchSelectedProfession({ description: event.target.value });
  };

  /**
   * Updates the item spent to learn this profession's recipes.
   * @param {ChangeEvent<HTMLInputElement>} event The field's change event.
   */
  const handleScrapItemIdOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    const parsed = Number.parseInt(event.target.value, 10);

    // a field cleared mid-edit parses to NaN, which would otherwise be written straight into the configuration.
    patchSelectedProfession({ scrapItemId: Number.isNaN(parsed) ? 0 : Math.max(0, parsed) });
  };

  /**
   * Updates the price of a single tier.
   * @param {number} tierIndex The zero-based position in the table, so tier 1 is index 0.
   * @param {ChangeEvent<HTMLInputElement>} event The field's change event.
   */
  const handleTierPriceOnChangeEvent = (tierIndex: number, event: ChangeEvent<HTMLInputElement>) =>
  {
    const parsed = Number.parseInt(event.target.value, 10);
    const price = Number.isNaN(parsed) ? 0 : Math.max(0, parsed);

    patchSelectedProfession({ tierPrices: selectedTierPrices.with(tierIndex, price) });
  };

  /**
   * Adds a rung to the end of the price ladder, seeded from the rung below it.
   */
  const handleAddTier = () =>
  {
    // a new rung that costs nothing reads as free rather than as unpriced, so it starts from what came before.
    const previous = selectedTierPrices.at(-1) ?? 0;

    patchSelectedProfession({ tierPrices: [ ...selectedTierPrices, previous ] });
  };

  /**
   * Removes the deepest rung from the price ladder.
   */
  const handleRemoveTier = () =>
  {
    patchSelectedProfession({ tierPrices: selectedTierPrices.slice(0, -1) });
  };
  //endregion updates

  //region render
  /**
   * Renders one row of the profession list.
   * @param {Profession} profession The profession to render.
   * @param {number} index Its position in the list.
   */
  const renderListItem = (
    profession: Profession,
    index: number
  ) =>
  {
    // an unnamed row still needs to be findable, or a freshly added profession looks like it never arrived.
    const label = profession.key.length > 0
      ? `${profession.key}: ${profession.name}`
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
              ? <Engineering color={'secondary'}/>
              : <Construction color={'info'}/>}
          </ListItemIcon>
          <EntryText
            primary={label}
            disableTypography/>
        </ListItemButton>
      </ListItem>
    );
  };

  /**
   * Renders the price field for one rung of the ladder.
   * @param {number} price What that rung currently costs.
   * @param {number} tierIndex Its zero-based position, so tier 1 is index 0.
   */
  const renderTierPriceField = (price: number, tierIndex: number) =>
  {
    return (
      <Grid size={3} key={tierIndex}>
        <TextField
          variant={'outlined'}
          type={'number'}
          label={`Tier ${tierIndex + 1}`}
          value={price}
          onChange={(event) => handleTierPriceOnChangeEvent(tierIndex, event as ChangeEvent<HTMLInputElement>)}
          size={'small'}
          fullWidth
        />
      </Grid>
    );
  };
  //endregion render

  return <>
    <Grid container rowSpacing={2} columnSpacing={2} sx={{ height: '100%' }}>
      <Grid size={4}>
        <BoardSectionCard title={'Professions'} density={'compact'}>
          {/*
            the list scrolls inside itself rather than growing the page, matching the other crafting tabs. there
            are only a handful of professions today, but the layout should not change shape if that stops being
            true.
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
              {professions.map((profession, index) => renderListItem(profession, index))}
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
        {selectedProfession !== null
          ? (
            <BoardSectionCard title={'Profession'}>
              <Grid container rowSpacing={2} columnSpacing={2} alignItems={'flex-start'}>
                <Grid size={6}>
                  <TextField
                    required
                    variant={'outlined'}
                    label={'Key'}
                    value={selectedProfession.key}
                    onChange={handleKeyOnChangeEvent}
                    size={'small'}
                    fullWidth
                    helperText={'What categories name this profession by.'}
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
                    value={selectedProfession.name}
                    onChange={handleNameOnChangeEvent}
                    size={'small'}
                    fullWidth
                    helperText={'Shown wherever this profession is presented.'}
                  />
                </Grid>

                <Grid size={6}>
                  <IconIndexField
                    value={selectedProfession.iconIndex}
                    onChange={handleIconIndexOnChangeEvent}
                  />
                </Grid>

                <Grid size={6}>
                  <TextField
                    variant={'outlined'}
                    type={'number'}
                    label={'Scrap Item Id'}
                    value={selectedProfession.scrapItemId}
                    onChange={handleScrapItemIdOnChangeEvent}
                    size={'small'}
                    fullWidth
                    helperText={'The item spent to learn these recipes. 0 means nothing here is bought.'}
                  />
                </Grid>

                <Grid size={12}>
                  <TextField
                    variant={'outlined'}
                    label={'Description'}
                    value={selectedProfession.description}
                    onChange={handleDescriptionOnChangeEvent}
                    size={'small'}
                    multiline
                    fullWidth
                    rows={3}
                    helperText={'What this profession makes. For your reference while authoring.'}
                  />
                </Grid>

                <Grid size={12}>
                  <Divider/>
                </Grid>

                <Grid size={12}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant={'subtitle2'}>
                      {`Tier Prices (${selectedTierPrices.length} ${selectedTierPrices.length === 1
                        ? 'tier'
                        : 'tiers'})`}
                    </Typography>

                    <Tooltip title={'Add a deeper tier'}>
                      <IconButton size={'small'} onClick={handleAddTier}>
                        <Add fontSize={'small'}/>
                      </IconButton>
                    </Tooltip>

                    <Tooltip title={'Remove the deepest tier'}>
                      {/* wrapped so the tooltip still works while the button is disabled at zero tiers. */}
                      <span>
                        <IconButton
                          size={'small'}
                          onClick={handleRemoveTier}
                          disabled={selectedTierPrices.length === 0}
                        >
                          <Remove fontSize={'small'}/>
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Box>

                  <Typography variant={'caption'} color={'text.secondary'}>
                    How much scrap a recipe of each tier costs to learn. The length of this ladder is how deep this
                    profession goes; a recipe tiered past the end of it has no price and is not for sale.
                  </Typography>
                </Grid>

                {selectedTierPrices.length > 0
                  ? selectedTierPrices.map((price, tierIndex) => renderTierPriceField(price, tierIndex))
                  : (
                    <Grid size={12}>
                      <Typography variant={'body2'} color={'text.secondary'}>
                        No tiers priced, so nothing in this profession is for sale. That is correct for a craft whose
                        recipes are placed by hand in the world.
                      </Typography>
                    </Grid>
                  )}
              </Grid>
            </BoardSectionCard>
          )
          : (
            <BoardEmptyState
              icon={<Construction sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }}/>}
              message={'Select a profession from the list, or right-click to add one.'}
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
        handleAddProfession(selectedIndex);
        handleContextMenuOnCloseEvent();
      }}>
        <ListItemIcon><Add/></ListItemIcon>
        <Typography>Add new above</Typography>
      </MenuItem>

      <MenuItem onClick={() =>
      {
        handleAddProfession(selectedIndex + 1);
        handleContextMenuOnCloseEvent();
      }}>
        <ListItemIcon><Add/></ListItemIcon>
        <Typography>Add new below</Typography>
      </MenuItem>

      <Divider/>

      <MenuItem onClick={() =>
      {
        handleCloneProfession(selectedIndex);
        handleContextMenuOnCloseEvent();
      }}>
        <ListItemIcon><ContentCopy/></ListItemIcon>
        <Typography>Clone above</Typography>
      </MenuItem>

      <MenuItem onClick={() =>
      {
        handleCloneProfession(selectedIndex + 1);
        handleContextMenuOnCloseEvent();
      }}>
        <ListItemIcon><ContentCopy/></ListItemIcon>
        <Typography>Clone below</Typography>
      </MenuItem>

      <MenuItem dense onClick={() =>
      {
        handleDeleteProfession(selectedIndex);
        handleContextMenuOnCloseEvent();
      }}>
        <ListItemIcon><Remove/></ListItemIcon>
        <Typography>Remove Selected</Typography>
      </MenuItem>
    </Menu>
  </>;
};

export { ProfessionsTab };
