import type { WorldStretch } from '../../../src/mapEditor/core/renderer/lightingLayer.ts';

/**
 * A view showing the whole of any map under test, and more: nothing a lighting drawing draws is ever out of view in it.
 */
const WHOLE_VIEW: WorldStretch = { x: 0, y: 0, width: 100_000, height: 100_000 };

export { WHOLE_VIEW };
