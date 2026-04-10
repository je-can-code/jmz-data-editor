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
      return 'Max Life';
    case 1:
      return 'Max Magi';
    case 2:
      return 'Power';
    case 3:
      return 'Endurance';
    case 4:
      return 'Force';
    case 5:
      return 'Resist';
    case 6:
      return 'Speed';
    case 7:
      return 'Luck';
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
      return 'Aggro';
    case 1:
      return 'Parry';
    case 2:
      return 'Healing Rate';
    case 3:
      return 'Item Effects';
    case 4:
      return 'Magi Cost';
    case 5:
      return 'Tech Cost';
    case 6:
      return 'Phys Dmg Rate';
    case 7:
      return 'Magi Dmg Rate';
    case 8:
      return 'Environ Dmg Rate';
    case 9:
      return 'Experience UP';
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
      return 'Accuracy';
    case 1:
      return 'Parry Extend';
    case 2:
      return 'Crit Rate';
    case 3:
      return 'Crit Dodge';
    case 4:
      return 'Magic Evade';
    case 5:
      return 'Magic Reflect';
    case 6:
      return 'Autocounter';
    case 7:
      return 'HP Regen';
    case 8:
      return 'MP Regen';
    case 9:
      return 'TP Regen';
    default:
      throw new Error(`Unsupported xParamId: ${xParamId}`);
  }
};

/**
 * The name of the otherwise unnamed "Max TP" parameter.
 */
const maxTpName = () =>
{
  return 'Max Tech';
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
      return 'Crit Amp'; // cdm
    case 29:
      return 'Crit Block'; // cdr
    case 30:
      return maxTpName(); // max tp
    default:
      console.warn(`paramId:${paramId} didn't map to any of the default parameters.`);
      return '';
  }
};

const knownBaseParams = (): KnownParameter[] =>
{
  return [
    {
      id: 0,
      name: fromBParamIdToName(0),
      key: 'mhp',
      longParamId: 0
    },
    {
      id: 1,
      name: fromBParamIdToName(1),
      key: 'mmp',
      longParamId: 1
    },
    {
      id: 2,
      name: fromBParamIdToName(2),
      key: 'atk',
      longParamId: 2
    },
    {
      id: 3,
      name: fromBParamIdToName(3),
      key: 'def',
      longParamId: 3
    },
    {
      id: 4,
      name: fromBParamIdToName(4),
      key: 'mat',
      longParamId: 4
    },
    {
      id: 5,
      name: fromBParamIdToName(5),
      key: 'mdf',
      longParamId: 5
    },
    {
      id: 6,
      name: fromBParamIdToName(6),
      key: 'agi',
      longParamId: 6
    },
    {
      id: 7,
      name: fromBParamIdToName(7),
      key: 'luk',
      longParamId: 7
    },
  ];
};

const knownExParams = (): KnownParameter[] =>
{
  return [
    {
      id: 0,
      name: fromXParamIdToName(0),
      key: 'hit',
      longParamId: 8
    },
    {
      id: 1,
      name: fromXParamIdToName(1),
      key: 'eva',
      longParamId: 9
    },
    {
      id: 2,
      name: fromXParamIdToName(2),
      key: 'cri',
      longParamId: 10
    },
    {
      id: 3,
      name: fromXParamIdToName(3),
      key: 'cev',
      longParamId: 11
    },
    {
      id: 4,
      name: fromXParamIdToName(4),
      key: 'mev',
      longParamId: 12
    },
    {
      id: 5,
      name: fromXParamIdToName(5),
      key: 'mrf',
      longParamId: 13
    },
    {
      id: 6,
      name: fromXParamIdToName(6),
      key: 'cnt',
      longParamId: 14
    },
    {
      id: 7,
      name: fromXParamIdToName(7),
      key: 'hrg',
      longParamId: 15
    },
    {
      id: 8,
      name: fromXParamIdToName(8),
      key: 'mrg',
      longParamId: 16
    },
    {
      id: 9,
      name: fromXParamIdToName(9),
      key: 'trg',
      longParamId: 17
    },
  ];
};

const knownSpParams = (): KnownParameter[] =>
{
  return [
    {
      id: 0,
      name: fromSParamIdToName(0),
      key: 'tgr',
      longParamId: 18
    },
    {
      id: 1,
      name: fromSParamIdToName(1),
      key: 'grd',
      longParamId: 19
    },
    {
      id: 2,
      name: fromSParamIdToName(2),
      key: 'rec',
      longParamId: 20
    },
    {
      id: 3,
      name: fromSParamIdToName(3),
      key: 'pha',
      longParamId: 21
    },
    {
      id: 4,
      name: fromSParamIdToName(4),
      key: 'mcr',
      longParamId: 22
    },
    {
      id: 5,
      name: fromSParamIdToName(5),
      key: 'tcr',
      longParamId: 23
    },
    {
      id: 6,
      name: fromSParamIdToName(6),
      key: 'pdr',
      longParamId: 24
    },
    {
      id: 7,
      name: fromSParamIdToName(7),
      key: 'mdr',
      longParamId: 25
    },
    {
      id: 8,
      name: fromSParamIdToName(8),
      key: 'fdr',
      longParamId: 26
    },
    {
      id: 9,
      name: fromSParamIdToName(9),
      key: 'exr',
      longParamId: 27
    },
  ];
};

