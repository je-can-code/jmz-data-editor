/**
 * Gets the name of the given b-parameter.
 * @param {number} paramId The id of the b-param to get a name for.
 * @returns {string} The name of the parameter.
 */
const fromBParamIdToName = (paramId: number): string =>
{
  switch (paramId)
  {
    case 0:
      return "Max Life";
    case 1:
      return "Max Magi";
    case 2:
      return "Power";
    case 3:
      return "Endurance";
    case 4:
      return "Force";
    case 5:
      return "Resist";
    case 6:
      return "Speed";
    case 7:
      return "Luck";
    default:
      throw new Error(`Unsupported ParamId: ${paramId}`);
  }
};

/**
 * Gets the name of the given sp-parameter.
 * @param {number} sParamId The id of the sp-param to get a name for.
 * @returns {string} The name of the parameter.
 */
const fromSParamIdToName = (sParamId: number): string =>
{
  switch (sParamId)
  {
    case 0:
      return "Aggro";
    case 1:
      return "Parry";
    case 2:
      return "Healing Rate";
    case 3:
      return "Item Effects";
    case 4:
      return "Magi Cost";
    case 5:
      return "Tech Cost";
    case 6:
      return "Phys Dmg Rate";
    case 7:
      return "Magi Dmg Rate";
    case 8:
      return "Environ Dmg Rate";
    case 9:
      return "Experience UP";
    default:
      throw new Error(`Unsupported sParamId: ${sParamId}`);
  }
};

/**
 * Gets the name of the given ex-parameter.
 * @param {number} xParamId The id of the ex-param to get a name for.
 * @returns {string} The name of the parameter.
 */
const fromXParamIdToName = (xParamId: number): string =>
{
  switch (xParamId)
  {
    case 0:
      return "Accuracy";
    case 1:
      return "Parry Extend";
    case 2:
      return "Crit Rate";
    case 3:
      return "Crit Dodge";
    case 4:
      return "Magic Evade";
    case 5:
      return "Magic Reflect";
    case 6:
      return "Autocounter";
    case 7:
      return "HP Regen";
    case 8:
      return "MP Regen";
    case 9:
      return "TP Regen";
    default:
      throw new Error(`Unsupported xParamId: ${xParamId}`);
  }
};

/**
 * The name of the otherwise unnamed "Max TP" parameter.
 */
const maxTpName = () =>
{
  return "Max Tech";
};

/**
 * Gets the `parameter name` based on the "long" parameter id.
 *
 * "Long" parameter ids are used in the context of 0-27, rather than
 * 0-7 for param, 0-9 for xparam, and 0-9 for sparam.
 * @param {number} paramId The "long" parameter id.
 * @returns {string} The `name`.
 */
const fromLongParameterIdToName = (paramId: number): string =>
{
  switch (paramId)
  {
    case  0:
      return fromBParamIdToName(paramId); // mhp
    case  1:
      return fromBParamIdToName(paramId); // mmp
    case  2:
      return fromBParamIdToName(paramId); // atk
    case  3:
      return fromBParamIdToName(paramId); // def
    case  4:
      return fromBParamIdToName(paramId); // mat
    case  5:
      return fromBParamIdToName(paramId); // mdf
    case  6:
      return fromBParamIdToName(paramId); // agi
    case  7:
      return fromBParamIdToName(paramId); // luk
    case  8:
      return fromXParamIdToName(paramId - 8); // hit
    case  9:
      return fromXParamIdToName(paramId - 8); // eva (parry boost)
    case 10:
      return fromXParamIdToName(paramId - 8); // cri
    case 11:
      return fromXParamIdToName(paramId - 8); // cev
    case 12:
      return fromXParamIdToName(paramId - 8); // mev (unused)
    case 13:
      return fromXParamIdToName(paramId - 8); // mrf
    case 14:
      return fromXParamIdToName(paramId - 8); // cnt (autocounter)
    case 15:
      return fromXParamIdToName(paramId - 8); // hrg
    case 16:
      return fromXParamIdToName(paramId - 8); // mrg
    case 17:
      return fromXParamIdToName(paramId - 8); // trg
    case 18:
      return fromSParamIdToName(paramId - 18); // trg (aggro)
    case 19:
      return fromSParamIdToName(paramId - 18); // grd (parry)
    case 20:
      return fromSParamIdToName(paramId - 18); // rec
    case 21:
      return fromSParamIdToName(paramId - 18); // pha
    case 22:
      return fromSParamIdToName(paramId - 18); // mcr (mp cost)
    case 23:
      return fromSParamIdToName(paramId - 18); // tcr (tp cost)
    case 24:
      return fromSParamIdToName(paramId - 18); // pdr
    case 25:
      return fromSParamIdToName(paramId - 18); // mdr
    case 26:
      return fromSParamIdToName(paramId - 18); // fdr
    case 27:
      return fromSParamIdToName(paramId - 18); // exr
    case 28:
      return "Crit Amp";
    case 29:
      return "Crit Block";
    case 30:
      return maxTpName(); // max tp
    default:
      console.warn(`paramId:${paramId} didn't map to any of the default parameters.`);
      return "";
  }
};

export { fromBParamIdToName, fromXParamIdToName, fromSParamIdToName, fromLongParameterIdToName };