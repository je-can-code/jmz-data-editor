import {
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
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
  Tooltip,
  Typography
} from '@mui/material';
import CraftingComponentType from '@core/enums/CraftingComponentType.ts';
import {
  Add,
  AttachMoney,
  AutoAwesome,
  BusinessCenter,
  Category,
  Clear,
  Close,
  ContentCopy,
  Edit,
  KeyboardArrowDown,
  KeyboardArrowUp,
  LocalDining,
  Shield,
  Sync
} from '@mui/icons-material';
import { brown } from '@mui/material/colors';
import React, { MouseEvent, useEffect, useMemo, useState } from 'react';
import { MuiSnackbarSeverity, MuiSnackbarVariant } from '@core/enums/MuiSnackbar.ts';
import CraftingListType from '@core/enums/CraftingListType.ts';
import { IngredientTypeChips } from '@presentation/components/crafting/IngredientTypeChips.tsx';
import { useCrafting } from '@presentation/context/resources/crafting.context.tsx';
import { useItems } from '@presentation/context/resources/items.context.tsx';
import { useWeapons } from '@presentation/context/resources/weapons.context.tsx';
import { useArmors } from '@presentation/context/resources/armors.context.tsx';
import { RPG_ArmorDomainModel } from '@core/domain/entities/RPG_ArmorDomainModel.ts';
import { RPG_ItemDomainModel } from '@core/domain/entities/RPG_ItemDomainModel.ts';
import { RPG_WeaponDomainModel } from '@core/domain/entities/RPG_WeaponDomainModel.ts';
import { IconSetSprite } from '@presentation/components/icons/IconSetSprite.tsx';
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';

/**
 * Mirrors J-Base {@code IconManager.rewardParam}: {@code rewardParam(1)} gold → 2048, {@code rewardParam(4)} SDP → 445.
 * Same mapping as JAFTING Creation {@code CraftingComponent#getIconIndex} / recipe detail panels — update both if you
 * change reward icons in {@code IconManager.rewardParam}.
 */
const EDITOR_REWARD_PARAM_ICON_GOLD = 2048;
const EDITOR_REWARD_PARAM_ICON_SDP = 445;

/**
 * Stands beside the datastore types in the slot-kind picker, for a slot that matches by ingredient type instead of
 * naming a row. Deliberately not a {@link CraftingComponentType}: nothing is ever written to disk under this value,
 * it only exists so one exclusive control can cover every kind of slot.
 */
const CATEGORICAL_SLOT_KIND = "categorical";

type CraftingListProps = {
  type: CraftingListType;
  updateRecipeFunc: (
    craftingComponents: Crafting.CraftingComponent[],
    craftingListType: CraftingListType
  ) => void;
  components: Crafting.CraftingComponent[];
  handleSnack: (
    message: string,
    severity?: MuiSnackbarSeverity,
    variant?: MuiSnackbarVariant
  ) => void;
};

/**
 * Reads {@link Rmmz.Base.RPG_BaseItem.iconIndex} from a database row via {@link RPG_BaseDomainModel.toRmmz}.
 */
export function readDatabaseIconIndex(
  row: RPG_ItemDomainModel | RPG_WeaponDomainModel | RPG_ArmorDomainModel | null
): number
{
  if (row === null)
  {
    return 0;
  }

  const dto = row.toRmmz() as { iconIndex?: number };
  if (typeof dto.iconIndex !== 'number')
  {
    return 0;
  }

  const v = Math.trunc(dto.iconIndex);
  if (v < 0)
  {
    return 0;
  }

  return v;
}

/**
 * Reads {@link Rmmz.Base.RPG_BaseItem.description} from a database row via {@link RPG_BaseDomainModel.toRmmz}.
 */
export function readDatabaseDescription(
  row: RPG_ItemDomainModel | RPG_WeaponDomainModel | RPG_ArmorDomainModel | null
): string
{
  if (row === null)
  {
    return '';
  }

  const dto = row.toRmmz() as { description?: string };
  if (typeof dto.description !== 'string')
  {
    return '';
  }

  return dto.description;
}

