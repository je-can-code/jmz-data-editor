import { ExpandMore } from '@mui/icons-material';
import { Accordion, AccordionDetails, AccordionSummary, Box, Stack, Tab, Tabs, Typography, } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import {
  NATURAL_GROWTH_QUADRANT_ORDER,
  NaturalGrowthQuadrant,
} from '@core/domain/valueObjects/NaturalQuadFormulas.ts';
import { type ReactNode, useEffect, useMemo, useState, } from 'react';
import { knownParamByLongId, type KnownParameter, } from '../../../mappers/ParameterIdMapper.ts';
import { NaturalGrowthQuadrantsParser } from '@services/parsers/NaturalGrowthQuadrantsParser.ts';
import { NaturalFormulaWithGraphRow } from './NaturalFormulaWithGraphRow.tsx';

/**
 * Same titles and longParamId groupings as enemy growth UI (`parameterCategories` in
 * `presentation/boards/enemies/ParameterGrowth.tsx`). Keep in sync when changing layout.
 */
const NATURAL_GROWTH_UI_CATEGORIES: { title: string; longIds: number[] }[] = [
  {
    title: 'Rewards',
    longIds: [ 31, 32, 33 ]
  },
  {
    title: 'Core Stats',
    longIds: [ 0, 1, 30, 2, 3, 4, 5, 6, 7 ]
  },
  {
    title: 'Hit/Evasion',
    longIds: [ 8, 9, 12, 13, 14 ]
  },
  {
    title: 'Recovery',
    longIds: [ 15, 16, 17, 20, 21 ]
  },
  {
    title: 'Damage/Defense',
    longIds: [ 18, 19, 22, 23, 24, 25, 26, 27 ]
  },
  {
    title: 'Critical',
    longIds: [ 10, 11, 28, 29 ]
  },
];

type QuadrantPaletteKey = 'info' | 'secondary' | 'success' | 'warning';

const QUADRANT_TAB_METADATA: Record<
  NaturalGrowthQuadrant,
  { label: string; paletteKey: QuadrantPaletteKey }
> = {
  [ NaturalGrowthQuadrant.BuffPlus ]: {
    label: 'Buff+',
    paletteKey: 'info'
  },
  [ NaturalGrowthQuadrant.BuffRate ]: {
    label: 'Buff rate',
    paletteKey: 'secondary'
  },
  [ NaturalGrowthQuadrant.GrowthPlus ]: {
    label: 'Growth+',
    paletteKey: 'success'
  },
  [ NaturalGrowthQuadrant.GrowthRate ]: {
    label: 'Growth rate',
    paletteKey: 'warning'
  },
};

const ALLOWED_QUADRANTS = new Set<NaturalGrowthQuadrant>(NATURAL_GROWTH_QUADRANT_ORDER);

/**
 * Deduplicates and filters to known quadrants; preserves caller order. Empty or invalid → all four in canonical order.
 */
function normalizeVisibleNaturalGrowthQuadrants(
  requested: readonly NaturalGrowthQuadrant[] | undefined
): NaturalGrowthQuadrant[]
{
  if (requested === undefined || requested.length === 0)
  {
    return [ ...NATURAL_GROWTH_QUADRANT_ORDER ];
  }
  const seen = new Set<NaturalGrowthQuadrant>();
  const out: NaturalGrowthQuadrant[] = [];
  for (const q of requested)
  {
    if (ALLOWED_QUADRANTS.has(q) === true && seen.has(q) === false)
    {
      seen.add(q);
      out.push(q);
    }
  }
  if (out.length === 0)
  {
    return [ ...NATURAL_GROWTH_QUADRANT_ORDER ];
  }
  return out;
}

const accordionShellSx = {
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 1,
  '&:before': { display: 'none' },
} as const;

type NaturalGrowthQuadrantsEditorProps = {
  note: string;
  onNoteChange: (note: string) => void;
  /**
   * Which quadrants to show as tabs, in tab order. Omit for all four ({@link NATURAL_GROWTH_QUADRANT_ORDER}).
   */
  visibleQuadrants?: readonly NaturalGrowthQuadrant[];
  /**
   * When true (default), form column is capped at ~50% width on md+ and centered (wide hosts like the states tab).
   * Set false for narrow parents (e.g. dialogs) so the editor uses the full available width.
   */
  constrainFormColumnWidth?: boolean;
  suggestedLevel?: number;
};

type VisibleQuadrantTab = {
  key: NaturalGrowthQuadrant;
  label: string;
  paletteKey: QuadrantPaletteKey;
};

function paramsForLongIds(ids: number[]): KnownParameter[]
{
  return ids.map((id) => knownParamByLongId(id));
}

