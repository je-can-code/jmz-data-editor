import { type ChangeEvent, type MouseEvent, useState } from 'react';
import {
  Box,
  Checkbox,
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
  Select,
  styled,
  TextField,
  Typography,
} from '@mui/material';
import { Add, ContentCopy, Key, Psychology, Remove, School } from '@mui/icons-material';
import { BoardEmptyState } from '@presentation/components/board/BoardEmptyState.tsx';
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';
import { IconIndexField } from '@presentation/components/icons/IconIndexField.tsx';
import { SystemService } from '@services/SystemService.ts';

import KnowledgeTag = Proficiency.KnowledgeTag;
import SkillTypeMapping = Proficiency.SkillTypeMapping;

// matches the monospaced list rows the other boards use, so keys line up while scanning.
const EntryText = styled(ListItemText)`
  font-family: monospace;
`;

/**
 * The properties required to author what knowledge exists and where it comes from.
 */
type KnowledgeTabProps = {
  /** The kinds of knowledge as they currently stand. */
  tags: KnowledgeTag[];
  /** Called with the full replacement list whenever a kind changes. */
  onTagsChange: (updated: KnowledgeTag[]) => void;
  /** Which kinds each skill type produces, keyed by skill type id. */
  mapping: SkillTypeMapping;
  /** Called with the full replacement mapping whenever it changes. */
  onMappingChange: (updated: SkillTypeMapping) => void;
};

/**
 * Builds a blank kind of knowledge, ready to be named.
 * @returns {KnowledgeTag} An empty tag row.
 */
const buildEmptyTag = (): KnowledgeTag =>
{
  return {
    key: '',
    name: '',
    iconIndex: 0,
    description: '',
  };
};

/**
 * The kinds of knowledge the party accumulates by using skills, and which skills produce which.
 *
 * A kind of knowledge is a name for a balance and nothing more; what it means is entirely up to what
 * you map onto it and what you let it buy. The game never knows the difference between one kind and
 * another, so a new one costs nothing but a row here.
 *
 * A skill type left unticked produces nothing at all. That is how the hundreds of passives, tool skills
 * and item skills stay out of the economy without anybody listing them - and it means a skill type
 * added later stays silent until somebody says otherwise.
 * @param {KnowledgeTabProps} props The tags, the mapping, and their change handlers.
 */