const CraftingComponentList = (props: CraftingListProps) =>
{
  // the vocabulary is authored on this board's own Ingredient Types tab.
  const { ingredientTypes } = useCrafting();

  //region state
  const [ currentComponents, setCurrentComponents ] = useState<Crafting.CraftingComponent[]>([]);
  const [ selectedComponent, setSelectedComponent ] = useState<Crafting.CraftingComponent | null>(null);
  const [ selectedComponentType, setSelectedComponentType ] = useState<CraftingComponentType | null>(null);
  const [ selectedComponentIndex, setSelectedComponentIndex ] = useState<number>(0);
  const [ pendingComponent, setPendingComponent ] = useState<Crafting.CraftingComponent | null>(null);

  // a slot is categorical exactly when it carries a categories array; the absence of one is what makes a slot
  // point at a specific row instead.
  const pendingSlotIsCategorical = pendingComponent?.categories !== undefined;

  const {
    data: items,
    byId: itemsById,
    loading: itemsLoading
  } = useItems();
  const {
    data: weapons,
    byId: weaponsById,
    loading: weaponsLoading
  } = useWeapons();
  const {
    data: armors,
    byId: armorsById,
    loading: armorsLoading
  } = useArmors();

  const [ componentListContextMenu, setComponentListContextMenu ] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);
  const [ componentModifierOpen, setComponentModifierOpen ] = useState(false);
  //endregion state

  const itemOptionsForPicker = useMemo(
    () => [ ...items ].filter((row) => row.name.trim() !== '' && !row.name.startsWith('=='))
      .sort((a, b) => a.id - b.id),
    [ items ]
  );

  const weaponOptionsForPicker = useMemo(
    () => [ ...weapons ].filter((row) => row.name.trim() !== '' && !row.name.startsWith('=='))
      .sort((a, b) => a.id - b.id),
    [ weapons ]
  );

  const armorOptionsForPicker = useMemo(
    () => [ ...armors ].filter((row) => row.name.trim() !== '' && !row.name.startsWith('=='))
      .sort((a, b) => a.id - b.id),
    [ armors ]
  );

  const itemPickerValue = useMemo((): RPG_ItemDomainModel | null =>
  {
    if (selectedComponentType !== CraftingComponentType.Item || pendingComponent === null)
    {
      return null;
    }

    return itemsById.get(pendingComponent.id) ?? null;
  }, [ selectedComponentType, pendingComponent, itemsById ]);

  const weaponPickerValue = useMemo((): RPG_WeaponDomainModel | null =>
  {
    if (selectedComponentType !== CraftingComponentType.Weapon || pendingComponent === null)
    {
      return null;
    }

    return weaponsById.get(pendingComponent.id) ?? null;
  }, [ selectedComponentType, pendingComponent, weaponsById ]);

  const armorPickerValue = useMemo((): RPG_ArmorDomainModel | null =>
  {
    if (selectedComponentType !== CraftingComponentType.Armor || pendingComponent === null)
    {
      return null;
    }

    return armorsById.get(pendingComponent.id) ?? null;
  }, [ selectedComponentType, pendingComponent, armorsById ]);

  /**
   * Initializes the board with the data from the configuration.
   */
  useEffect(() =>
  {
    setCurrentComponents(props.components);
    setSelectedComponent(null);
    setSelectedComponentType(null);
    setSelectedComponentIndex(0);
    setPendingComponent(null);
  }, [ props.components ]);

  //region actions
  const handleRecipeComponentListItemOnClickEvent = (index: number) =>
  {
    setSelectedComponentIndex(index);
    setSelectedComponent(null);
    setPendingComponent(null);

    if (currentComponents?.length > 0)
    {
      const thisIngredient = currentComponents[ index ];
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
    if (!pendingComponent)
    {
      return;
    }

    const updatedValue = value < 1
      ? 1
      : value;

    const updatedPendingIngredient = {
      ...pendingComponent,
      count: updatedValue
    } as Crafting.CraftingComponent;
    setPendingComponent(updatedPendingIngredient);
  };

  /**
   * Updates the pending component state when an item is selected from the searchable dropdown.
   * Leverages class instances to determine the correct CraftingComponentType.
   * @param {RPG_ItemDomainModel | RPG_WeaponDomainModel | RPG_ArmorDomainModel} newComponent The selected domain model.
   */
  const handleRelevantComponentDropdownOnClickEvent = (
    newComponent: RPG_ItemDomainModel | RPG_WeaponDomainModel | RPG_ArmorDomainModel
  ) =>
  {
    // Determine the type based on the class instance.
    let ingredientType = CraftingComponentType.Item;
    if (newComponent instanceof RPG_ItemDomainModel)
    {
      ingredientType = CraftingComponentType.Item;
    }
    else if (newComponent instanceof RPG_WeaponDomainModel)
    {
      ingredientType = CraftingComponentType.Weapon;
    }
    else if (newComponent instanceof RPG_ArmorDomainModel)
    {
      ingredientType = CraftingComponentType.Armor;
    }

    const updatedSelectedIngredient = {
      // spread the existing pending component to preserve properties like 'count'
      ...pendingComponent,
      id: newComponent.id,
      type: ingredientType,
      // Provide a fallback count if this is a fresh selection
      count: pendingComponent?.count ?? 1,
    } as Crafting.CraftingComponent;

    setPendingComponent(updatedSelectedIngredient);
  };

  /**
   * Replaces the ingredient types the pending slot will accept.
   * @param {string[]} keys The chosen type keys.
   */
  const handlePendingComponentCategoriesOnChangeEvent = (keys: string[]) =>
  {
    if (!pendingComponent)
    {
      return;
    }

    setPendingComponent({
      ...pendingComponent,
      categories: keys,
    } as Crafting.CraftingComponent);
  };

  /**
   * Answers the single question the slot editor asks: what kind of thing is this slot.
   *
   * Naming a datastore row and matching by type used to be two controls, and the second one silently disabled the
   * first - which read as the dialog breaking rather than as a choice. They are one decision with six answers, so
   * they are one control, and picking any of them clears whatever the other kind left behind.
   * @param {unknown} _ The originating event, which carries nothing this needs.
   * @param {string | null} newValue The chosen slot kind, or null when the current one is clicked again.
   */
  const handleSlotKindOnChangeEvent = (
    _: unknown,
    newValue: string | null
  ) =>
  {
    // an exclusive group reports null when the active button is clicked again; there is no "no kind" slot.
    if (newValue === null)
    {
      return;
    }

    if (newValue === CATEGORICAL_SLOT_KIND)
    {
      // the type letter is written but never read for a categorical slot - whatever fills it decides its own kind at
      // craft time. Carrying over whichever datastore was last selected leaves a slot claiming to be gold or panel
      // points, which is meaningless in the file and answers yes to predicates that ask.
      setPendingComponent((prev) => ({
        ...(prev ?? { count: 1 }),
        type: CraftingComponentType.Item,
        id: 0,
        categories: prev?.categories ?? [],
      }) as Crafting.CraftingComponent);

      setSelectedComponentType(CraftingComponentType.Item);

      return;
    }

    const chosenType = newValue as CraftingComponentType;

    setSelectedComponentType(chosenType);

    setPendingComponent((prev) =>
    {
      if (prev === null)
      {
        return {
          id: 0,
          type: chosenType,
          count: 1,
        } as Crafting.CraftingComponent;
      }

      // dropping the types is what makes this exclusive: a slot carrying both would leave the game to decide.
      const { categories: _categories, ...withoutCategories } = prev;

      // gold and panel points are quantities rather than rows, so any id left over would be meaningless.
      const keepsItsRow = chosenType !== CraftingComponentType.Gold && chosenType !== CraftingComponentType.Sdp;

      return {
        ...withoutCategories,
        type: chosenType,
        id: keepsItsRow
          ? withoutCategories.id
          : 0,
      } as Crafting.CraftingComponent;
    });
  };
  //endregion component updates

  //region list updates
  const handleAddNewComponent = (index: number) =>
  {
    const newComponent = {
      id: 1,
      type: CraftingComponentType.Item,
      count: 1,
    } as Crafting.CraftingComponent;

    // splicing covers the empty list too, where it lands the new slot at position zero.
    const updatedComponents = currentComponents.toSpliced(index, 0, newComponent);

    setCurrentComponents(updatedComponents);
    props.updateRecipeFunc(updatedComponents, props.type);
  };

  const handleCloneComponent = (index: number) =>
  {
    if (selectedComponent === null)
    {
      props.handleSnack('Must select a component to clone.', MuiSnackbarSeverity.Error);
      return;
    }

    const clonedComponent = {
      id: selectedComponent.id,
      type: selectedComponent.type,
      count: selectedComponent.count
    } as Crafting.CraftingComponent;

    const updatedComponents = currentComponents.toSpliced(index, 0, clonedComponent);

    setCurrentComponents(updatedComponents);
    props.updateRecipeFunc(updatedComponents, props.type);
  };

  const handleOverrideSelectedWithPendingComponentOnClickEvent = () =>
  {
    if (!pendingComponent || !selectedComponent)
    {
      return;
    }

    // spread the pending component rather than naming its fields: listing them by hand is what silently drops any
    // field added to a slot later, and the change simply appears not to have taken.
    const updatedSelectedIngredient = { ...pendingComponent } as Crafting.CraftingComponent;

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

  const handleReorderComponent = (
    index: number,
    delta: -1 | 1
  ) =>
  {
    const partner = index + delta;
    if (partner < 0 || partner >= currentComponents.length)
    {
      return;
    }

    const next = currentComponents.slice();
    const [ moved ] = next.splice(index, 1);
    next.splice(partner, 0, moved);

    setCurrentComponents(next);
    props.updateRecipeFunc(next, props.type);

    const prevSel = selectedComponentIndex;

    // the two rows traded places, so a selection sitting on either one follows it rather than staying put.
    let nextSel = selectedComponentIndex;
    if (selectedComponentIndex === index)
    {
      nextSel = partner;
    }
    else if (selectedComponentIndex === partner)
    {
      nextSel = index;
    }
    setSelectedComponentIndex(nextSel);
    setSelectedComponent(next[ nextSel ] ?? null);

    if (
      componentModifierOpen
      && pendingComponent !== null
      && (prevSel === index || prevSel === partner)
    )
    {
      setPendingComponent(next[ nextSel ] ?? null);
    }
  };
  //endregion list updates

  //region render
  /**
   * Resolves the type keys a slot accepts into their authored definitions, dropping any that no longer exist.
   * @param {string[]} categories The keys the slot was authored with.
   * @returns {Crafting.IngredientType[]} The definitions behind them, in the order chosen.
   */
  const resolveCategories = (categories: string[]): Crafting.IngredientType[] =>
  {
    return categories
      .map(key => ingredientTypes.find(type => type.key === key))
      .filter((type): type is Crafting.IngredientType => type !== undefined);
  };

  /**
   * Labels a slot that matches by type rather than naming a row.
   *
   * Wrapped in angle brackets and set in monospace so it cannot be mistaken for an item. "Any Gel" is a perfectly
   * plausible name for a real item in a game that already has Big Gelatin and Jelli Pilaf, whereas nothing in the
   * database is ever named with brackets - and they are the same brackets the underlying note tag uses, so the row
   * reads in the same language as the data behind it.
   * @param {string[]} categories The keys the slot accepts.
   * @param {number} count How many the slot consumes.
   */
  const renderCategoricalLabel = (
    categories: string[],
    count: number
  ) =>
  {
    const named = resolveCategories(categories);
    const inner = named.length === 0
      ? 'any ingredient'
      : `any ${named.map(type => type.name)
        .join(' + ')}`;

    return (
      <>
        <Box component={'span'} sx={{ fontFamily: 'monospace' }}>
          {`<${inner}>`}
        </Box>
        {` (${count})`}
      </>
    );
  };

  /**
   * The icon a categorical slot borrows: the first type it accepts, so the row is still recognisable at a glance.
   * @param {string[]} categories The keys the slot accepts.
   * @returns {number} An icon index, or zero when nothing resolves.
   */
  const categoricalIconIndex = (categories: string[]): number =>
  {
    const named = resolveCategories(categories);

    return named.length > 0
      ? named[ 0 ].iconIndex
      : 0;
  };

  /**
   * Counts the database entries that would currently satisfy a set of ingredient types.
   *
   * The runtime requires an entry to carry *every* type a slot asks for, which is easy to read as "any of these"
   * when the chips sit side by side. Asking for egg, eyeball and blood together looks reasonable and matches
   * nothing, because no single ingredient is all three. A count says so immediately, where prose does not.
   * @param {string[]} categories The keys the slot asks for.
   * @returns {number} How many items, weapons and armors carry all of them.
   */
  const countMatchingEntries = (categories: string[]): number =>
  {
    const carriesAll = (entry: { ingredientTypeKeys: string[] }) =>
      categories.every(key => entry.ingredientTypeKeys.includes(key));

    return items.filter(carriesAll).length
      + weapons.filter(carriesAll).length
      + armors.filter(carriesAll).length;
  };

  /**
   * Reports what a slot would accept, so an impossible combination announces itself while it is being authored.
   * @param {string[]} categories The keys the slot asks for.
   * @returns {string} Guidance naming the current match count.
   */
  // whether the vocabulary is in use at all yet, which decides how to read a count of zero.
  const anythingIsTagged = useMemo(
    () => items.some(row => row.ingredientTypeKeys.length > 0)
      || weapons.some(row => row.ingredientTypeKeys.length > 0)
      || armors.some(row => row.ingredientTypeKeys.length > 0),
    [ items, weapons, armors ]
  );

  const describeCategoricalMatches = (categories: string[]): string =>
  {
    if (categories.length === 0)
    {
      return 'Pick the types this slot accepts.';
    }

    const matches = countMatchingEntries(categories);

    if (matches === 0)
    {
      // "nothing matches" means two very different things, and saying the alarming one while a database is still
      // being tagged would fire on every slot until the work is finished - which teaches the reader to ignore it
      // before it ever means anything.
      return anythingIsTagged
        ? 'Nothing carries all of these, so this slot can never be filled. Try fewer, or a broader type.'
        : 'Needs one thing carrying all of these. Nothing is tagged with ingredient types yet.';
    }

    return `Needs one thing carrying all of these. ${matches} currently qualify.`;
  };
  const renderRecipeComponent = (
    craftingComponent: Crafting.CraftingComponent,
    index: number
  ) =>
  {
    if (!craftingComponent)
    {
      return <></>;
    }

    const ingredient = currentComponents.at(index);
    if (!ingredient)
    {
      return <></>;
    }

    let ingredientData = null;
    let spriteIndex = 0;
    let primaryLine: React.ReactNode = '';

    // a categorical slot has no row to name, so describing it by id would render as "0: ?" - which reads as a
    // broken row rather than a deliberate one.
    if (ingredient.categories !== undefined)
    {
      spriteIndex = categoricalIconIndex(ingredient.categories);
      primaryLine = renderCategoricalLabel(ingredient.categories, ingredient.count);
    }
    else
    {
      switch (ingredient.type)
      {
        case CraftingComponentType.Item:
          ingredientData = itemsById.get(ingredient.id) ?? null;
          spriteIndex = readDatabaseIconIndex(ingredientData);
          primaryLine = `${ingredient.id}: ${ingredientData?.name ?? '?'} (${ingredient.count})`;
          break;
        case CraftingComponentType.Weapon:
          ingredientData = weaponsById.get(ingredient.id) ?? null;
          spriteIndex = readDatabaseIconIndex(ingredientData);
          primaryLine = `${ingredient.id}: ${ingredientData?.name ?? '?'} (${ingredient.count})`;
          break;
        case CraftingComponentType.Armor:
          ingredientData = armorsById.get(ingredient.id) ?? null;
          spriteIndex = readDatabaseIconIndex(ingredientData);
          primaryLine = `${ingredient.id}: ${ingredientData?.name ?? '?'} (${ingredient.count})`;
          break;
        case CraftingComponentType.Gold:
          spriteIndex = EDITOR_REWARD_PARAM_ICON_GOLD;
          primaryLine = `Gold (${ingredient.count})`;
          break;
        case CraftingComponentType.Sdp:
          spriteIndex = EDITOR_REWARD_PARAM_ICON_SDP;
          primaryLine = `SDP (${ingredient.count})`;
          break;
        default:
          throw new Error(`unknown ingredient type detected: ${ingredient.type}`);
      }
    }

    const dbDescription = readDatabaseDescription(ingredientData);
    const hasDescriptionTooltip = dbDescription.trim() !== '';

    const actionStack = (
      <Stack
        direction="row"
        spacing={0}
        alignItems="center"
        onClick={(e) => e.stopPropagation()}
      >
        <IconButton
          size="small"
          aria-label="Move component up"
          disabled={index === 0}
          onClick={() => handleReorderComponent(index, -1)}
        >
          <KeyboardArrowUp fontSize="small"/>
        </IconButton>
        <IconButton
          size="small"
          aria-label="Move component down"
          disabled={index >= currentComponents.length - 1}
          onClick={() => handleReorderComponent(index, 1)}
        >
          <KeyboardArrowDown fontSize="small"/>
        </IconButton>
        <IconButton
          size="small"
          aria-label="Edit component"
          onClick={() =>
          {
            handleRecipeComponentListItemOnClickEvent(index);
            handleOpenComponentModifierDialogOnClick();
          }}
        >
          <Edit fontSize="small"/>
        </IconButton>
        <IconButton
          size="small"
          aria-label="Remove component"
          onClick={() => handleDeleteTargetComponent(index)}
        >
          <Clear fontSize="small"/>
        </IconButton>
      </Stack>
    );

    const rowButton = (
      <ListItemButton
        selected={selectedComponentIndex === index}
        onClick={() => handleRecipeComponentListItemOnClickEvent(index)}
      >
        <ListItemIcon sx={{ minWidth: 36 }}>
          <IconSetSprite
            iconIndex={spriteIndex}
            sizePx={28}
          />
        </ListItemIcon>
        <ListItemText
          primary={primaryLine}
          disableTypography
          sx={{ width: '100%' }}
        />
        {actionStack}
      </ListItemButton>
    );

    return (
      <ListItem
        key={`${index}-${ingredient.type}-${ingredient.id}`}
        disableGutters
      >
        {hasDescriptionTooltip
          ? (
            <Tooltip
              enterDelay={400}
              placement="right-start"
              slotProps={{
                tooltip: {
                  sx: {
                    maxWidth: 'min(90vw, 52rem)',
                    boxSizing: 'border-box',
                  },
                },
              }}
              title={
                <Typography
                  component="div"
                  variant="body2"
                  sx={{ whiteSpace: 'pre-wrap' }}
                >
                  {dbDescription}
                </Typography>
              }
            >
              {rowButton}
            </Tooltip>
          )
          : rowButton}
      </ListItem>
    );
  };

  const renderRelevantRecipeComponentDropdown = () =>
  {
    const listboxProps = {
      listbox: {
        sx: { maxHeight: '170px' },
      },
    };

    const optionLabelWithId = (
      option: RPG_ItemDomainModel | RPG_WeaponDomainModel | RPG_ArmorDomainModel | null
    ): string =>
    {
      if (option === null)
      {
        return '';
      }

      return `${option.id}: ${option.name}`;
    };

    switch (selectedComponentType)
    {
      case CraftingComponentType.Item:
        return (
          <Autocomplete<RPG_ItemDomainModel, false, false, false>
            size={'small'}
            options={itemOptionsForPicker}
            value={itemPickerValue}
            onChange={(
              _,
              value
            ) =>
            {
              if (value !== null)
              {
                handleRelevantComponentDropdownOnClickEvent(value);
              }
            }}
            slotProps={listboxProps}
            getOptionKey={(option) => option.id}
            getOptionLabel={optionLabelWithId}
            isOptionEqualToValue={(
              option,
              other
            ) => option.id === other.id}
            renderInput={(params) =>
            {
              return <TextField
                {...params}
                size={'small'}
                label={'Items'}
                placeholder="Item name..."
              />;
            }}
          />);
      case CraftingComponentType.Weapon:
        return (
          <Autocomplete<RPG_WeaponDomainModel, false, false, false>
            size={'small'}
            options={weaponOptionsForPicker}
            value={weaponPickerValue}
            onChange={(
              _,
              value
            ) =>
            {
              if (value !== null)
              {
                handleRelevantComponentDropdownOnClickEvent(value);
              }
            }}
            slotProps={listboxProps}
            getOptionKey={(option) => option.id}
            getOptionLabel={optionLabelWithId}
            isOptionEqualToValue={(
              option,
              other
            ) => option.id === other.id}
            renderInput={(params) =>
            {
              return <TextField
                {...params}
                size={'small'}
                label={'Weapons'}
                placeholder="Weapon name..."
              />;
            }}
          />);
      case CraftingComponentType.Armor:
        return (
          <Autocomplete<RPG_ArmorDomainModel, false, false, false>
            size={'small'}
            options={armorOptionsForPicker}
            value={armorPickerValue}
            onChange={(
              _,
              value
            ) =>
            {
              if (value !== null)
              {
                handleRelevantComponentDropdownOnClickEvent(value);
              }
            }}
            slotProps={listboxProps}
            getOptionKey={(option) => option.id}
            getOptionLabel={optionLabelWithId}
            isOptionEqualToValue={(
              option,
              other
            ) => option.id === other.id}
            renderInput={(params) =>
            {
              return <TextField
                {...params}
                size={'small'}
                label={'Armors'}
                placeholder="Armor name..."
              />;
            }}
          />);
      case CraftingComponentType.Gold:
        return (
          <Typography
            variant="body2"
            color="text.secondary"
          >
            Party gold component (<code>type: &quot;g&quot;</code>, <code>id: 0</code>). Use count below — consumed when
            listed under ingredients; tools only check balance (not consumed).
          </Typography>
        );
      case CraftingComponentType.Sdp:
        return (
          <Typography
            variant="body2"
            color="text.secondary"
          >
            SDP points (<code>type: &quot;s&quot;</code>, <code>id: 0</code>). Requires J-SDP linkage in game; count is
            points gained or spent per JAFTING recipe.
          </Typography>
        );
      default:
        return <></>;
    }
  };

  /**
   * Shows what the slot will become, and what it was only when that differs.
   *
   * Showing both unconditionally meant the dialog opened displaying the same chip twice, which reads as a diff
   * view of the form rather than as an edit of a recipe. The row behind the dialog already states the current
   * value, so repeating it earns its space only once the two have parted ways.
   */
  const renderPendingComponentPreview = () =>
  {
    if (!pendingComponent)
    {
      return <></>;
    }

    const changed = selectedComponent !== null
      && JSON.stringify(selectedComponent) !== JSON.stringify(pendingComponent);

    return (
      <Stack spacing={1}>
        <Typography variant={'caption'} color={'text.secondary'}>
          {changed
            ? 'Result'
            : 'Unchanged'}
        </Typography>
        <Stack direction={'row'} spacing={1} alignItems={'center'} flexWrap={'wrap'} useFlexGap>
          {changed && (<>
            {buildComponentChip(selectedComponent, 'outlined')}
            <Typography variant={'body2'} color={'text.secondary'}>{'>'}</Typography>
          </>)}
          {buildComponentChip(pendingComponent)}
        </Stack>
      </Stack>
    );
  };

  const buildComponentChip = (
    craftingComponent: Crafting.CraftingComponent,
    variant: 'filled' | 'outlined' = 'filled'
  ) =>
  {
    let componentData = null;
    let color: ('primary' | 'secondary' | 'success' | 'error' | 'info' | 'warning') = 'primary';
    let chipLabel = '';
    let chipIconIndex = 0;

    // a categorical slot names no row, so the switch below has nothing to look up. describe what it accepts instead,
    // borrowing the icon of the first type so the chip is still recognisable at a glance.
    if (craftingComponent.categories !== undefined)
    {
      return (
        <Chip
          icon={
            <IconSetSprite
              iconIndex={categoricalIconIndex(craftingComponent.categories)}
              sizePx={22}
            />
          }
          label={renderCategoricalLabel(craftingComponent.categories, craftingComponent.count)}
          variant={variant}
          color={'primary'}
        />
      );
    }

    switch (craftingComponent.type)
    {
      case CraftingComponentType.Item:
        componentData = itemsById.get(craftingComponent.id) ?? null;
        color = 'success';
        chipLabel = `${componentData?.name ?? `#${craftingComponent.id}`} (${craftingComponent.count})`;
        chipIconIndex = readDatabaseIconIndex(componentData);
        break;
      case CraftingComponentType.Weapon:
        componentData = weaponsById.get(craftingComponent.id) ?? null;
        color = 'error';
        chipLabel = `${componentData?.name ?? `#${craftingComponent.id}`} (${craftingComponent.count})`;
        chipIconIndex = readDatabaseIconIndex(componentData);
        break;
      case CraftingComponentType.Armor:
        componentData = armorsById.get(craftingComponent.id) ?? null;
        color = 'info';
        chipLabel = `${componentData?.name ?? `#${craftingComponent.id}`} (${craftingComponent.count})`;
        chipIconIndex = readDatabaseIconIndex(componentData);
        break;
      case CraftingComponentType.Gold:
        color = 'warning';
        chipLabel = `Gold (${craftingComponent.count})`;
        chipIconIndex = EDITOR_REWARD_PARAM_ICON_GOLD;
        break;
      case CraftingComponentType.Sdp:
        color = 'secondary';
        chipLabel = `SDP (${craftingComponent.count})`;
        chipIconIndex = EDITOR_REWARD_PARAM_ICON_SDP;
        break;
      default:
        throw new Error(`unknown ingredient type detected: ${craftingComponent.type}`);
    }

    const chipIcon = (
      <IconSetSprite
        iconIndex={chipIconIndex}
        sizePx={22}
      />
    );

    return (
      <Chip
        icon={chipIcon}
        label={chipLabel}
        variant={variant}
        color={color}
      />
    );
  };

  /**
   * Names the add button after the one thing it adds, rather than after the list it adds to.
   */
  const renderAddComponentLabel = (): string =>
  {
    switch (props.type)
    {
      case CraftingListType.Ingredients:
        return 'Add ingredient';
      case CraftingListType.Tools:
        return 'Add tool';
      case CraftingListType.Outputs:
        return 'Add output';
      case CraftingListType.Cost:
        return 'Add to price';
      default:
        throw new Error(`unknown crafting list type detected: ${props.type}`);
    }
  };
  //endregion render

  if (itemsLoading || weaponsLoading || armorsLoading)
  {
    return <Typography>Loading components...</Typography>;
  }

  return <>
    <BoardSectionCard title={props.type} density={'compact'}>
      <div onContextMenu={handleComponentListContextMenu} style={{ cursor: 'context-menu' }}>
        <List dense>
          {currentComponents.map((ingredient, index) => renderRecipeComponent(ingredient, index))}
        </List>
        {/* always offered, not only while the list is empty. the right-click menu can place a slot precisely, but
            nothing on screen says it exists, so a recipe that already had one slot appeared to be finished. */}
        <Button
          fullWidth
          startIcon={<Add/>}
          onClick={() => handleAddNewComponent(currentComponents.length)}
          variant={currentComponents.length > 0
            ? 'outlined'
            : 'contained'}
        >
          {renderAddComponentLabel()}
        </Button>
      </div>
    </BoardSectionCard>
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
      maxWidth={'md'}
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
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Stack>
            <Typography variant={'caption'} color={'text.secondary'} sx={{ mb: 0.5 }}>
              Slot kind
            </Typography>
            <ToggleButtonGroup
              exclusive
              size={'small'}
              color={'primary'}
              value={pendingSlotIsCategorical
                ? CATEGORICAL_SLOT_KIND
                : selectedComponentType}
              onChange={handleSlotKindOnChangeEvent}
              sx={{ flexWrap: 'wrap', gap: 0.5 }}
            >
              <ToggleButton value={CraftingComponentType.Item}>
                <BusinessCenter sx={{ color: brown[ 500 ], mr: 0.5 }} fontSize={'small'}/>
                Item
              </ToggleButton>
              <ToggleButton value={CraftingComponentType.Weapon}>
                <LocalDining color={'error'} sx={{ mr: 0.5 }} fontSize={'small'}/>
                Weapon
              </ToggleButton>
              <ToggleButton value={CraftingComponentType.Armor}>
                <Shield color={'info'} sx={{ mr: 0.5 }} fontSize={'small'}/>
                Armor
              </ToggleButton>
              <ToggleButton value={CraftingComponentType.Gold}>
                <AttachMoney color={'warning'} sx={{ mr: 0.5 }} fontSize={'small'}/>
                Gold
              </ToggleButton>
              <ToggleButton value={CraftingComponentType.Sdp}>
                <AutoAwesome color={'secondary'} sx={{ mr: 0.5 }} fontSize={'small'}/>
                SDP
              </ToggleButton>
              {props.type === CraftingListType.Ingredients && (
                <ToggleButton value={CATEGORICAL_SLOT_KIND}>
                  <Category color={'success'} sx={{ mr: 0.5 }} fontSize={'small'}/>
                  Any type
                </ToggleButton>
              )}
            </ToggleButtonGroup>
          </Stack>

          {pendingSlotIsCategorical
            ? (
              <IngredientTypeChips
                options={ingredientTypes}
                value={pendingComponent?.categories ?? []}
                onChange={handlePendingComponentCategoriesOnChangeEvent}
                label={'Accepts'}
                placeholder={'Any ingredient'}
                helperText={describeCategoricalMatches(pendingComponent?.categories ?? [])}
              />
            )
            : renderRelevantRecipeComponentDropdown()}

          <TextField
            type={'number'}
            size={'small'}
            label={'Count'}
            value={pendingComponent?.count ?? 1}
            sx={{ maxWidth: 160 }}
            onChange={(event) => handlePendingComponentCountOnChangeEvent(parseInt(event.target.value) ?? 1)}
          />

          {renderPendingComponentPreview()}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button
          variant={'contained'}
          color={'warning'}
          startIcon={<Close/>}
          onClick={() => handleCloseComponentModifierDialogOnClick()}
        >
          Nevermind
        </Button>
        <Button
          color={'primary'}
          variant={'contained'}
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
  </>;
};

export default CraftingComponentList;
