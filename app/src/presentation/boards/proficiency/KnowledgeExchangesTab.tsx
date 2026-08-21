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
import { Add, ContentCopy, Key, Remove, Storefront, SwapHoriz } from '@mui/icons-material';
import { BoardEmptyState } from '@presentation/components/board/BoardEmptyState.tsx';
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';

import KnowledgeExchange = Proficiency.KnowledgeExchange;
import KnowledgeTag = Proficiency.KnowledgeTag;

// matches the monospaced list rows the other boards use, so keys line up while scanning.
const EntryText = styled(ListItemText)`
  font-family: monospace;
`;

// the three datastores an exchange can hand something over from.
const OUTPUT_TYPES = [
  {
    value: 'i',
    label: 'Item',
  },
  {
    value: 'w',
    label: 'Weapon',
  },
  {
    value: 'a',
    label: 'Armor',
  },
];

/**
 * The properties required to author what knowledge can be traded for.
 */
type KnowledgeExchangesTabProps = {
  /** The exchanges as they currently stand. */
  exchanges: KnowledgeExchange[];
  /** Called with the full replacement list whenever anything changes. */
  onChange: (updated: KnowledgeExchange[]) => void;
  /** The kinds of knowledge available to spend, for the picker. */
  tags: KnowledgeTag[];
};

/**
 * Builds a blank exchange, ready to be named.
 * @returns {KnowledgeExchange} An empty exchange row.
 */
const buildEmptyExchange = (): KnowledgeExchange =>
{
  return {
    key: '',
    tagKey: '',
    cost: 100,
    output: {
      id: 0,
      type: 'i',
      count: 1,
    },
  };
};

/**
 * The standing offers to convert knowledge into something real.
 *
 * An exchange is named rather than found by the kind of knowledge it spends, because a kind may be
 * worth spending on more than one thing - and "trade all of it" stops meaning anything the moment a
 * second buyer exists. The event that performs a trade names the offer.
 *
 * Trading converts every whole unit the balance can afford at once. Whatever is left over is smaller
 * than the price of one and stays banked toward the next.
 * @param {KnowledgeExchangesTabProps} props The exchanges, the change handler, and the available kinds.
 */
