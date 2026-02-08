import RPG_System = Rmmz.System.RPG_System;
import { loadSystem } from './DataService.ts';

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
  }
}

export { SystemService };
