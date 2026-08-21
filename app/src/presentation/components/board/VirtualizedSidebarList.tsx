import React, {
  ChangeEvent,
  forwardRef,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { FixedSizeList, ListChildComponentProps } from "react-window";
import {
  Box,
  IconButton,
  InputAdornment,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  TextField,
} from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import {
  ChevronLeft,
  ChevronRight,
  Close,
  DoubleArrow,
  KeyboardArrowRight,
} from "@mui/icons-material";
import { IconSetSprite } from "@presentation/components/icons/IconSetSprite.tsx";

/**
 * Standard sidebar list-column shell: grows with {@link EditorBoardSplitLayout}, constrains height for react-window.
 */
export const VIRTUALIZED_SIDEBAR_LIST_REGION_SX: SxProps<Theme> = {
  flex: 1,
  minHeight: 0,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  width: "100%",
  boxSizing: "border-box",
};

//region VirtualizedSidebarList

/**
 * One virtualized sidebar row: empty slot or selectable entry with optional icon sprite.
 */
type VirtualizedSidebarRow =
  | {
      type: "spacer";
    }
  | {
      type: "item";
      label: string;
      /**
       * When set, shows {@link IconSetSprite}; when omitted, a blank 20px cell keeps column alignment.
       */
      iconIndex?: number;
      title?: string;
      labelSx?: SxProps<Theme>;
      listItemButtonSx?: SxProps<Theme>;
    };

type VirtualizedSidebarListProps = {
  /**
   * Number of rows (including spacers) passed to react-window.
   */
  itemCount: number;
  /**
   * Fixed row height in pixels.
   */
  itemSize: number;
  /**
   * Scroll viewport height in pixels.
   */
  listHeight: number;
  /**
   * Minimum label width in monospace {@code ch} (parent column should use {@link virtualizedSidebarColumnWidth}).
   */
  labelMinCh: number;
  selectedIndex: number;
  /**
   * Resolves each index to a spacer or item row.
   */
  getRow: (index: number) => VirtualizedSidebarRow;
  onSelectIndex: (index: number) => void;
  onListKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  listWrapperRef: React.RefObject<HTMLDivElement | null>;
  /**
   * When true, applies {@link VIRTUALIZED_SIDEBAR_LIST_REGION_SX} on the root so the list column
   * stretches under {@link EditorBoardSplitLayout}; {@link listHeight} is only used until measured.
   */
  fillContainer?: boolean;
  /**
   * Optional context menu on the list column (e.g. SDP / crafting recipe list).
   */
  onContextMenu?: React.MouseEventHandler<HTMLDivElement>;
  /**
   * When true, renders a search bar above the list with prev/next navigation.
   * Search matches against each item row's {@link VirtualizedSidebarRow.label}.
   */
  searchable?: boolean;
  /**
   * Label shown inside the search field. Defaults to {@code "Search"}.
   */
  searchLabel?: string;
};

const VirtualizedSidebarList = forwardRef<FixedSizeList, VirtualizedSidebarListProps>(
  (props, ref) =>
  {
    const {
      itemCount,
      itemSize,
      listHeight,
      labelMinCh,
      selectedIndex,
      getRow,
      onSelectIndex,
      onListKeyDown,
      listWrapperRef,
      fillContainer = false,
      onContextMenu,
      searchable = false,
      searchLabel = 'Search',
    } = props;

    const listColumnRef = useRef<HTMLDivElement>(null);
    const listAreaRef = useRef<HTMLDivElement>(null);
    const internalListRef = useRef<FixedSizeList>(null);

    const [ listViewportWidthPx, setListViewportWidthPx ] = useState(320);
    const [ listViewportHeightPx, setListViewportHeightPx ] = useState(listHeight);
    const [ searchTerm, setSearchTerm ] = useState('');

    useLayoutEffect(() =>
    {
      const outerEl = listColumnRef.current;
      if (!outerEl)
      {
        return;
      }

      const measure = () =>
      {
        const w = Math.floor(outerEl.clientWidth);
        if (w > 0)
        {
          setListViewportWidthPx(w);
        }

        if (fillContainer)
        {
          // When searchable, measure the inner list area so the search bar height is excluded.
          const heightEl = listAreaRef.current ?? outerEl;
          const h = Math.floor(heightEl.clientHeight);
          if (h > 0)
          {
            setListViewportHeightPx(h);
          }
        }
      };

      measure();
      const ro = new ResizeObserver(measure);
      ro.observe(outerEl);
      if (listAreaRef.current && listAreaRef.current !== outerEl)
      {
        ro.observe(listAreaRef.current);
      }
      return () =>
      {
        ro.disconnect();
      };
    }, [ fillContainer ]);

    const resolvedListHeight = fillContainer
      ? Math.max(1, listViewportHeightPx > 0
        ? listViewportHeightPx
        : listHeight)
      : listHeight;

    // Searches forward (direction=1) or backward (direction=-1) from startIndex.
    const findMatchIndex = useCallback((
      startIndex: number,
      term: string,
      direction: 1 | -1
    ): number =>
    {
      const query = term.trim().toLowerCase();
      if (query === '' || itemCount === 0)
      {
        return -1;
      }
      for (let step = 1; step <= itemCount; step++)
      {
        const idx = (startIndex + direction * step + itemCount) % itemCount;
        const row = getRow(idx);
        if (row.type === 'item' && row.label.toLowerCase().includes(query))
        {
          return idx;
        }
      }
      return -1;
    }, [ itemCount, getRow ]);

    const jumpTo = useCallback((idx: number) =>
    {
      internalListRef.current?.scrollToItem(idx, 'auto');
      onSelectIndex(idx);
    }, [ onSelectIndex ]);

    const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) =>
    {
      const term = e.target.value;
      setSearchTerm(term);
      if (term.trim() === '')
      {
        return;
      }
      const idx = findMatchIndex(-1, term, 1);
      if (idx !== -1)
      {
        jumpTo(idx);
      }
    };

    const handleSearchPrev = () =>
    {
      const idx = findMatchIndex(selectedIndex, searchTerm, -1);
      if (idx !== -1)
      {
        jumpTo(idx);
      }
    };

    const handleSearchNext = () =>
    {
      const idx = findMatchIndex(selectedIndex, searchTerm, 1);
      if (idx !== -1)
      {
        jumpTo(idx);
      }
    };

    const renderRow = (rowProps: ListChildComponentProps) =>
    {
      const {
        index,
        style,
      } = rowProps;
      const row = getRow(index);

      if (row.type === "spacer")
      {
        return (
          <div
            key={index}
            style={style}
          />
        );
      }

      const titleAttr = row.title !== undefined
        ? row.title
        : row.label;

      return (
        <ListItem
          dense
          disableGutters
          key={index}
          sx={{
            alignItems: "stretch",
            py: 0,
          }}
          style={{
            ...style,
            paddingTop: 0,
            paddingBottom: 0,
          }}
        >
          <ListItemButton
            dense
            title={titleAttr}
            sx={
              [
                {
                  width: "100%",
                  height: "100%",
                  boxSizing: "border-box",
                  paddingLeft: "0px",
                  paddingTop: 0,
                  paddingBottom: 0,
                  minWidth: 0,
                  minHeight: 0,
                  alignItems: "center",
                  overflowX: "hidden",
                  overflowY: "hidden",
                },
                ...(row.listItemButtonSx !== undefined
                  ? [ row.listItemButtonSx ]
                  : []),
              ] as SxProps<Theme>
            }
            selected={selectedIndex === index}
            onMouseDown={(e) =>
            {
              e.preventDefault();
            }}
            tabIndex={-1}
            onClick={() =>
            {
              onSelectIndex(index);
            }}
          >
            <ListItemIcon sx={{
              minWidth: "22px",
              py: 0,
            }}>
              {(selectedIndex === index)
                ? <DoubleArrow
                  color={"success"}
                  fontSize={"small"}
                />
                : <KeyboardArrowRight
                  color={"warning"}
                  fontSize={"small"}
                />}
            </ListItemIcon>
            <ListItemIcon
              sx={{
                minWidth: "24px",
                marginRight: "4px",
                py: 0,
              }}
            >
              {(row.iconIndex !== undefined)
                ? (
                  <IconSetSprite
                    iconIndex={row.iconIndex}
                    sizePx={20}
                  />
                )
                : (
                  <Box
                    sx={{
                      width: 20,
                      height: 20,
                      flexShrink: 0,
                      boxSizing: "border-box",
                    }}
                  />
                )}
            </ListItemIcon>
            <ListItemText
              primary={row.label}
              sx={{
                flex: "1 1 auto",
                minWidth: `${labelMinCh}ch`,
                overflow: "hidden",
              }}
              primaryTypographyProps={{
                noWrap: true,
                sx: [
                  {
                    fontSize: 16,
                    fontFamily: "monospace",
                    lineHeight: 1.2,
                    textOverflow: "ellipsis",
                    overflow: "hidden",
                  },
                  ...(row.labelSx !== undefined
                    ? [ row.labelSx ]
                    : []),
                ] as SxProps<Theme>,
              }}
            />
          </ListItemButton>
        </ListItem>
      );
    };

    return (
      <Box
        ref={listColumnRef}
        sx={{
          width: "100%",
          overflow: "hidden",
          ...(fillContainer
            ? VIRTUALIZED_SIDEBAR_LIST_REGION_SX
            : {}),
        }}
      >
        {searchable && (
          <Stack
            direction={'row'}
            spacing={0.5}
            alignItems={'center'}
            sx={{ px: 0.5, pt: 0.5, pb: 0.5, flexShrink: 0 }}
          >
            <IconButton
              size={'small'}
              onClick={handleSearchPrev}
              disabled={searchTerm.trim() === ''}
              tabIndex={-1}
              title={'Previous match'}
            >
              <ChevronLeft fontSize={'small'}/>
            </IconButton>
            <TextField
              size={'small'}
              label={searchLabel}
              value={searchTerm}
              onChange={handleSearchChange}
              fullWidth
              slotProps={{
                input: {
                  endAdornment: searchTerm.length > 0
                    ? (
                      <InputAdornment position={'end'}>
                        <IconButton
                          size={'small'}
                          edge={'end'}
                          onClick={() => setSearchTerm('')}
                          tabIndex={-1}
                        >
                          <Close fontSize={'small'}/>
                        </IconButton>
                      </InputAdornment>
                    )
                    : null,
                },
              }}
            />
            <IconButton
              size={'small'}
              onClick={handleSearchNext}
              disabled={searchTerm.trim() === ''}
              tabIndex={-1}
              title={'Next match'}
            >
              <ChevronRight fontSize={'small'}/>
            </IconButton>
          </Stack>
        )}

        <Box
          ref={listAreaRef}
          onContextMenu={onContextMenu}
          sx={{
            overflow: 'hidden',
            width: '100%',
            ...(fillContainer
              ? { flex: 1, minHeight: 0 }
              : {}),
            ...(onContextMenu !== undefined
              ? { cursor: 'context-menu' }
              : {}),
          }}
        >
          <div
            ref={listWrapperRef}
            tabIndex={0}
            role={"listbox"}
            onKeyDown={onListKeyDown}
            style={{
              outline: "none",
              width: "100%",
              minWidth: 0,
              overflow: "hidden",
            }}
          >
            {/* @ts-ignore react-window width */}
            <FixedSizeList
              ref={(instance) =>
              {
                internalListRef.current = instance;
                if (typeof ref === 'function')
                {
                  ref(instance);
                }
                else if (ref !== null && ref !== undefined)
                {
                  (ref as React.MutableRefObject<FixedSizeList | null>).current = instance;
                }
              }}
              height={resolvedListHeight}
              width={listViewportWidthPx}
              itemSize={itemSize}
              overscanCount={5}
              itemCount={itemCount}
            >
              {renderRow}
            </FixedSizeList>
          </div>
        </Box>
      </Box>
    );
  },
);

