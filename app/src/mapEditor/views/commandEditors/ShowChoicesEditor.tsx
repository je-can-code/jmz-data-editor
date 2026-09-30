import React, { useMemo, useState } from 'react';
import { Alert, Box, Button, IconButton, TextField, Tooltip, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import type { CommandEditorProps } from '../../core/commands/CommandEditorRegistry.ts';
import {
  CANCEL_BRANCH,
  CANCEL_DISALLOWED,
  cancelBranchCommandCount,
  insertChoice,
  moveChoice,
  NO_DEFAULT,
  parseChoiceList,
  removeChoice,
  setChoiceText,
  writeChoiceList,
  type ChoiceListModel,
} from '../../core/commands/editors/showChoices.ts';
import { EditorStack, FieldRow, SelectField, UneditableCommand } from './editorFields.tsx';
import { useDraftText } from './useDraftText.ts';

/**
 * Where the choice window sits, in MZ's order.
 */
const POSITIONS = [ { value: 0, label: 'Left' }, { value: 1, label: 'Middle' }, { value: 2, label: 'Right' } ];

/**
 * The choice window's looks, in MZ's order.
 */
const BACKGROUNDS = [ { value: 0, label: 'Window' }, { value: 1, label: 'Dim' }, { value: 2, label: 'Transparent' } ];

/**
 * Names a choice for a dropdown: its number, and its text.
 * @param {number} index The choice's place.
 * @param {string} text Its text.
 * @returns {string} The label.
 */
const choiceLabel = (index: number, text: string): string =>
{
  return text === '' ? `Choice ${index + 1}` : `Choice ${index + 1}: ${text}`;
};

/**
 * Lists what cancel can do: nothing, run the cancel branch, or pick a choice. A stored choice past the last one
 * (MZ's dialog allows it) stays listed while it is picked.
 * @param {ChoiceListModel} model The list.
 * @returns {{ value: number, label: string }[]} The options.
 */
const cancelOptions = (model: ChoiceListModel) =>
{
  const choices = model.choices.map((choice, index) => ({ value: index, label: choiceLabel(index, choice.text) }));
  const stray = model.cancelType >= model.choices.length ? [ { value: model.cancelType, label: `Choice ${model.cancelType + 1} (empty)` } ] : [];
  return [ { value: CANCEL_DISALLOWED, label: 'Does nothing' }, { value: CANCEL_BRANCH, label: 'Runs the cancel branch' }, ...choices, ...stray ];
};

/**
 * Lists which choice can be highlighted first: none, or any choice. A stored choice past the last one stays
 * listed while it is picked.
 * @param {ChoiceListModel} model The list.
 * @returns {{ value: number, label: string }[]} The options.
 */
const defaultOptions = (model: ChoiceListModel) =>
{
  const choices = model.choices.map((choice, index) => ({ value: index, label: choiceLabel(index, choice.text) }));
  const stray = model.defaultType >= model.choices.length ? [ { value: model.defaultType, label: `Choice ${model.defaultType + 1} (empty)` } ] : [];
  return [ { value: NO_DEFAULT, label: 'None' }, ...choices, ...stray ];
};

/**
 * What one choice's row takes.
 */
type ChoiceRowProps = {
  readonly index: number;
  readonly count: number;
  readonly text: string;
  readonly onText: (text: string) => void;
  readonly onMove: (to: number) => void;
  readonly onRemove: () => void;
};

/**
 * One choice: its text, and buttons to move it or remove it with its branch.
 * @param {ChoiceRowProps} props The choice and what to do with a change.
 * @returns {React.JSX.Element} The row.
 */
const ChoiceRow = (props: ChoiceRowProps) =>
{
  const { index, count, text, onText, onMove, onRemove } = props;
  const [ draft, change ] = useDraftText(text, onText);
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <TextField size={'small'} fullWidth label={`Choice ${index + 1}`} value={draft} onChange={event => change(event.target.value)}/>
      <Tooltip title={'Move up'}>
        <span>
          <IconButton size={'small'} aria-label={`Move choice ${index + 1} up`} disabled={index === 0} onClick={() => onMove(index - 1)}>
            <ArrowUpwardIcon fontSize={'small'}/>
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={'Move down'}>
        <span>
          <IconButton size={'small'} aria-label={`Move choice ${index + 1} down`} disabled={index === count - 1} onClick={() => onMove(index + 1)}>
            <ArrowDownwardIcon fontSize={'small'}/>
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={'Remove, with what it runs'}>
        <span>
          <IconButton size={'small'} aria-label={`Remove choice ${index + 1}`} disabled={count === 1} onClick={onRemove}>
            <DeleteOutlineIcon fontSize={'small'}/>
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
};

/**
 * The cancel dropdown, which asks once more before switching the cancel branch off while it holds commands.
 * @param {{ model: ChoiceListModel, onChange: (cancelType: number) => void }} props The list and what to do with a new setting.
 * @returns {React.JSX.Element} The dropdown.
 */
const CancelField = (props: { model: ChoiceListModel; onChange: (cancelType: number) => void }) =>
{
  const { model, onChange } = props;
  const [ pending, setPending ] = useState<number | null>(null);
  const held = cancelBranchCommandCount(model);

  return (
    <>
      <SelectField label={'Cancel'} value={model.cancelType} options={cancelOptions(model)} width={260} onChange={cancelType =>
      {
        if (model.cancelType === CANCEL_BRANCH && cancelType !== CANCEL_BRANCH && held > 0)
        {
          setPending(cancelType);
          return;
        }

        onChange(cancelType);
      }}/>
      {pending === null
        ? null
        : (
          <Alert severity={'warning'} variant={'outlined'} sx={{ flexBasis: '100%' }} action={(
            <>
              <Button size={'small'} color={'inherit'} onClick={() => setPending(null)}>Keep</Button>
              <Button size={'small'} color={'inherit'} onClick={() =>
              {
                onChange(pending);
                setPending(null);
              }}>Remove</Button>
            </>
          )}>
            {held === 1 ? 'The cancel branch holds a command, which goes with it.' : `The cancel branch holds ${held} commands, which go with it.`}
          </Alert>
        )}
    </>
  );
};

/**
 * Lists a Show Choices command's choices without editing them, for when the list has not handed over the whole
 * block: every change to a choice also changes the block around it.
 * @param {{ command: CommandEditorProps['command'] }} props The command.
 * @returns {React.JSX.Element} The list.
 */
const ChoicesReadOnly = (props: { command: CommandEditorProps['command'] }) =>
{
  const [ texts ] = props.command.parameters;
  return (
    <EditorStack>
      {Array.isArray(texts) ? texts.map((text, index) => <Typography key={index} variant={'body2'}>{choiceLabel(index, String(text))}</Typography>) : null}
      <Typography variant={'caption'} color={'text.secondary'}>Choices are changed from the command list.</Typography>
    </EditorStack>
  );
};

/**
 * Edits a Show Choices list as the player sees it. HIME_LargeChoices shows consecutive Show Choices commands as
 * one list, so this edits all of them as one: any number of choices, one cancel setting and one default across
 * them, and the list written back in exactly the commands it arrived as when nothing changed. Choices move and
 * go with the commands they run.
 * @param {CommandEditorProps} props The command, its whole list when handed over, and what to do with a change.
 * @returns {React.JSX.Element} The editor.
 */
const ShowChoicesEditor = (props: CommandEditorProps) =>
{
  const { command, block } = props;
  const model = useMemo(() => (block === undefined ? null : parseChoiceList(block.commands)), [ block ]);
  if (block === undefined)
  {
    return <ChoicesReadOnly command={command}/>;
  }

  if (model === null)
  {
    return <UneditableCommand command={command}/>;
  }

  const change = (next: ChoiceListModel) => block.onChange(writeChoiceList(next));
  const count = model.choices.length;

  return (
    <EditorStack>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {model.choices.map((choice, index) => (
          <ChoiceRow
            key={index}
            index={index}
            count={count}
            text={choice.text}
            onText={text => change(setChoiceText(model, index, text))}
            onMove={to => change(moveChoice(model, index, to))}
            onRemove={() => change(removeChoice(model, index))}
          />
        ))}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button size={'small'} startIcon={<AddIcon/>} onClick={() => change(insertChoice(model, count, ''))}>Add choice</Button>
          {model.blocks.length > 1
            ? <Typography variant={'caption'} color={'text.secondary'}>{`Shown as one list, kept as ${model.blocks.length} commands of up to six.`}</Typography>
            : null}
        </Box>
      </Box>
      <FieldRow>
        <CancelField model={model} onChange={cancelType => change({ ...model, cancelType })}/>
        <SelectField label={'Highlighted first'} value={model.defaultType} options={defaultOptions(model)} width={240}
          onChange={defaultType => change({ ...model, defaultType })}/>
      </FieldRow>
      <FieldRow>
        <SelectField label={'Position'} value={model.position} options={POSITIONS} width={140} onChange={position => change({ ...model, position })}/>
        <SelectField label={'Window'} value={model.background} options={BACKGROUNDS} width={140} onChange={background => change({ ...model, background })}/>
      </FieldRow>
    </EditorStack>
  );
};

export { ShowChoicesEditor };
