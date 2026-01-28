import {
  Autocomplete,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from "@mui/material";
import React, {
  useEffect,
  useState
} from "react";
import {
  Add,
  AutoAwesome,
  BusinessCenter,
  Clear,
  Close,
  ContentCopy,
  Edit,
  LocalDining,
  QuestionMark,
  Shield,
  Sync
} from "@mui/icons-material";
import {
  loadArmors,
  loadItems,
  loadWeapons
} from "@services/DataService.ts";
import DropItemType from "@core/enums/DropItemType.ts";
import {
  MuiSnackbarSeverity,
  MuiSnackbarVariant
} from "@core/enums/MuiSnackbar.ts";
import { brown } from "@mui/material/colors";
import RPG_DropItem = Rmmz.Data.RPG_DropItem;
import RPG_Armor = Rmmz.Implementations.RPG_Armor;
import RPG_Weapon = Rmmz.Implementations.RPG_Weapon;
import RPG_Item = Rmmz.Implementations.RPG_Item;
import { useProjectPath } from "@presentation/context/project-path.context.tsx";
import { EnemyDomainModel } from "@core/domain/entities/EnemyDomainEntity.ts";

type EnemiesExtraDropProps = {
  selectedEnemy: EnemyDomainModel;
  updateEnemy: (enemy: EnemyDomainModel) => void; // Changed from updateEnemyWithNewDropItems
  handleSnack: (message: string, severity?: MuiSnackbarSeverity, variant?: MuiSnackbarVariant) => void;
};

const EnemiesExtraDrops = ({
  selectedEnemy,
  updateEnemy,
  handleSnack,
}: EnemiesExtraDropProps) =>
{
  const { projectPath } = useProjectPath();
  //region state
  const [ items, setItems ] = useState<RPG_Item[]>([]);
  const [ weapons, setWeapons ] = useState<RPG_Weapon[]>([]);
  const [ armors, setArmors ] = useState<RPG_Armor[]>([]);

  const [ selectedDropItem, setSelectedDropItem ] = useState<RPG_DropItem | null>(null);
  const [ selectedDropItemIndex, setSelectedDropItemIndex ] = useState<number>(0);
  const [ selectedDropItemType, setSelectedDropItemType ] = useState<DropItemType | null>(null);
  const [ pendingDropItem, setPendingDropItem ] = useState<RPG_DropItem | null>(null);

  const [ dropItemContextMenu, setDropItemContextMenu ] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);
  const [ dropItemModifier, setDropItemModifier ] = useState(false);

  //endregion state

  //region setup
  useEffect(() =>
  {
    let ignore = false;
    if (projectPath === null || projectPath === '' || !projectPath.endsWith("/data"))
    {
      console.error(`invalid path provided: ${projectPath}`);
      return;
    }

    // a helper function for initializing the state of this component based on the configuration file.
    const initializeState = async (projectPath: string) =>
    {
      // TODO: add popup warning in this method and add a reset button?

      setSelectedDropItemType(null);

      const itemData = await loadItems(projectPath);
      if (!ignore && itemData)
      {
        setItems(itemData);
      }

      const weaponData = await loadWeapons(projectPath);
      if (!ignore && weaponData)
      {
        setWeapons(weaponData);
      }

      const armorData = await loadArmors(projectPath);
      if (!ignore && armorData)
      {
        setArmors(armorData);
      }
    };

    initializeState(projectPath)
      .catch(console.error);
    return () =>
    {
      ignore = true;
    }
  }, [ projectPath ]);
  //endregion setup

  //region actions
  const handleEnemyDropItemListItemOnClickEvent = (index: number) =>
  {
    if (!selectedEnemy.extraDrops.length) return;

    setSelectedDropItemIndex(index);

    const thisDropItem = selectedEnemy.extraDrops.at(index)!;
    setSelectedDropItem(thisDropItem);
    setSelectedDropItemType(thisDropItem.kind);
    setPendingDropItem(thisDropItem);
  };

  const handleDropItemContextMenu = (event: any) =>
  {
    event.preventDefault();

    const newContextMenuState = dropItemContextMenu === null
      ? {
        mouseX: event.clientX + 2,
        mouseY: event.clientY - 6,
      }
      : null;

    setDropItemContextMenu(newContextMenuState);
  };

  const handleOpenDropItemModifierDialogOnClick = () =>
  {
    setDropItemModifier(true);
  };

  const handleCloseDropItemModifierDialogOnClick = () =>
  {
    setDropItemModifier(false);
  };

  const handleRelevantDropItemDropdownOnClickEvent = (clickedDropItem: RPG_Item | RPG_Weapon | RPG_Armor) =>
  {
    let dropItemType = DropItemType.Item;
    switch (true)
    {
      case Object.hasOwn(clickedDropItem, "itypeId"):
        dropItemType = DropItemType.Item;
        break;
      case Object.hasOwn(clickedDropItem, "wtypeId"):
        dropItemType = DropItemType.Weapon;
        break;
      case Object.hasOwn(clickedDropItem, "atypeId"):
        dropItemType = DropItemType.Armor;
        break;
    }
    const updatedPendingDropItem = {
      ...pendingDropItem,
      dataId: clickedDropItem.id,
      kind: dropItemType
    } as RPG_DropItem;

    setPendingDropItem(updatedPendingDropItem);
  };

  const handleDropItemContextMenuClose = () =>
  {
    setDropItemContextMenu(null);
  };
  //endregion actions

  //region update
  const handleAddNewDropItemOnClick = (index: number | null) =>
  {
    const newDropItem = {
      kind: DropItemType.Item,
      dataId: 1,
      denominator: 100
    } as RPG_DropItem;

    // Update the array on the model
    selectedEnemy.extraDrops = (index === null)
      ? [newDropItem]
      : selectedEnemy.extraDrops.toSpliced(index, 0, newDropItem);

    updateEnemy(selectedEnemy);
  };

  const handleCloneDropItemOnClick = (index: number) =>
  {
    if (selectedDropItem === null)
    {
      handleSnack("Must select a drop to clone.", MuiSnackbarSeverity.Error);
      return;
    }

    const clonedDropItem = {
      kind: selectedDropItem.kind,
      dataId: selectedDropItem.dataId,
      denominator: selectedDropItem.denominator,
    } as RPG_DropItem;

    selectedEnemy.extraDrops = selectedEnemy.extraDrops.toSpliced(index, 0, clonedDropItem);
    updateEnemy(selectedEnemy);
  };

  const handleDeleteDropItemOnClick = (index: number) =>
  {
    selectedEnemy.extraDrops = selectedEnemy.extraDrops.toSpliced(index, 1);
    updateEnemy(selectedEnemy);
  };

  const handleDropItemTypeOnChangeEvent = (_: any, newValue: DropItemType) =>
  {
    setSelectedDropItemType(newValue);
  };

  const handlePendingDropItemChanceOnChangeEvent = (value: number) =>
  {
    // if there is no entry, stop processing.
    if (!pendingDropItem) return;

    const updatedValue = value < 1
      ? 1
      : value;

    const updatedPendingDropItem = {
      ...pendingDropItem,
      denominator: updatedValue
    } as RPG_DropItem;
    setPendingDropItem(updatedPendingDropItem);
  };

  const handleOverrideSelectedWithPendingDropItemOnClickEvent = () =>
  {
    if (!pendingDropItem || !selectedDropItem) return;

    const updatedSelectedDropItem = {
      kind: pendingDropItem.kind,
      dataId: pendingDropItem.dataId,
      denominator: pendingDropItem.denominator
    } as RPG_DropItem;

    setSelectedDropItem(updatedSelectedDropItem);

    selectedEnemy.extraDrops = selectedEnemy.extraDrops.with(selectedDropItemIndex, updatedSelectedDropItem);
    updateEnemy(selectedEnemy);
  };
  //endregion update

  //region render
  const renderExtraDropItems = () =>
  {
    if (selectedEnemy.extraDrops.length === 0) return <></>;

    return selectedEnemy.extraDrops.map(renderExtraDropItem);
  };

  const renderExtraDropItem = (dropItem: RPG_DropItem, index: number) =>
  {
    let icon = <></>;
    let drop: RPG_Item | RPG_Weapon | RPG_Armor | null = null;
    switch (dropItem.kind)
    {
      case 1:
        icon = <BusinessCenter color={"success"}/>;
        drop = items.at(dropItem.dataId)!;
        break;
      case 2:
        icon = <LocalDining color={"error"}/>;
        drop = weapons.at(dropItem.dataId)!;
        break;
      case 3:
        // arbitrary use case for CA since all armors beyond 300 are monster drops.
        if (dropItem.dataId > 300)
        {
          icon = <AutoAwesome color={"info"}/>
        }
        else
        {
          icon = <Shield color={"info"}/>;
        }

        drop = armors.at(dropItem.dataId)!;
        break;
      default:
        throw new Error(`Unknown item kind: ${dropItem.kind}`);
    }

    return (
      <ListItem
        key={index}
        secondaryAction={<>
          <IconButton
            edge="start"
            onClick={() =>
            {
              handleEnemyDropItemListItemOnClickEvent(index);
              handleOpenDropItemModifierDialogOnClick();
            }}>
            <Edit/>
          </IconButton>
          <IconButton
            edge="end"
            onClick={() => handleDeleteDropItemOnClick(index)}>
            <Clear/>
          </IconButton>
        </>}
      >
        <ListItemButton
          selected={selectedDropItemIndex === index}
          sx={{ maxHeight: '30px' }}
          onClick={() => handleEnemyDropItemListItemOnClickEvent(index)}
        >
          <ListItemIcon>
            <div style={{
              position: 'relative',
              display: 'inline-block'
            }}>
              {icon}
              <div style={{
                position: 'absolute',
                bottom: '-5px',
                right: '-5px',
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                color: 'white',
                borderRadius: '10px',
                padding: '1px 4px',
                fontSize: '14px',
                fontWeight: 'bold',
                lineHeight: 1,
                minWidth: '16px',
                textAlign: 'center'
              }}>
                {dropItem.denominator}%
              </div>
            </div>
          </ListItemIcon>
          <ListItemText>
            {drop.id}: {drop.name}
          </ListItemText>
        </ListItemButton>
      </ListItem>
    )
  };

  const renderRelevantDropItemDropdown = () =>
  {
    const renderOption = (props: any, option: any) =>
    {
      if (!option || option.name === "" || option.name?.startsWith("=="))
      {
        return <li {...props} style={{ display: 'none' }}/>;
      }

      return (
        <li key={props.key} {...props} style={{ height: 32 }}>
          <ListItem disableGutters disablePadding sx={{ height: 32 }}>
            <ListItemButton
              sx={{ height: 32 }}
              onClick={() =>
              {
                handleRelevantDropItemDropdownOnClickEvent(option)
              }}
            >
              <ListItemText
                primary={`${option.id}: ${option.name}`}
                disableTypography={true}
              />
            </ListItemButton>
          </ListItem>
        </li>
      );
    };

    switch (selectedDropItemType)
    {
      case DropItemType.Item:
        return <>
          <Autocomplete
            size={"small"}
            options={[ ...items ].sort((a, b) =>
            {
              if (a === null || b === null)
              {
                return (
                  a as any
                ) - (
                  b as any
                );
              }
              return a.id - b.id;
            })}
            slotProps={{
              listbox: {
                sx: { maxHeight: '170px' }
              }
            }}
            getOptionKey={(option) => option?.id ?? "no-key"}
            getOptionLabel={(option) => option?.name ?? ""}
            isOptionEqualToValue={(option, value) =>
            {
              if (value === null)
              {
                return false;
              }

              return option.id === value.id;
            }}
            renderOption={renderOption}
            renderInput={(params) =>
            {
              return <TextField
                {...params}
                size={"small"}
                label={"Items"}
                placeholder="Item name..."
              />
            }}
          />
        </>;
      case DropItemType.Weapon:
        return <>
          <Autocomplete
            size={"small"}
            options={[ ...weapons ].sort((a, b) =>
            {
              if (a === null || b === null)
              {
                return (
                  a as any
                ) - (
                  b as any
                );
              }
              return a.id - b.id;
            })}
            slotProps={{
              listbox: {
                sx: { maxHeight: '170px' }
              }
            }}
            getOptionKey={(option) => option?.id ?? "no-key"}
            getOptionLabel={(option) => option?.name ?? ""}
            isOptionEqualToValue={(option, value) =>
            {
              if (value === null)
              {
                return false;
              }

              return option.id === value.id;
            }}
            renderOption={renderOption}
            renderInput={(params) =>
            {
              return (
                <TextField
                  {...params}
                  size={"small"}
                  label={"Weapons"}
                  placeholder="Weapon name..."/>
              )
            }}
          />
        </>;
      case DropItemType.Armor:
        return <>
          <Autocomplete
            size={"small"}
            options={[ ...armors ].sort((a, b) =>
            {
              if (a === null || b === null)
              {
                return (
                  a as any
                ) - (
                  b as any
                );
              }
              return a.id - b.id;
            })}
            slotProps={{
              listbox: {
                sx: { maxHeight: '170px' }
              }
            }}
            getOptionKey={(option) => option?.id ?? "no-key"}
            getOptionLabel={(option) => option?.name ?? ""}
            isOptionEqualToValue={(option, value) =>
            {
              if (value === null)
              {
                return false;
              }

              return option.id === value.id;
            }}
            renderOption={renderOption}
            renderInput={(params) =>
            {
              return (
                <TextField
                  {...params}
                  size={"small"}
                  label={"Armors"}
                  placeholder="Armor name..."/>
              )
            }}
          />
        </>;
    }
  };

  const renderSelectedDropItemChip = () =>
  {
    if (!selectedDropItem) return <></>;
    if (selectedDropItemIndex < 0) return <></>;

    return <Stack spacing={4}>
      {"Current Drop Item:"}
      {buildDropItemChip(selectedDropItem, "outlined")}
    </Stack>
  };

  const renderPendingDropItemChip = () =>
  {
    if (!pendingDropItem) return <></>;

    return <>
      <Stack
        spacing={4}
        sx={{
          border: '1px solid',
          borderRadius: '10px',
          padding: '10px',
          borderColor: 'grey'
        }}
      >

        {"Pending Drop Item Update:"}
        {buildDropItemChip(pendingDropItem)}

        <TextField
          type={"number"}
          label={"Drop Chance %"}
          value={pendingDropItem.denominator}
          fullWidth
          onChange={(event) => handlePendingDropItemChanceOnChangeEvent(parseInt(event.target.value) ?? 1)}
        />
      </Stack>
    </>;
  };

  const buildDropItemChip = (dropItem: RPG_DropItem, variant: "filled" | "outlined" = "filled") =>
  {
    let dropItemData: RPG_Item | RPG_Weapon | RPG_Armor = null!;
    let color: ("primary" | "success" | "error" | "info") = "primary";
    let icon = <QuestionMark/>;
    switch (dropItem.kind)
    {
      case DropItemType.Item:
        dropItemData = items[dropItem.dataId];
        color = "success";
        icon = <BusinessCenter color={"success"}/>;
        break;
      case DropItemType.Weapon:
        dropItemData = weapons[dropItem.dataId];
        color = "error";
        icon = <LocalDining color={"error"}/>;
        break;
      case DropItemType.Armor:
        dropItemData = armors[dropItem.dataId];
        color = "info";
        icon = <Shield color={"info"}/>;
        break;
      default:
        throw new Error(`unknown ingredient type detected: ${dropItem.kind}`)
    }

    return <>
      <Chip
        icon={icon}
        label={`${dropItemData.name} (${dropItem.denominator}%)`}
        variant={variant}
        color={color}
      />
    </>
  };
  //endregion render

  if (items.length === 0 || weapons.length === 0 || armors.length === 0)
  {
    return <Typography>Loading drop data...</Typography>;
  }

  return <>
    <Stack spacing={2}>
      <Typography
        variant={"h4"}
        align={"center"}
        color={"primary"}
        sx={{ paddingTop: 2 }}
      >
        Extra Drops
      </Typography>

      <div onContextMenu={handleDropItemContextMenu} style={{ cursor: 'context-menu' }}>
        <List dense>
          {selectedEnemy.extraDrops.length > 0
            ? renderExtraDropItems()
            : <>
              <Button
                fullWidth
                startIcon={<Add/>}
                onClick={() => handleAddNewDropItemOnClick(null)}
                variant={"contained"}
              />
            </>}
        </List>
      </div>
    </Stack>

    {/*region not-grid-related elements */}
    <Dialog
      open={dropItemModifier}
      onClose={() => handleCloseDropItemModifierDialogOnClick()}
      fullWidth
      maxWidth={"md"}
      sx={{
        '& .MuiDialog-paper': {
          maxHeight: 450,
          minHeight: 400
        }
      }}
    >
      <DialogTitle>
        <Typography>
          Modify Drop
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Grid container spacing={4}>
          <Grid size={7}>
            <Stack>
              <ToggleButtonGroup
                exclusive
                color={"primary"}
                value={selectedDropItemType}
                defaultValue={DropItemType.Item}
                onChange={handleDropItemTypeOnChangeEvent}
                fullWidth
              >
                <ToggleButton
                  selected={selectedDropItemType === DropItemType.Item}
                  value={DropItemType.Item}>
                  <BusinessCenter sx={{ color: brown[500] }}/>
                </ToggleButton>
                <ToggleButton
                  selected={selectedDropItemType === DropItemType.Weapon}
                  value={DropItemType.Weapon}>
                  <LocalDining color={"error"}/>
                </ToggleButton>
                <ToggleButton
                  selected={selectedDropItemType === DropItemType.Armor}
                  value={DropItemType.Armor}>
                  <Shield color={"info"}/>
                </ToggleButton>
              </ToggleButtonGroup>

              {renderRelevantDropItemDropdown()}
            </Stack>
          </Grid>
          <Grid size={5}>
            <Stack spacing={2}>
              {renderSelectedDropItemChip()}

              {renderPendingDropItemChip()}
            </Stack>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button
          variant={"contained"}
          color={"warning"}
          startIcon={<Close/>}
          onClick={() => handleCloseDropItemModifierDialogOnClick()}
        >
          Nevermind
        </Button>
        <Button
          color={"primary"}
          variant={"contained"}
          startIcon={<Sync/>}
          onClick={() =>
          {
            handleOverrideSelectedWithPendingDropItemOnClickEvent();
            handleCloseDropItemModifierDialogOnClick();
          }}
        >
          Update Component
        </Button>
      </DialogActions>
    </Dialog>

    <Menu
      open={dropItemContextMenu !== null}
      onClose={() => handleDropItemContextMenuClose()}
      anchorReference="anchorPosition"
      anchorPosition={dropItemContextMenu !== null
        ? {
          top: dropItemContextMenu.mouseY,
          left: dropItemContextMenu.mouseX
        }
        : undefined}
    >
      <MenuItem onClick={() =>
      {
        handleAddNewDropItemOnClick(selectedDropItemIndex);
        handleDropItemContextMenuClose();
      }}>
        <ListItemIcon><Add/></ListItemIcon>
        <Typography>Add new above</Typography>
      </MenuItem>
      <MenuItem onClick={() =>
      {
        handleAddNewDropItemOnClick(selectedDropItemIndex + 1);
        handleDropItemContextMenuClose();
      }}>
        <ListItemIcon><Add/></ListItemIcon>
        <Typography>Add new below</Typography>
      </MenuItem>
      <Divider/>
      <MenuItem onClick={() =>
      {
        handleCloneDropItemOnClick(selectedDropItemIndex);
        handleDropItemContextMenuClose();
      }}>
        <ListItemIcon><ContentCopy/></ListItemIcon>
        <Typography>Clone above</Typography>
      </MenuItem>
      <MenuItem onClick={() =>
      {
        handleCloneDropItemOnClick(selectedDropItemIndex + 1);
        handleDropItemContextMenuClose();
      }}>
        <ListItemIcon><ContentCopy/></ListItemIcon>
        <Typography>Clone below</Typography>
      </MenuItem>
    </Menu>
    {/*endregion not-grid-related elements */}
  </>
}

export default EnemiesExtraDrops;