VirtualizedSidebarList.displayName = "VirtualizedSidebarList";

type VirtualizedSidebarListRegionProps = {
  children: React.ReactNode;
  onContextMenu?: React.MouseEventHandler<HTMLDivElement>;
};

/**
 * Flex shell for a sidebar slot that is not only {@link VirtualizedSidebarList} (e.g. list or placeholder button).
 * Uses the same layout rules as {@link VirtualizedSidebarList} with {@code fillContainer}.
 *
 * @param props.children Region content.
 * @param props.onContextMenu Optional context menu handler for the whole slot.
 * @returns MUI {@link Box} wrapper.
 */
const VirtualizedSidebarListRegion = (props: VirtualizedSidebarListRegionProps) =>
{
  const {
    children,
    onContextMenu,
  } = props;

  return (
    <Box
      onContextMenu={onContextMenu}
      sx={{
        ...VIRTUALIZED_SIDEBAR_LIST_REGION_SX,
        ...(onContextMenu !== undefined
          ? { cursor: "context-menu" }
          : {}),
      }}
    >
      {children}
    </Box>
  );
};

VirtualizedSidebarListRegion.displayName = "VirtualizedSidebarListRegion";

/**
 * CSS width for the sidebar column: {@code iconRowPx} + {@code labelMinCh} in {@code ch}.
 *
 * @param iconRowPx Left chrome in pixels.
 * @param labelMinCh Label track in {@code ch}.
 * @returns {@code calc(...)} string for MUI {@code sx.width}.
 */
