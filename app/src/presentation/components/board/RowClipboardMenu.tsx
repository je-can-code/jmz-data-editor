import { ListItemIcon, ListItemText, Menu, MenuItem, Typography } from '@mui/material';
import { Backspace, ContentCopy, ContentPaste } from '@mui/icons-material';

/**
 * Where a right click opened the menu, in viewport pixels.
 */
type RowClipboardMenuPosition = {
  top: number;
  left: number;
};

type RowClipboardMenuProps = {
  /**
   * Where the menu is open, or null while it is closed.
   */
  position: RowClipboardMenuPosition | null;

  /**
   * Copies the selected rows.
   */
  onCopy: () => void;

  /**
   * Pastes copied rows onto the selected rows.
   */
  onPaste: () => void;

  /**
   * Resets the selected rows to the table's blank row, keeping each row's own id.
   */
  onClear: () => void;

  /**
   * Closes the menu without doing anything.
   */
  onClose: () => void;
};

/**
 * The right-click menu on a database board's list: copy the selected rows, paste copied rows over them, or
 * clear them to the table's blank row, each showing the shortcut that does the same thing from the keyboard.
 * @param {RowClipboardMenuProps} props Where the menu is open, and what each item does.
 * @returns {JSX.Element} The menu, rendered closed while it has no position.
 */
const RowClipboardMenu = (props: RowClipboardMenuProps) =>
{
  const {
    position,
    onCopy,
    onPaste,
    onClear,
    onClose,
  } = props;

  return (
    <Menu
      open={position !== null}
      onClose={onClose}
      anchorReference={'anchorPosition'}
      anchorPosition={position ?? undefined}
    >
      <MenuItem dense onClick={onCopy}>
        <ListItemIcon>
          <ContentCopy fontSize={'small'}/>
        </ListItemIcon>
        <ListItemText>Copy</ListItemText>
        <Typography variant={'body2'} color={'text.secondary'} sx={{ ml: 3 }}>
          Ctrl+C
        </Typography>
      </MenuItem>
      <MenuItem dense onClick={onPaste}>
        <ListItemIcon>
          <ContentPaste fontSize={'small'}/>
        </ListItemIcon>
        <ListItemText>Paste</ListItemText>
        <Typography variant={'body2'} color={'text.secondary'} sx={{ ml: 3 }}>
          Ctrl+V
        </Typography>
      </MenuItem>
      <MenuItem dense onClick={onClear}>
        <ListItemIcon>
          <Backspace fontSize={'small'}/>
        </ListItemIcon>
        <ListItemText>Clear</ListItemText>
        <Typography variant={'body2'} color={'text.secondary'} sx={{ ml: 3 }}>
          Del
        </Typography>
      </MenuItem>
    </Menu>
  );
};

export { RowClipboardMenu };
export type { RowClipboardMenuPosition, RowClipboardMenuProps };
