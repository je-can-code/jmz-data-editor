import type { FrameReport, RendererStats } from './PixiMapRenderer.ts';

/**
 * The parts of a renderer an open's timing reads: the frames it draws, and how many pictures are still loading.
 */
type DrawnSource = {
  onFrame(listener: (report: FrameReport) => void): () => void;
  stats(): Pick<RendererStats, 'loadingImages'>;
};

/**
 * Waits for the first frame that shows an opened map complete, and calls back once with when it drew. The frame that
 * rebuilds the tiles comes first, while character sheets and the parallax are still loading; the open ends at the
 * first frame from then on drawn with no picture left to load, so what is timed is the map as the author sees it.
 * @param {DrawnSource} renderer The renderer the map opens in.
 * @param {(at: number) => void} onDrawn Called once, with the clock's reading at that frame.
 * @param {() => number} now The clock; the page's own by default.
 * @returns {() => void} Stops waiting.
 */
const whenMapDrawn = (renderer: DrawnSource, onDrawn: (at: number) => void, now: () => number = () => performance.now()): (() => void) =>
{
  let rebuilt = false;
  const stop = renderer.onFrame(report =>
  {
    // a frame before the tiles rebuilt shows the map that was there before, or nothing.
    rebuilt = rebuilt || report.rebuiltChunks > 0;
    if (rebuilt === false || renderer.stats().loadingImages > 0)
    {
      return;
    }

    stop();
    onDrawn(now());
  });
  return stop;
};

export { whenMapDrawn };
export type { DrawnSource };