function virtualizedSidebarColumnWidth(iconRowPx: number, labelMinCh: number): string
{
  return `calc(${iconRowPx}px + ${labelMinCh}ch)`;
}

const VIRTUALIZED_SIDEBAR_DEFAULT_ICON_ROW_PX = 102;

const VIRTUALIZED_SIDEBAR_DEFAULT_LABEL_MIN_CH = 30;

const VIRTUALIZED_SIDEBAR_DEFAULT_ITEM_SIZE = 32;

const VIRTUALIZED_SIDEBAR_DEFAULT_LIST_HEIGHT = 960;

export {
  VirtualizedSidebarList,
  VirtualizedSidebarListRegion,
  virtualizedSidebarColumnWidth,
  VIRTUALIZED_SIDEBAR_DEFAULT_ICON_ROW_PX,
  VIRTUALIZED_SIDEBAR_DEFAULT_LABEL_MIN_CH,
  VIRTUALIZED_SIDEBAR_DEFAULT_ITEM_SIZE,
  VIRTUALIZED_SIDEBAR_DEFAULT_LIST_HEIGHT,
};
export type {
  VirtualizedSidebarListProps,
  VirtualizedSidebarListRegionProps,
  VirtualizedSidebarRow,
};

//endregion VirtualizedSidebarList