const KnowledgeExchangesTab = ({ exchanges, onChange, tags }: KnowledgeExchangesTabProps) =>
{
  //region state
  const [ selectedIndex, setSelectedIndex ] = useState<number>(0);
  const [ contextMenu, setContextMenu ] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);
  //endregion state

  // the selection is held as an index so that adding and removing rows keeps the cursor somewhere sensible.
  const selectedExchange = exchanges[ selectedIndex ] ?? null;

  //region actions
  /**
   * Selects an exchange for editing.
   * @param {number} index The index of the exchange that was clicked.
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
   * Inserts a blank exchange at a position and selects it.
   * @param {number} index Where the new exchange should sit.
   */
  const handleAddExchange = (index: number) =>
  {
    const updated = [ ...exchanges ];
    updated.splice(index, 0, buildEmptyExchange());

    onChange(updated);
    setSelectedIndex(index);
  };

  /**
   * Copies the selected exchange to a position and selects the copy.
   * @param {number} index Where the copy should sit.
   */
  const handleCloneExchange = (index: number) =>
  {
    if (selectedExchange === null)
    {
      return;
    }

    const updated = [ ...exchanges ];

    // the output is copied rather than shared, or editing the copy would silently edit the original.
    updated.splice(index, 0, {
      ...selectedExchange,
      output: { ...selectedExchange.output },
    });

    onChange(updated);
    setSelectedIndex(index);
  };

  /**
   * Removes an exchange, leaving the cursor on the row that took its place.
   * @param {number} index The exchange to remove.
   */
  const handleDeleteExchange = (index: number) =>
  {
    if (exchanges.length === 0)
    {
      return;
    }

    const updated = [ ...exchanges ];
    updated.splice(index, 1);

    onChange(updated);
    setSelectedIndex(Math.max(0, Math.min(index, updated.length - 1)));
  };

  /**
   * Applies a partial change to the selected exchange.
   * @param {Partial<KnowledgeExchange>} patch The fields that changed.
   */
  const patchSelectedExchange = (patch: Partial<KnowledgeExchange>) =>
  {
    if (selectedExchange === null)
    {
      return;
    }

    const updated = [ ...exchanges ];
    updated[ selectedIndex ] = {
      ...selectedExchange,
      ...patch,
    };

    onChange(updated);
  };

  /**
   * Applies a partial change to the selected exchange's output.
   * @param {Partial<Proficiency.KnowledgeExchangeOutput>} patch The output fields that changed.
   */
  const patchSelectedOutput = (patch: Partial<Proficiency.KnowledgeExchangeOutput>) =>
  {
    if (selectedExchange === null)
    {
      return;
    }

    patchSelectedExchange({
      output: {
        ...selectedExchange.output,
        ...patch,
      },
    });
  };

  /**
   * Updates the key the event performing this trade names it by.
   * @param {ChangeEvent<HTMLInputElement>} event The field's change event.
   */
  const handleKeyOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    const cleaned = event.target.value
      .replace(/[^\w-]/g, '')
      .toLowerCase();

    patchSelectedExchange({ key: cleaned });
  };

  /**
   * Updates which kind of knowledge this trade spends.
   * @param {ChangeEvent<HTMLInputElement>} event The field's change event.
   */
  const handleTagKeyOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    patchSelectedExchange({ tagKey: event.target.value });
  };

  /**
   * Updates what one of the output costs.
   * @param {ChangeEvent<HTMLInputElement>} event The field's change event.
   */
  const handleCostOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    const parsed = parseInt(event.target.value, 10);

    patchSelectedExchange({ cost: Number.isNaN(parsed)
      ? 0
      : parsed });
  };

  /**
   * Updates which datastore the output comes from.
   * @param {ChangeEvent<HTMLInputElement>} event The field's change event.
   */
  const handleOutputTypeOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    patchSelectedOutput({ type: event.target.value });
  };

  /**
   * Updates which entry of that datastore is handed over.
   * @param {ChangeEvent<HTMLInputElement>} event The field's change event.
   */
  const handleOutputIdOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    const parsed = parseInt(event.target.value, 10);

    patchSelectedOutput({ id: Number.isNaN(parsed)
      ? 0
      : parsed });
  };

  /**
   * Updates how many are handed over per unit traded.
   * @param {ChangeEvent<HTMLInputElement>} event The field's change event.
   */
  const handleOutputCountOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    const parsed = parseInt(event.target.value, 10);

    patchSelectedOutput({ count: Number.isNaN(parsed)
      ? 0
      : parsed });
  };
  //endregion updates

  //region render
  /**
   * Renders one row of the exchange list.
   * @param {KnowledgeExchange} exchange The exchange to render.
   * @param {number} index Its position in the list.
   */
  const renderListItem = (
    exchange: KnowledgeExchange,
    index: number
  ) =>
  {
    const label = exchange.key.length > 0
      ? `${exchange.key}: ${exchange.cost} ${exchange.tagKey}`
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
              ? <Storefront color={'secondary'}/>
              : <SwapHoriz color={'info'}/>}
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
        <BoardSectionCard title={'Exchanges'} density={'compact'}>
          <Box
            onContextMenu={handleListContextMenu}
            sx={{
              cursor: 'context-menu',
              maxHeight: '70vh',
              overflowY: 'auto',
            }}
          >
            <List dense>
              {exchanges.map((exchange, index) => renderListItem(exchange, index))}
            </List>
          </Box>
        </BoardSectionCard>
      </Grid>

      <Grid
        size={8}
        sx={{
          position: 'sticky',
          top: 0,
          alignSelf: 'flex-start',
        }}
      >
        {selectedExchange !== null
          ? (
            <BoardSectionCard title={'Exchange'}>
              <Grid container rowSpacing={2} columnSpacing={2} alignItems={'flex-start'}>
                <Grid size={6}>
                  <TextField
                    required
                    variant={'outlined'}
                    label={'Key'}
                    value={selectedExchange.key}
                    onChange={handleKeyOnChangeEvent}
                    size={'small'}
                    fullWidth
                    helperText={'What an event names to perform this trade.'}
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
                    select
                    required
                    variant={'outlined'}
                    label={'Spends'}
                    value={selectedExchange.tagKey}
                    onChange={handleTagKeyOnChangeEvent}
                    size={'small'}
                    fullWidth
                    helperText={'Which kind of knowledge this trade takes.'}
                  >
                    {tags.map((tag) => (
                      <MenuItem key={tag.key} value={tag.key}>
                        {tag.name.length > 0
                          ? `${tag.name} (${tag.key})`
                          : tag.key}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>

                <Grid size={4}>
                  <TextField
                    type={'number'}
                    variant={'outlined'}
                    label={'Price'}
                    value={selectedExchange.cost}
                    onChange={handleCostOnChangeEvent}
                    size={'small'}
                    fullWidth
                    helperText={'Knowledge per one of the below.'}
                  />
                </Grid>

                <Grid size={4}>
                  <TextField
                    select
                    variant={'outlined'}
                    label={'Hands Over'}
                    value={selectedExchange.output.type}
                    onChange={handleOutputTypeOnChangeEvent}
                    size={'small'}
                    fullWidth
                    helperText={'Where the reward comes from.'}
                  >
                    {OUTPUT_TYPES.map((outputType) => (
                      <MenuItem key={outputType.value} value={outputType.value}>
                        {outputType.label}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>

                <Grid size={4}>
                  <TextField
                    type={'number'}
                    variant={'outlined'}
                    label={'Id'}
                    value={selectedExchange.output.id}
                    onChange={handleOutputIdOnChangeEvent}
                    size={'small'}
                    fullWidth
                    helperText={'Which entry is handed over.'}
                  />
                </Grid>

                <Grid size={4}>
                  <TextField
                    type={'number'}
                    variant={'outlined'}
                    label={'How Many'}
                    value={selectedExchange.output.count}
                    onChange={handleOutputCountOnChangeEvent}
                    size={'small'}
                    fullWidth
                    helperText={'Handed over per price paid.'}
                  />
                </Grid>
              </Grid>
            </BoardSectionCard>
          )
          : (
            <BoardEmptyState
              icon={<SwapHoriz sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }}/>}
              message={'Select an exchange from the list, or right-click to add one.'}
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
        handleAddExchange(selectedIndex);
        handleContextMenuOnCloseEvent();
      }}>
        <ListItemIcon><Add/></ListItemIcon>
        <Typography>Add new above</Typography>
      </MenuItem>

      <MenuItem onClick={() =>
      {
        handleAddExchange(selectedIndex + 1);
        handleContextMenuOnCloseEvent();
      }}>
        <ListItemIcon><Add/></ListItemIcon>
        <Typography>Add new below</Typography>
      </MenuItem>

      <Divider/>

      <MenuItem onClick={() =>
      {
        handleCloneExchange(selectedIndex + 1);
        handleContextMenuOnCloseEvent();
      }}>
        <ListItemIcon><ContentCopy/></ListItemIcon>
        <Typography>Clone below</Typography>
      </MenuItem>

      <MenuItem dense onClick={() =>
      {
        handleDeleteExchange(selectedIndex);
        handleContextMenuOnCloseEvent();
      }}>
        <ListItemIcon><Remove/></ListItemIcon>
        <Typography>Remove Selected</Typography>
      </MenuItem>
    </Menu>
  </>;
};

export { KnowledgeExchangesTab };