function NaturalGrowthQuadrantsEditor({
  note,
  onNoteChange,
  visibleQuadrants,
  constrainFormColumnWidth,
  suggestedLevel,
}: NaturalGrowthQuadrantsEditorProps)
{
  const constrainColumn = constrainFormColumnWidth !== false;
  const theme = useTheme();
  const [ tabIndex, setTabIndex ] = useState(0);

  const visibleTabs: VisibleQuadrantTab[] = useMemo(
    () =>
      normalizeVisibleNaturalGrowthQuadrants(visibleQuadrants)
        .map((key) =>
        {
          const meta = QUADRANT_TAB_METADATA[ key ];
          return {
            key,
            label: meta.label,
            paletteKey: meta.paletteKey,
          };
        }),
    [ visibleQuadrants ]
  );

  useEffect(() =>
  {
    setTabIndex((prev) =>
    {
      if (prev >= visibleTabs.length)
      {
        return Math.max(0, visibleTabs.length - 1);
      }
      return prev;
    });
  }, [ visibleTabs.length ]);

  const quadrantMains = useMemo(
    () =>
      visibleTabs.map((t) => theme.palette[ t.paletteKey ].main),
    [
      theme,
      visibleTabs,
    ]
  );

  const activeMain = quadrantMains[ tabIndex ] ?? theme.palette.primary.main;
  const activeTab = visibleTabs[ tabIndex ];
  const quadrant = activeTab.key;
  const quadrantLabel = activeTab.label;

  const quadMap = useMemo(
    () => NaturalGrowthQuadrantsParser.parse(note),
    [ note ]
  );

  const patch = (
    longParamId: number,
    q: NaturalGrowthQuadrant,
    formula: string
  ) =>
  {
    onNoteChange(NaturalGrowthQuadrantsParser.withQuadrant(note, longParamId, q, formula));
  };

  const renderParamRow = (param: KnownParameter) =>
  {
    const quad = quadMap.get(param.longParamId);
    const formula = quad === undefined
      ? ''
      : quad[ quadrant ];
    return (
      <NaturalFormulaWithGraphRow
        key={`${param.longParamId}-${quadrant}`}
        paramName={param.name}
        quadrantLabel={quadrantLabel}
        formula={formula}
        onFormulaChange={(next) => patch(param.longParamId, quadrant, next)}
        suggestedLevel={suggestedLevel}
      />
    );
  };

  const renderGroup = (
    title: string,
    longIds: number[]
  ) =>
  {
    const params = paramsForLongIds(longIds);
    return (
      <Accordion key={title} defaultExpanded disableGutters sx={accordionShellSx}>
        <AccordionSummary expandIcon={<ExpandMore/>}>
          <Typography variant="subtitle1" fontWeight="bold">
            {title}
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            {params.map((p) => renderParamRow(p))}
          </Stack>
        </AccordionDetails>
      </Accordion>
    );
  };

  const showRewards =
    quadrant === NaturalGrowthQuadrant.BuffPlus;

  let tabBar: ReactNode = null;
  if (visibleTabs.length > 1)
  {
    tabBar = (
      <Tabs
        value={tabIndex}
        onChange={(
          _e,
          v
        ) => setTabIndex(v)}
        variant="scrollable"
        scrollButtons="auto"
        textColor="inherit"
        slotProps={{
          indicator: {
            sx: {
              height: 3,
              borderRadius: '3px 3px 0 0',
              bgcolor: activeMain,
            },
          },
        }}
        sx={{
          mb: 2,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: alpha(activeMain, 0.06),
          borderRadius: '8px 8px 0 0',
          px: 0.5,
          transition: theme.transitions.create(
            [ 'background-color' ],
            { duration: theme.transitions.duration.shortest }
          ),
          '& .MuiTabScrollButton-root': {
            color: alpha(activeMain, 0.85),
          },
        }}
      >
        {visibleTabs.map((
          t,
          i
        ) =>
        {
          const c = quadrantMains[ i ];
          return (
            <Tab
              key={t.key}
              label={t.label}
              value={i}
              sx={{
                minHeight: 44,
                py: 1,
                color: alpha(c, 0.5),
                transition: theme.transitions.create(
                  [ 'color', 'background-color' ],
                  { duration: theme.transitions.duration.shortest }
                ),
                '&:hover': {
                  color: alpha(c, 0.85),
                  bgcolor: alpha(c, 0.08),
                },
                '&.Mui-selected': {
                  color: alpha(c, 0.95),
                  fontWeight: 600,
                },
              }}
            />
          );
        })}
      </Tabs>
    );
  }
  else if (visibleTabs.length === 1)
  {
    tabBar = (
      <Typography
        variant="subtitle2"
        sx={{
          mb: 1.5,
          color: alpha(activeMain, 0.95),
          fontWeight: 600,
        }}
      >
        {visibleTabs[ 0 ].label}
      </Typography>
    );
  }

  return (
    <Box>
      {tabBar}

      <Box
        sx={{
          borderRadius: 1,
          border: 1,
          borderColor: alpha(activeMain, 0.22),
          borderTopLeftRadius: visibleTabs.length > 1
            ? 0
            : 1,
          borderTopRightRadius: visibleTabs.length > 1
            ? 0
            : 1,
          bgcolor: alpha(activeMain, 0.05),
          px: 1.5,
          py: 1.5,
          transition: theme.transitions.create(
            [ 'border-color', 'background-color' ],
            { duration: theme.transitions.duration.shortest }
          ),
        }}
      >
        <Box
          sx={{
            width: '100%',
            minWidth: 0,
            ...(constrainColumn
              ? {
                maxWidth: {
                  xs: '100%',
                  md: '50%',
                },
                mx: 'auto',
              }
              : {
                mx: 0,
              }),
          }}
        >
          <Stack spacing={1}>
            {NATURAL_GROWTH_UI_CATEGORIES.map((cat) =>
            {
              if (cat.title === 'Rewards' && showRewards === false)
              {
                return null;
              }
              return renderGroup(cat.title, cat.longIds);
            })}
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}

export type { NaturalGrowthQuadrantsEditorProps };
export { NaturalGrowthQuadrantsEditor };
