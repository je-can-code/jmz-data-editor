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
import CraftingComponentType from "../../core/enums/CraftingComponentType.ts";
import {
  Add,
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
import { brown } from "@mui/material/colors";
import React, {
  MouseEvent,
  useEffect,
  useState
} from "react";
import Crafting from "../../types/custom/Crafting";
import {
  MuiSnackbarSeverity,
  MuiSnackbarVariant
} from "../../core/enums/MuiSnackbar.ts";
import CraftingListType from "../../core/enums/CraftingListType.ts";
import {
  loadArmors,
  loadItems,
  loadWeapons
} from "../../services/DataService.ts";
import CraftingComponent = Crafting.CraftingComponent;
import RPG_Item = Rmmz.Implementations.RPG_Item;
import RPG_Weapon = Rmmz.Implementations.RPG_Weapon;
import RPG_Armor = Rmmz.Implementations.RPG_Armor;

type CraftingListProps = {
  projectPath: string;
  type: CraftingListType;
  updateRecipeFunc: (craftingComponents: CraftingComponent[], craftingListType: CraftingListType) => void;
  components: CraftingComponent[];
  handleSnack: (message: string, severity?: MuiSnackbarSeverity, variant?: MuiSnackbarVariant) => void;
};

export default function CraftingComponentList(props: CraftingListProps)
{
  //region state
  const [ currentComponents, setCurrentComponents ] = useState<CraftingComponent[]>([]);
  const [ selectedComponent, setSelectedComponent ] = useState<CraftingComponent | null>(null);
  const [ selectedComponentType, setSelectedComponentType ] = useState<CraftingComponentType | null>(null);
  const [ selectedComponentIndex, setSelectedComponentIndex ] = useState<number>(0);
  const [ pendingComponent, setPendingComponent ] = useState<CraftingComponent | null>(null);

  const [ items, setItems ] = useState<RPG_Item[]>([]);
  const [ weapons, setWeapons ] = useState<RPG_Weapon[]>([]);
  const [ armors, setArmors ] = useState<RPG_Armor[]>([]);

  const [ componentListContextMenu, setComponentListContextMenu ] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);
  const [ componentModifierOpen, setComponentModifierOpen ] = useState(false);
  //endregion state

  /**
   * Initializes the board with the data from the configuration.
   */
  useEffect(() =>
  {
    let ignore = false;
    const { projectPath } = props;
    if (projectPath === null || projectPath === '' || !projectPath.endsWith("/data"))
    {
      console.error(`invalid path provided: ${projectPath}`);
      return;
    }

    // a helper function for initializing the state of this component based on the configuration file.
    const initializeState = async (projectPath: string) =>
    {
      setCurrentComponents(props.components);
      setSelectedComponent(null);
      setSelectedComponentType(null);
      setSelectedComponentIndex(0);
      setPendingComponent(null);

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
  }, [ props.projectPath, props.components ]);

  //region actions
  const handleRecipeComponentListItemOnClickEvent = (index: number) =>
  {
    setSelectedComponentIndex(index);
    setSelectedComponent(null);
    setPendingComponent(null);

    if (currentComponents?.length > 0)
    {
      const thisIngredient = currentComponents[index];
      setSelectedComponent(thisIngredient);
      setSelectedComponentType(thisIngredient.type);
      setPendingComponent(thisIngredient);
    }
  };

  const handleComponentListContextMenu = (event: MouseEvent) =>
  {
    event.preventDefault();

    const newContextMenuState = componentListContextMenu === null
      ? {
        mouseX: event.clientX + 2,
        mouseY: event.clientY - 6,
      }
      : null;

    setComponentListContextMenu(newContextMenuState);
  };

  const handleComponentListContextMenuOnCloseEvent = () =>
  {
    setComponentListContextMenu(null);
  };

  const handleOpenComponentModifierDialogOnClick = () =>
  {
    setComponentModifierOpen(true);
  };

  const handleCloseComponentModifierDialogOnClick = () =>
  {
    setComponentModifierOpen(false);
  };
  //endregion actions

  //region component updates
  const handlePendingComponentCountOnChangeEvent = (value: number) =>
  {
    // if there is no entry, stop processing.
    if (!pendingComponent) return;

    const updatedValue = value < 1
      ? 1
      : value;

    const updatedPendingIngredient = {
      ...pendingComponent,
      count: updatedValue
    } as CraftingComponent;
    setPendingComponent(updatedPendingIngredient);
  };

  const handleRelevantComponentDropdownOnClickEvent = (newComponent: RPG_Item | RPG_Weapon | RPG_Armor) =>
  {
    let ingredientType = CraftingComponentType.Item;
    switch (true)
    {
      case Object.hasOwn(newComponent, "itypeId"):
        ingredientType = CraftingComponentType.Item;
        break;
      case Object.hasOwn(newComponent, "wtypeId"):
        ingredientType = CraftingComponentType.Weapon;
        break;
      case Object.hasOwn(newComponent, "atypeId"):
        ingredientType = CraftingComponentType.Armor;
        break;
    }
    const updatedSelectedIngredient = {
      ...pendingComponent,
      id: newComponent.id,
      type: ingredientType
    } as CraftingComponent;

    setPendingComponent(updatedSelectedIngredient);
  };

  const handleRecipeComponentTypeOnChangeEvent = (_: any, newValue: CraftingComponentType) =>
  {
    setSelectedComponentType(newValue);
  };
  //endregion component updates

  //region list updates
  const handleAddNewComponent = (index: number | null) =>
  {
    const newComponent = {
      id: 1,
      type: CraftingComponentType.Item,
      count: 1,
    } as CraftingComponent;

    const updatedComponents = (index === null)
      ? [ newComponent ]
      : currentComponents.toSpliced(index, 0, newComponent);

    setCurrentComponents(updatedComponents);
    props.updateRecipeFunc(updatedComponents, props.type);
  };

  const handleCloneComponent = (index: number) =>
  {
    if (selectedComponent === null)
    {
      props.handleSnack("Must select a component to clone.", MuiSnackbarSeverity.Error);
      return;
    }

    const clonedComponent = {
      id: selectedComponent.id,
      type: selectedComponent.type,
      count: selectedComponent.count
    } as CraftingComponent;

    const updatedComponents = currentComponents.toSpliced(index, 0, clonedComponent);

    setCurrentComponents(updatedComponents);
    props.updateRecipeFunc(updatedComponents, props.type);
  };

  const handleOverrideSelectedWithPendingComponentOnClickEvent = () =>
  {
    if (!pendingComponent || !selectedComponent) return;

    const updatedSelectedIngredient = {
      type: pendingComponent.type,
      id: pendingComponent.id,
      count: pendingComponent.count
    } as CraftingComponent;

    setSelectedComponent(updatedSelectedIngredient);

    const updatedCurrentIngredients = currentComponents.with(selectedComponentIndex, updatedSelectedIngredient);
    setCurrentComponents(updatedCurrentIngredients);

    props.updateRecipeFunc(updatedCurrentIngredients, props.type);

    setPendingComponent(null);
  };

  const handleDeleteTargetComponent = (targetIndex: number) =>
  {
    const updatedCurrentIngredients = currentComponents.toSpliced(targetIndex, 1);
    setCurrentComponents(updatedCurrentIngredients);

    props.updateRecipeFunc(updatedCurrentIngredients, props.type);

    setPendingComponent(null);
  };
  //endregion list updates

  //region render
  const renderRecipeComponent = (craftingComponent: CraftingComponent, index: number) =>
  {
    if (!craftingComponent) return <></>;

    const ingredient = currentComponents.at(index);
    if (!ingredient) return <></>;

    let ingredientData = null;
    let icon = <QuestionMark/>;
    switch (ingredient.type)
    {
      case CraftingComponentType.Item:
        ingredientData = items.at(ingredient.id);
        icon = <BusinessCenter color={"success"}/>
        break;
      case CraftingComponentType.Weapon:
        ingredientData = weapons.at(ingredient.id);
        icon = <LocalDining color={"error"}/>
        break;
      case CraftingComponentType.Armor:
        ingredientData = armors.at(ingredient.id);
        icon = <Shield color={"info"}/>
        break;
      // TODO: implement gold cost as ingredient.
      default:
        throw new Error(`unknown ingredient type detected: ${ingredient.type}`)
    }

    return (
      <ListItem
        key={`${index}-${ingredient.type}-${ingredient.id}`}
        disableGutters
        secondaryAction={<>
          <IconButton
            edge="start"
            onClick={() =>
            {
              handleRecipeComponentListItemOnClickEvent(index);
              handleOpenComponentModifierDialogOnClick();
            }}>
            <Edit/>
          </IconButton>
          <IconButton
            edge="end"
            onClick={() => handleDeleteTargetComponent(index)}>
            <Clear/>
          </IconButton>
        </>}
      >
        <ListItemButton
          selected={selectedComponentIndex === index}
          onClick={() => handleRecipeComponentListItemOnClickEvent(index)}
        >
          <ListItemIcon sx={{ minWidth: '30px' }}>
            {icon}
          </ListItemIcon>
          <ListItemText
            primary={`${ingredient.id}: ${ingredientData?.name} (${ingredient.count})`}
            disableTypography
            sx={{ width: '100%' }}
          />
        </ListItemButton>
      </ListItem>
    )
  };

  const renderRelevantRecipeComponentDropdown = () =>
  {
    const renderOption = (props: any, option: any) =>
    {
      if (option === null || option.name === "" || option.name.startsWith("=="))
      {
        return <li {...props} style={{ display: 'none' }}/>;
      }

      return (
        <li {...props} key={props.key} style={{ height: 32 }}>
          <ListItem disableGutters disablePadding sx={{ height: 32 }}>
            <ListItemButton
              sx={{ height: 32 }}
              onClick={() =>
              {
                handleRelevantComponentDropdownOnClickEvent(option)
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

    switch (selectedComponentType)
    {
      case CraftingComponentType.Item:
        return (
          <Autocomplete
            size={"small"}
            options={[ ...items ].sort((a, b) =>
            {
              if (a === null || b === null) return (a as any) - (b as any);
              return a.id - b.id;
            })}
            slotProps={{
              listbox: {
                sx: { maxHeight: '170px' }
              }
            }}
            getOptionKey={(option) => option?.id ?? "no-key"}
            getOptionLabel={(option) => option?.name ?? ""}
            isOptionEqualToValue={(option, otherOption) => option.id === otherOption.id}
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
          />);
      case CraftingComponentType.Weapon:
        return (
          <Autocomplete
            size={"small"}
            options={[ ...weapons ].sort((a, b) =>
            {
              if (a === null || b === null) return (a as any) - (b as any);
              return a.id - b.id;
            })}
            slotProps={{
              listbox: {
                sx: { maxHeight: '170px' }
              }
            }}
            getOptionKey={(option) => option?.id ?? "no-key"}
            getOptionLabel={(option) => option?.name ?? ""}
            renderOption={renderOption}
            renderInput={(params) =>
            {
              return (<TextField
                {...params}
                size={"small"}
                label={"Weapons"}
                placeholder="Weapon name..."/>)
            }}
          />);
      case CraftingComponentType.Armor:
        return (
          <Autocomplete
            size={"small"}
            options={[ ...armors ].sort((a, b) =>
            {
              if (a === null || b === null) return (a as any) - (b as any);
              return a.id - b.id;
            })}
            slotProps={{
              listbox: {
                sx: { maxHeight: '170px' }
              }
            }}
            getOptionKey={(option) => option?.id ?? "no-key"}
            getOptionLabel={(option) => option?.name ?? ""}
            renderOption={renderOption}
            renderInput={(params) =>
            {
              return (<TextField
                {...params}
                size={"small"}
                label={"Armors"}
                placeholder="Armor name..."/>)
            }}
          />);
    }
  };

  const renderSelectedComponentChip = () =>
  {
    if (!selectedComponent) return <></>;
    if (selectedComponentIndex < 0) return <></>;

    return <Stack spacing={4}>
      {"Current Component:"}
      {buildComponentChip(selectedComponent, "outlined")}
    </Stack>
  };

  const renderPendingComponentChip = () =>
  {
    if (!pendingComponent) return <></>;

    return (
      <Stack
        spacing={4}
        sx={{
          border: '1px solid',
          borderRadius: '10px',
          padding: '10px',
          borderColor: 'grey'
        }}
      >
        {"Pending Component Update:"}
        {buildComponentChip(pendingComponent)}
        <TextField
          type={"number"}
          label={"Count"}
          value={pendingComponent.count}
          fullWidth
          onChange={(event) => handlePendingComponentCountOnChangeEvent(parseInt(event.target.value) ?? 1)}
        />
      </Stack>
    );
  };

  const buildComponentChip = (craftingComponent: CraftingComponent, variant: "filled" | "outlined" = "filled") =>
  {
    let componentData = null;
    let color: ("primary" | "success" | "error" | "info") = "primary";
    let icon = <QuestionMark/>;
    switch (craftingComponent.type)
    {
      case CraftingComponentType.Item:
        componentData = items[craftingComponent.id];
        color = "success";
        icon = <BusinessCenter color={"success"}/>;
        break;
      case CraftingComponentType.Weapon:
        componentData = weapons[craftingComponent.id];
        color = "error";
        icon = <LocalDining color={"error"}/>;
        break;
      case CraftingComponentType.Armor:
        componentData = armors[craftingComponent.id];
        color = "info";
        icon = <Shield color={"info"}/>;
        break;
      // TODO: implement gold cost as ingredient.
      default:
        throw new Error(`unknown ingredient type detected: ${craftingComponent.type}`)
    }

    return (
      <Chip
        icon={icon}
        label={`${componentData.name} (${craftingComponent.count})`}
        variant={variant}
        color={color}
      />
    )
  };
  //endregion render

  return <>
    <Stack spacing={1}>
      <Typography variant={"h5"} align={"center"}>
        {props.type}
      </Typography>
      {currentComponents.length > 0 && selectedComponentType !== null
        ? <></>
        : <></>}
      <div onContextMenu={handleComponentListContextMenu} style={{ cursor: 'context-menu' }}>
        <List dense>
          {currentComponents.length > 0
            ? currentComponents.map((ingredient, index) => renderRecipeComponent(ingredient, index))
            : (
              <Button
                fullWidth
                startIcon={<Add/>}
                onClick={() => handleAddNewComponent(null)}
                variant={"contained"}/>
            )}
        </List>
      </div>
    </Stack>
    <Menu
      open={componentListContextMenu !== null}
      onClose={handleComponentListContextMenuOnCloseEvent}
      anchorReference="anchorPosition"
      anchorPosition={componentListContextMenu !== null
        ? {
          top: componentListContextMenu.mouseY,
          left: componentListContextMenu.mouseX
        }
        : undefined}
    >
      <MenuItem onClick={() =>
      {
        handleAddNewComponent(selectedComponentIndex);
        handleComponentListContextMenuOnCloseEvent();
      }}>
        <ListItemIcon><Add/></ListItemIcon>
        <Typography>Add new above</Typography>
      </MenuItem>
      <MenuItem onClick={() =>
      {
        handleAddNewComponent(selectedComponentIndex + 1);
        handleComponentListContextMenuOnCloseEvent();
      }}>
        <ListItemIcon><Add/></ListItemIcon>
        <Typography>Add new below</Typography>
      </MenuItem>
      <Divider/>
      <MenuItem onClick={() =>
      {
        handleCloneComponent(selectedComponentIndex);
        handleComponentListContextMenuOnCloseEvent();
      }}>
        <ListItemIcon><ContentCopy/></ListItemIcon>
        <Typography>Clone above</Typography>
      </MenuItem>
      <MenuItem onClick={() =>
      {
        handleCloneComponent(selectedComponentIndex + 1);
        handleComponentListContextMenuOnCloseEvent();
      }}>
        <ListItemIcon><ContentCopy/></ListItemIcon>
        <Typography>Clone below</Typography>
      </MenuItem>
    </Menu>
    <Dialog
      open={componentModifierOpen}
      onClose={() => handleCloseComponentModifierDialogOnClick()}
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
          Modify Component
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Grid container spacing={4}>
          <Grid size={7}>
            <Stack>
              <ToggleButtonGroup
                exclusive
                color={"primary"}
                value={selectedComponentType}
                defaultValue={CraftingComponentType.Item}
                onChange={handleRecipeComponentTypeOnChangeEvent}
                fullWidth
              >
                <ToggleButton
                  selected={selectedComponentType === CraftingComponentType.Item}
                  value={CraftingComponentType.Item}>
                  <BusinessCenter sx={{ color: brown[500] }}/>
                </ToggleButton>
                <ToggleButton
                  selected={selectedComponentType === CraftingComponentType.Weapon}
                  value={CraftingComponentType.Weapon}>
                  <LocalDining color={"error"}/>
                </ToggleButton>
                <ToggleButton
                  selected={selectedComponentType === CraftingComponentType.Armor}
                  value={CraftingComponentType.Armor}>
                  <Shield color={"info"}/>
                </ToggleButton>
              </ToggleButtonGroup>

              {renderRelevantRecipeComponentDropdown()}
            </Stack>
          </Grid>
          <Grid size={5}>
            <Stack spacing={2}>
              {renderSelectedComponentChip()}

              {renderPendingComponentChip()}
            </Stack>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button
          variant={"contained"}
          color={"warning"}
          startIcon={<Close/>}
          onClick={() => handleCloseComponentModifierDialogOnClick()}
        >
          Nevermind
        </Button>
        <Button
          color={"primary"}
          variant={"contained"}
          startIcon={<Sync/>}
          onClick={() =>
          {
            handleOverrideSelectedWithPendingComponentOnClickEvent();
            handleCloseComponentModifierDialogOnClick();
          }}
        >
          Update Component
        </Button>
      </DialogActions>
    </Dialog>
  </>
}