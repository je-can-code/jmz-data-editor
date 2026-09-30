// Prevent SCALE_MODES from becoming lazy import in Constant.ts - which causes a import() in the declaration file,
// which causes API extractor to fail https://github.com/microsoft/rushstack/issues/2140
// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
// @ts-nocheck
/*
 * Vendored from @pixi/tilemap 5.0.2 (https://github.com/pixijs/tilemap), from the TypeScript source its published
 * source maps carry. MIT licensed, Copyright (c) 2015 Ivan Popelyshev: see LICENSE beside this file. Type checking
 * is off because the library predates strict null checks.
 *
 * The copy is vendored rather than installed so its two defects are fixed in place instead of patched at runtime:
 * Tilemap.ts and TilemapPipe.ts each list what changed. Everything else is unchanged from 5.0.2. Importing this
 * module registers the tilemap pipe with pixi, which must happen before a renderer is created.
 */
import { extensions } from 'pixi.js';
import { GlTilemapAdaptor } from './gl_tilemap';
import { GpuTilemapAdaptor } from './gpu_tilemap';
import { TilemapPipe } from './TilemapPipe';

export * from './CompositeTilemap';
export * from './settings';
export * from './Tilemap';
export * from './TilemapGeometry';
export * from './TilemapPipe';

extensions.add(TilemapPipe);
extensions.add(GlTilemapAdaptor);
extensions.add(GpuTilemapAdaptor);
