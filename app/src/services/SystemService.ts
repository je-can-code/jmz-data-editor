import RPG_System = Rmmz.System.RPG_System;
import RPG_Animation = Rmmz.Implementations.RPG_Animation;
import RPG_CommonEvent = Rmmz.Implementations.RPG_CommonEvent;
import { buildSkillAnimationAutocompleteOptions } from '@core/enums/RmmzSkillAnimation.ts';
import type { RmmzSkillAnimationOption } from '@core/enums/RmmzSkillAnimation.ts';
import {
  loadAnimations,
  loadCommonEvents,
  loadSystem,
} from './DataService.ts';

type CommonEventAutocompleteRow = {
  id: number;
  label: string;
};

/**
 * @param raw {@code CommonEvents.json} array ({@code null} at index 0).
 * @returns Rows for pickers ({@code id} + display label).
 */
function buildCommonEventAutocompleteRows(
  raw: (RPG_CommonEvent | null)[]
): CommonEventAutocompleteRow[]
{
  const out: CommonEventAutocompleteRow[] = [];
  for (let i = 1; i < raw.length; i++)
  {
    const row = raw[i];
    if (row === null)
    {
      continue;
    }
    if (typeof row.id !== "number")
    {
      continue;
    }
    const name = typeof row.name === "string" && row.name.length > 0
      ? row.name
      : `Event ${row.id}`;
    out.push({
      id: row.id,
      label: `${row.id}: ${name}`,
    });
  }
  return out;
}

/**
 * A static service used for accessing various system data.
 */
class SystemService
{
  static systemData: RPG_System;

  static elements: string[];
  static skillTypes: string[];
  static weaponTypes: string[];
  static armorTypes: string[];
  static equipTypes: string[];

  /**
   * Skill {@code animationId} picker rows (built-ins, then {@code Animations.json}).
   */
  static skillAnimationAutocompleteOptions: RmmzSkillAnimationOption[] = [];

  /**
   * Common event rows for usable-effect pickers ({@code CommonEvents.json}).
   */
  static commonEventAutocompleteRows: CommonEventAutocompleteRow[] = [];

  /**
   * Loads various system data into memory for use around the app.
   * @param {string} projectPath The path the data folder of the project.
   */
  static async loadSystemData(projectPath: string)
  {
    this.systemData = await loadSystem(projectPath);
    this.elements = this.systemData.elements;
    this.skillTypes = this.systemData.skillTypes;
    this.weaponTypes = this.systemData.weaponTypes;
    this.armorTypes = this.systemData.armorTypes;
    this.equipTypes = this.systemData.equipTypes;

    let rawAnims: (RPG_Animation | null)[] = [ null ];
    try
    {
      rawAnims = await loadAnimations(projectPath);
    }
    catch
    {
    }
    this.skillAnimationAutocompleteOptions = buildSkillAnimationAutocompleteOptions(rawAnims);

    let rawCommon: (RPG_CommonEvent | null)[] = [ null ];
    try
    {
      rawCommon = await loadCommonEvents(projectPath);
    }
    catch
    {
    }
    this.commonEventAutocompleteRows = buildCommonEventAutocompleteRows(rawCommon);
  }
}

export { SystemService };
