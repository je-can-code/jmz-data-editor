import React, {
  forwardRef,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { FixedSizeList, ListChildComponentProps } from "react-window";
import { Box } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";

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
import {
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import { DoubleArrow, KeyboardArrowRight } from "@mui/icons-material";
import { IconSetSprite } from "@presentation/components/icons/IconSetSprite.tsx";

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
};

const VirtualizedSidebarList = forwardRef<FixedSizeList, VirtualizedSidebarListProps>(
  function VirtualizedSidebarList(props, ref)
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
    } = props;

    const listColumnRef = useRef<HTMLDivElement>(null);
    const [ listViewportWidthPx, setListViewportWidthPx ] = useState(320);
    const [ listViewportHeightPx, setListViewportHeightPx ] = useState(listHeight);

    useLayoutEffect(() =>
    {
      const el = listColumnRef.current;
      if (!el)
      {
        return;
      }

      const measure = () =>
      {
        const w = Math.floor(el.clientWidth);
        if (w > 0)
        {
          setListViewportWidthPx(w);
        }

        if (fillContainer)
        {
          const h = Math.floor(el.clientHeight);
          if (h > 0)
          {
            setListViewportHeightPx(h);
          }
        }
      };

      measure();
      const ro = new ResizeObserver(measure);
      ro.observe(el);
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
        onContextMenu={onContextMenu}
        sx={{
          width: "100%",
          overflow: "hidden",
          ...(fillContainer
            ? VIRTUALIZED_SIDEBAR_LIST_REGION_SX
            : {}),
          ...(onContextMenu !== undefined
            ? { cursor: "context-menu" }
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
            ref={ref}
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
