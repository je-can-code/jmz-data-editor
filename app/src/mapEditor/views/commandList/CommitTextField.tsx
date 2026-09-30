import React, { useEffect, useState } from 'react';
import { TextField, type TextFieldProps } from '@mui/material';

/**
 * What a committing text field takes: a text field's own props, the value it shows, and where a finished value goes.
 */
type CommitTextFieldProps = Omit<TextFieldProps, 'value' | 'onChange' | 'onBlur' | 'onKeyDown'> & {
  /**
   * The value the command holds now.
   */
  readonly value: string;

  /**
   * Takes a finished value: on leaving the field, on Enter in a single line, on Ctrl+Enter in several.
   */
  readonly onCommit: (value: string) => void;
};

/**
 * A text field that edits freely and hands its value over only once the author is done with it, so a burst of
 * typing lands in history as one step rather than one per key. Escape puts back what the command holds.
 * @param {CommitTextFieldProps} props The field's props.
 * @returns {React.JSX.Element} The field.
 */
const CommitTextField = (props: CommitTextFieldProps) =>
{
  const { value, onCommit, multiline, ...rest } = props;
  const [ draft, setDraft ] = useState(value);
  const [ editing, setEditing ] = useState(false);

  // while nobody is typing, the field follows the command, undo and other windows included.
  useEffect(() =>
  {
    if (editing === false)
    {
      setDraft(value);
    }
  }, [ value, editing ]);

  /**
   * Hands the typed value over, when it differs from the command's.
   */
  const commit = () =>
  {
    setEditing(false);
    if (draft !== value)
    {
      onCommit(draft);
    }
  };

  /**
   * Finishes on Enter (Ctrl+Enter in several lines), and puts the command's value back on Escape.
   * @param {React.KeyboardEvent} event The key.
   */
  const onKeyDown = (event: React.KeyboardEvent) =>
  {
    if (event.key === 'Enter' && (multiline !== true || event.ctrlKey || event.metaKey))
    {
      event.preventDefault();
      commit();
      return;
    }

    if (event.key === 'Escape')
    {
      event.stopPropagation();
      setDraft(value);
      setEditing(false);
    }
  };

  return (
    <TextField
      {...rest}
      multiline={multiline}
      value={draft}
      onChange={event =>
      {
        setEditing(true);
        setDraft(event.target.value);
      }}
      onBlur={commit}
      onKeyDown={onKeyDown}
    />
  );
};

export { CommitTextField };
export type { CommitTextFieldProps };