const KnowledgeTab = ({ tags, onTagsChange, mapping, onMappingChange }: KnowledgeTabProps) =>
{
  //region state
  const [ selectedIndex, setSelectedIndex ] = useState<number>(0);
  const [ contextMenu, setContextMenu ] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);
  //endregion state

  // the selection is held as an index so that adding and removing rows keeps the cursor somewhere sensible.
  const selectedTag = tags[ selectedIndex ] ?? null;

  //region actions
  /**
   * Selects a kind of knowledge for editing.
   * @param {number} index The index of the tag that was clicked.
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
   * Inserts a blank kind of knowledge at a position and selects it.
   * @param {number} index Where the new tag should sit.
   */
  const handleAddTag = (index: number) =>
  {
    const updated = [ ...tags ];
    updated.splice(index, 0, buildEmptyTag());

    onTagsChange(updated);
    setSelectedIndex(index);
  };

  /**
   * Copies the selected kind of knowledge to a position and selects the copy.
   * @param {number} index Where the copy should sit.
   */
  const handleCloneTag = (index: number) =>
  {
    if (selectedTag === null)
    {
      return;
    }

    const updated = [ ...tags ];
    updated.splice(index, 0, { ...selectedTag });

    onTagsChange(updated);
    setSelectedIndex(index);
  };

  /**
   * Removes a kind of knowledge, leaving the cursor on the row that took its place.
   * @param {number} index The tag to remove.
   */
  const handleDeleteTag = (index: number) =>
  {
    if (tags.length === 0)
    {
      return;
    }

    const updated = [ ...tags ];
    updated.splice(index, 1);

    onTagsChange(updated);
    setSelectedIndex(Math.max(0, Math.min(index, updated.length - 1)));
  };

  /**
   * Applies a partial change to the selected kind of knowledge.
   * @param {Partial<KnowledgeTag>} patch The fields that changed.
   */
  const patchSelectedTag = (patch: Partial<KnowledgeTag>) =>
  {
    if (selectedTag === null)
    {
      return;
    }

    const updated = [ ...tags ];
    updated[ selectedIndex ] = {
      ...selectedTag,
      ...patch,
    };

    onTagsChange(updated);
  };

  /**
   * Updates the key everything else refers to this kind of knowledge by.
   * @param {ChangeEvent<HTMLInputElement>} event The field's change event.
   */
  const handleKeyOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    // the key can only carry letters, digits, and underscores, so anything else is refused as it is
    // typed rather than accepted here and rejected by the game at boot.
    const cleaned = event.target.value
      .replace(/[^\w]/g, '')
      .toLowerCase();

    patchSelectedTag({ key: cleaned });
  };

  /**
   * Updates the name shown on the currency strip.
   * @param {ChangeEvent<HTMLInputElement>} event The field's change event.
   */
  const handleNameOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    patchSelectedTag({ name: event.target.value });
  };

  /**
   * Updates the icon shown beside the amount.
   * @param {number} value The chosen icon index.
   */
  const handleIconIndexOnChangeEvent = (value: number) =>
  {
    patchSelectedTag({ iconIndex: value });
  };

  /**
   * Updates the note describing what this kind of knowledge represents.
   * @param {ChangeEvent<HTMLInputElement>} event The field's change event.
   */
  const handleDescriptionOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    patchSelectedTag({ description: event.target.value });
  };

  /**
   * Replaces which kinds of knowledge a single skill type produces.
   * @param {number} skillTypeId The skill type being changed.
   * @param {string[]} tagKeys The kinds it now produces.
   */
  const handleMappingOnChangeEvent = (skillTypeId: number, tagKeys: string[]) =>
  {
    const updated = { ...mapping };

    // a skill type producing nothing is dropped outright rather than stored as an empty list, because
    // absence is what the game reads as "this teaches nothing".
    if (tagKeys.length === 0)
    {
      delete updated[ String(skillTypeId) ];
    }
    else
    {
      updated[ String(skillTypeId) ] = tagKeys;
    }

    onMappingChange(updated);
  };
  //endregion updates

  //region render
  /**
   * Renders one row of the tag list.
   * @param {KnowledgeTag} tag The tag to render.
   * @param {number} index Its position in the list.
   */
  const renderListItem = (
    tag: KnowledgeTag,
    index: number
  ) =>
  {
    // an unnamed row still needs to be findable, or a freshly added tag looks like it never arrived.
    const label = tag.key.length > 0
      ? `${tag.key}: ${tag.name}`
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
              ? <School color={'secondary'}/>
              : <Psychology color={'info'}/>}
          </ListItemIcon>
          <EntryText
            primary={label}
            disableTypography/>
        </ListItemButton>
      </ListItem>
    );
  };

  /**
   * Renders one skill type's row of the mapping.
   * @param {string} skillTypeName The name of the skill type.
   * @param {number} skillTypeId Its id, which is its index in the system list.
   */
  const renderMappingRow = (skillTypeName: string, skillTypeId: number) =>
  {
    const selected = mapping[ String(skillTypeId) ] ?? [];

    return (
      <Grid container key={skillTypeId} alignItems={'center'} sx={{ mb: 1 }}>
        <Grid size={4}>
          <Typography variant={'body2'}>{`${skillTypeId}: ${skillTypeName}`}</Typography>
        </Grid>
        <Grid size={8}>
          <Select
            multiple
            displayEmpty
            size={'small'}
            fullWidth
            value={selected}
            onChange={(event) => handleMappingOnChangeEvent(skillTypeId, event.target.value as string[])}
            renderValue={(picked) => ((picked as string[]).length === 0
              ? 'Teaches nothing'
              : (picked as string[]).join(', '))}
          >
            {tags.map((tag) => (
              <MenuItem key={tag.key} value={tag.key}>
                <Checkbox checked={selected.includes(tag.key)}/>
                <ListItemText primary={tag.name.length > 0
                  ? tag.name
                  : tag.key}/>
              </MenuItem>
            ))}
          </Select>
        </Grid>
      </Grid>
    );
  };
  //endregion render

  return <>
    <Grid container rowSpacing={2} columnSpacing={2} sx={{ height: '100%' }}>
      <Grid size={4}>
        <BoardSectionCard title={'Kinds of Knowledge'} density={'compact'}>
          <Box
            onContextMenu={handleListContextMenu}
            sx={{
              cursor: 'context-menu',
              maxHeight: '35vh',
              overflowY: 'auto',
            }}
          >
            <List dense>
              {tags.map((tag, index) => renderListItem(tag, index))}
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
        {selectedTag !== null
          ? (
            <BoardSectionCard title={'Knowledge'}>
              <Grid container rowSpacing={2} columnSpacing={2} alignItems={'flex-start'}>
                <Grid size={6}>
                  <TextField
                    required
                    variant={'outlined'}
                    label={'Key'}
                    value={selectedTag.key}
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
                    value={selectedTag.name}
                    onChange={handleNameOnChangeEvent}
                    size={'small'}
                    fullWidth
                    helperText={'Shown beside the amount in the menu.'}
                  />
                </Grid>

                <Grid size={12}>
                  <IconIndexField
                    value={selectedTag.iconIndex}
                    onChange={handleIconIndexOnChangeEvent}
                  />
                </Grid>

                <Grid size={12}>
                  <TextField
                    variant={'outlined'}
                    label={'Description'}
                    value={selectedTag.description}
                    onChange={handleDescriptionOnChangeEvent}
                    size={'small'}
                    multiline
                    fullWidth
                    rows={3}
                    helperText={'What this kind of knowledge represents. For your reference while authoring.'}
                  />
                </Grid>
              </Grid>
            </BoardSectionCard>
          )
          : (
            <BoardEmptyState
              icon={<Psychology sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }}/>}
              message={'Select a kind of knowledge from the list, or right-click to add one.'}
            />
          )}
      </Grid>

      <Grid size={12}>
        <BoardSectionCard title={'What Each Skill Type Teaches'}>
          <Typography variant={'body2'} sx={{ mb: 2 }}>
            Using a skill teaches whatever its type is set to teach here. A type left empty teaches
            nothing at all.
          </Typography>

          {SystemService.skillTypes.map((skillTypeName, skillTypeId) => (skillTypeName.length > 0
            ? renderMappingRow(skillTypeName, skillTypeId)
            : null))}
        </BoardSectionCard>
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
        handleAddTag(selectedIndex);
        handleContextMenuOnCloseEvent();
      }}>
        <ListItemIcon><Add/></ListItemIcon>
        <Typography>Add new above</Typography>
      </MenuItem>

      <MenuItem onClick={() =>
      {
        handleAddTag(selectedIndex + 1);
        handleContextMenuOnCloseEvent();
      }}>
        <ListItemIcon><Add/></ListItemIcon>
        <Typography>Add new below</Typography>
      </MenuItem>

      <Divider/>

      <MenuItem onClick={() =>
      {
        handleCloneTag(selectedIndex + 1);
        handleContextMenuOnCloseEvent();
      }}>
        <ListItemIcon><ContentCopy/></ListItemIcon>
        <Typography>Clone below</Typography>
      </MenuItem>

      <MenuItem dense onClick={() =>
      {
        handleDeleteTag(selectedIndex);
        handleContextMenuOnCloseEvent();
      }}>
        <ListItemIcon><Remove/></ListItemIcon>
        <Typography>Remove Selected</Typography>
      </MenuItem>
    </Menu>
  </>;
};

export { KnowledgeTab };