const knownRewardParams = (): KnownParameter[] =>
{
  return [
    {
      id: 0,
      name: 'Experience',
      key: 'exp',
      longParamId: 31,
      regex: 'Plus'
    },
    {
      id: 1,
      name: 'Gold',
      key: 'gold',
      longParamId: 32,
      regex: 'Plus'
    },
    {
      id: 2,
      name: 'SDPs',
      key: 'sdp',
      longParamId: 33,
      regex: 'Plus'
    },
  ];
};

const knownLongParams = (): KnownParameter[] =>
{
  return [
    {
      id: 0,
      name: fromBParamIdToName(0),
      key: 'mhp',
      longParamId: 0
    },
    {
      id: 1,
      name: fromBParamIdToName(1),
      key: 'mmp',
      longParamId: 1
    },
    {
      id: 2,
      name: fromBParamIdToName(2),
      key: 'atk',
      longParamId: 2
    },
    {
      id: 3,
      name: fromBParamIdToName(3),
      key: 'def',
      longParamId: 3
    },
    {
      id: 4,
      name: fromBParamIdToName(4),
      key: 'mat',
      longParamId: 4
    },
    {
      id: 5,
      name: fromBParamIdToName(5),
      key: 'mdf',
      longParamId: 5
    },
    {
      id: 6,
      name: fromBParamIdToName(6),
      key: 'agi',
      longParamId: 6
    },
    {
      id: 7,
      name: fromBParamIdToName(7),
      key: 'luk',
      longParamId: 7
    },
    {
      id: 0,
      name: fromXParamIdToName(0),
      key: 'hit',
      longParamId: 8
    },
    {
      id: 1,
      name: fromXParamIdToName(1),
      key: 'eva',
      longParamId: 9
    },
    {
      id: 2,
      name: fromXParamIdToName(2),
      key: 'cri',
      longParamId: 10
    },
    {
      id: 3,
      name: fromXParamIdToName(3),
      key: 'cev',
      longParamId: 11
    },
    {
      id: 4,
      name: fromXParamIdToName(4),
      key: 'mev',
      longParamId: 12
    },
    {
      id: 5,
      name: fromXParamIdToName(5),
      key: 'mrf',
      longParamId: 13
    },
    {
      id: 6,
      name: fromXParamIdToName(6),
      key: 'cnt',
      longParamId: 14
    },
    {
      id: 7,
      name: fromXParamIdToName(7),
      key: 'hrg',
      longParamId: 15
    },
    {
      id: 8,
      name: fromXParamIdToName(8),
      key: 'mrg',
      longParamId: 16
    },
    {
      id: 9,
      name: fromXParamIdToName(9),
      key: 'trg',
      longParamId: 17
    },
    {
      id: 0,
      name: fromSParamIdToName(0),
      key: 'tgr',
      longParamId: 18
    },
    {
      id: 1,
      name: fromSParamIdToName(1),
      key: 'grd',
      longParamId: 19
    },
    {
      id: 2,
      name: fromSParamIdToName(2),
      key: 'rec',
      longParamId: 20
    },
    {
      id: 3,
      name: fromSParamIdToName(3),
      key: 'pha',
      longParamId: 21
    },
    {
      id: 4,
      name: fromSParamIdToName(4),
      key: 'mcr',
      longParamId: 22
    },
    {
      id: 5,
      name: fromSParamIdToName(5),
      key: 'tcr',
      longParamId: 23
    },
    {
      id: 6,
      name: fromSParamIdToName(6),
      key: 'pdr',
      longParamId: 24
    },
    {
      id: 7,
      name: fromSParamIdToName(7),
      key: 'mdr',
      longParamId: 25
    },
    {
      id: 8,
      name: fromSParamIdToName(8),
      key: 'fdr',
      longParamId: 26
    },
    {
      id: 9,
      name: fromSParamIdToName(9),
      key: 'exr',
      longParamId: 27
    },
    {
      id: 0,
      name: 'Crit Amp',
      key: 'cdm',
      longParamId: 28
    },
    {
      id: 1,
      name: 'Crit Block',
      key: 'cdr',
      longParamId: 29
    },
    {
      id: 0,
      name: maxTpName(),
      key: 'mtp',
      longParamId: 30
    },
    {
      id: 0,
      name: 'Experience',
      key: 'exp',
      longParamId: 31,
      regex: 'Plus'
    },
    {
      id: 1,
      name: 'Gold',
      key: 'gold',
      longParamId: 32,
      regex: 'Plus'
    },
    {
      id: 2,
      name: 'SDPs',
      key: 'sdp',
      longParamId: 33,
      regex: 'Plus'
    },
  ];
};

const knownParamByLongId = (longParamId: number): KnownParameter =>
{
  return knownLongParams()
    .find(knownParam => knownParam.longParamId === longParamId)!;
};

/**
 * The structure of a known parameter and its information.
 */
interface KnownParameter
{
  id: number;
  name: string;
  key: string;
  longParamId: number;
  regex?: string; // Optional regex pattern to use instead of the default "BuffPlus"
  formatValue?: (formula: string) => string; // Optional function to format the value when writing
}

export {
  fromBParamIdToName,
  fromXParamIdToName,
  fromSParamIdToName,
  fromLongParameterIdToName,
  knownBaseParams,
  knownExParams,
  knownSpParams,
  knownRewardParams,
  knownLongParams,
  knownParamByLongId,
  KnownParameter
};
