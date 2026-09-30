// @ts-nocheck
/*
 * Vendored from @pixi/tilemap 5.0.2 (https://github.com/pixijs/tilemap), from the TypeScript source its published
 * source maps carry. MIT licensed, Copyright (c) 2015 Ivan Popelyshev: see LICENSE beside this file. Type checking
 * is off because the library predates strict null checks.
 *
 * Unchanged from 5.0.2.
 */
import { SCALE_MODE } from 'pixi.js';

/**
 * These are additional @pixi/tilemap options.
 *
 * This settings should not be changed after the renderer has initialized; otherwise, the behavior
 * is undefined.
 */
export const settings = {
    /** The default number of textures per tilemap in a tilemap composite. */
    TEXTURES_PER_TILEMAP: 16,

    /** The scaling mode of the combined texture tiling. */
    TEXTILE_SCALE_MODE: 'linear' as SCALE_MODE,

    /** This will enable 32-bit index buffers. It's useful when you have more than 16K tiles. */
    use32bitIndex: false,
};

// @deprecated
export const Constant = settings;
