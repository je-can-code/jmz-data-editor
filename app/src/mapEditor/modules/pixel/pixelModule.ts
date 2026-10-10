import type { PluginModule } from '../../core/modules/PluginModule.ts';
import { readEventArea } from './areaTags.ts';

/**
 * J-Pixelistics' file name, as js/plugins.js lists it.
 */
const PIXEL_PLUGIN = 'J-Pixelistics';

/**
 * The id J-Pixelistics' module reads areas under.
 */
const AREA_READER_ID = 'pixel.area';

/**
 * What the editor knows of J-Pixelistics, while it is enabled: the area a page gives its event, a rectangle the event
 * counts as standing on while the page is active, so stepping onto any tile of it reaches the event. Most of the game's
 * map-edge exits are one wide area. Every map view draws each event's area from the page it shows, joined to its marker,
 * a transfer's as an exit strip; a click anywhere inside one picks its event; and an event's quick panel says when its
 * area runs past the map's edge, where the player can never go.
 */
const pixelModule: PluginModule = {
  id: 'pixel',
  title: 'J-Pixelistics',
  plugins: [ PIXEL_PLUGIN ],
  register: contributions =>
  {
    contributions.eventArea({ id: AREA_READER_ID, read: readEventArea });
  },
};

export { AREA_READER_ID, PIXEL_PLUGIN, pixelModule };
