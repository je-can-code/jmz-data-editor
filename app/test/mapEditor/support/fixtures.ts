import { createMapEvent } from '../../../src/mapEditor/core/model/eventModel.ts';
import type { RmmzMap, RmmzMapEvent } from '../../../src/mapEditor/core/model/rmmzTypes.ts';

/**
 * Builds a small map file with the shapes that trip a careless model: a 3x2 map whose cells all differ, an empty
 * slot 0, two events with a hole between them, and a trailing empty slot.
 * @returns {RmmzMap} A fresh map file.
 */
const buildMapJson = (): RmmzMap =>
{
  // every cell different, so a write to the wrong index shows.
  const data = Array.from({ length: 3 * 2 * 6 }, (_, index) => index + 1);

  const first: RmmzMapEvent = { ...createMapEvent(1, 0, 0), name: 'Door' };
  const third: RmmzMapEvent = { ...createMapEvent(3, 2, 1), name: 'Chest' };

  return {
    autoplayBgm: false,
    autoplayBgs: false,
    battleback1Name: '',
    battleback2Name: '',
    bgm: { name: 'Town', pan: 0, pitch: 100, volume: 90 },
    bgs: { name: '', pan: 0, pitch: 100, volume: 90 },
    disableDashing: false,
    displayName: 'Test Town',
    encounterList: [],
    encounterStep: 30,
    height: 2,
    note: '',
    parallaxLoopX: false,
    parallaxLoopY: false,
    parallaxName: '',
    parallaxShow: true,
    parallaxSx: 0,
    parallaxSy: 0,
    scrollType: 0,
    specifyBattleback: false,
    tilesetId: 4,
    width: 3,
    data,
    events: [ null, first, null, third, null ],
  };
};

export { buildMapJson };
