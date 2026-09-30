/**
 * How many pictures each atlas row holds.
 */
const ATLAS_COLUMNS = 16;

/**
 * The picture index of a passability mark: the blocked directions as passage bits (1 down, 2 left, 4 right, 8 up),
 * in the second row when a module's rule is among the reasons.
 * @param {number} blocked The directions the engine blocks.
 * @param {number} denied The directions a rule denies.
 * @returns {number} The picture, or -1 when nothing is stopped.
 */
const passageMarkIndex = (blocked: number, denied: number): number =>
{
  const stopped = blocked | denied;
  if (stopped === 0)
  {
    return -1;
  }

  return denied === 0
    ? stopped
    : stopped + ATLAS_COLUMNS;
};

/**
 * Picks a region's colour, spreading neighbouring ids around the wheel so adjacent regions never look alike.
 * @param {number} region The region id.
 * @returns {number} The hue, 0 to 360.
 */
const regionHue = (region: number): number =>
{
  return (region * 137.508) % 360;
};

/**
 * Makes a canvas in the renderer's own document.
 * @param {Document} document The document.
 * @param {number} width The width.
 * @param {number} height The height.
 * @returns {{ canvas: HTMLCanvasElement, context: CanvasRenderingContext2D }} The canvas and its 2D context.
 */
const makeCanvas = (document: Document, width: number, height: number) =>
{
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context === null)
  {
    throw new Error('the overlays need a 2D canvas to draw their marks on');
  }

  return { canvas, context };
};

/**
 * Draws the region atlas: every region id from 1 to 255 as a tile of its own colour carrying its number.
 * @param {Document} document The document to make the canvas in.
 * @param {number} tileSize The tile size.
 * @returns {HTMLCanvasElement} The atlas, sixteen pictures a row; picture n is region n.
 */
const drawRegionAtlas = (document: Document, tileSize: number): HTMLCanvasElement =>
{
  const { canvas, context } = makeCanvas(document, ATLAS_COLUMNS * tileSize, ATLAS_COLUMNS * tileSize);
  context.font = `bold ${Math.round(tileSize * 0.4)}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineJoin = 'round';
  for (let region = 1; region < 256; region++)
  {
    const x = (region % ATLAS_COLUMNS) * tileSize;
    const y = Math.floor(region / ATLAS_COLUMNS) * tileSize;
    const hue = regionHue(region);
    context.fillStyle = `hsla(${hue}, 85%, 50%, 0.45)`;
    context.fillRect(x, y, tileSize, tileSize);
    context.strokeStyle = `hsla(${hue}, 85%, 25%, 0.9)`;
    context.lineWidth = 1;
    context.strokeRect(x + 0.5, y + 0.5, tileSize - 1, tileSize - 1);
    context.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    context.lineWidth = 3;
    context.strokeText(String(region), x + tileSize / 2, y + tileSize / 2);
    context.fillStyle = '#ffffff';
    context.fillText(String(region), x + tileSize / 2, y + tileSize / 2);
  }

  return canvas;
};

/**
 * Draws the passability atlas: a bar along each blocked edge, or a cross when every way out is blocked. The first
 * row is red, for the engine's own passability; the second is amber, for a module's rule.
 * @param {Document} document The document to make the canvas in.
 * @param {number} tileSize The tile size.
 * @returns {HTMLCanvasElement} The atlas; see {@link passageMarkIndex} for where each mark sits.
 */
const drawPassageAtlas = (document: Document, tileSize: number): HTMLCanvasElement =>
{
  const { canvas, context } = makeCanvas(document, ATLAS_COLUMNS * tileSize, 2 * tileSize);
  const bar = Math.max(2, Math.round(tileSize / 8));
  [ 'rgba(229, 57, 53, 0.9)', 'rgba(255, 179, 0, 0.95)' ].forEach((colour, row) =>
  {
    for (let mask = 1; mask < 16; mask++)
    {
      const x = mask * tileSize;
      const y = row * tileSize;
      context.fillStyle = colour;
      context.strokeStyle = colour;
      if (mask === 15)
      {
        // nothing gets out: a cross, over a faint wash so it reads at a distance.
        context.globalAlpha = 0.2;
        context.fillRect(x, y, tileSize, tileSize);
        context.globalAlpha = 1;
        context.lineWidth = bar;
        context.beginPath();
        context.moveTo(x + bar, y + bar);
        context.lineTo(x + tileSize - bar, y + tileSize - bar);
        context.moveTo(x + tileSize - bar, y + bar);
        context.lineTo(x + bar, y + tileSize - bar);
        context.stroke();
        continue;
      }

      // one bar per blocked way out: down, left, right, up.
      if ((mask & 1) !== 0)
      {
        context.fillRect(x, y + tileSize - bar, tileSize, bar);
      }

      if ((mask & 2) !== 0)
      {
        context.fillRect(x, y, bar, tileSize);
      }

      if ((mask & 4) !== 0)
      {
        context.fillRect(x + tileSize - bar, y, bar, tileSize);
      }

      if ((mask & 8) !== 0)
      {
        context.fillRect(x, y, tileSize, bar);
      }
    }
  });

  return canvas;
};

export { ATLAS_COLUMNS, drawPassageAtlas, drawRegionAtlas, passageMarkIndex, regionHue };
