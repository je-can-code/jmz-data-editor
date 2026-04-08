/**
 * Minimal shape of {@code Map###.json} for editor pickers (not full {@link Rmmz.Data.RPG_Map}).
 */
type RmmzMapEventJson = {
  id?: number;
  name?: string;
};

type RmmzMapJson = {
  events?: (RmmzMapEventJson | null)[];
};

export type { RmmzMapJson, RmmzMapEventJson };
