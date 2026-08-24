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
  // 0-7 are the base parameters, which the long id addresses directly: mhp, mmp, atk, def, mat, mdf, agi, luk.
  if (paramId >= 0 && paramId <= 7)
  {
    return fromBParamIdToName(paramId);
  }

  // 8-17 are the ex-parameters, offset by where the base parameters end: hit, eva, cri, cev, mev, mrf,
  // cnt, hrg, mrg, trg. Several carry J-ABS meanings rather than their engine ones -- eva is the parry
  // boost, cnt is autocounter, and mev goes unused.
  if (paramId >= 8 && paramId <= 17)
  {
    return fromXParamIdToName(paramId - 8);
  }

  // 18-27 are the sp-parameters, offset by where the ex-parameters end: trg, grd, rec, pha, mcr, tcr,
  // pdr, mdr, fdr, exr. Here trg is aggro, grd is parry, and mcr and tcr are the mp and tp cost rates.
  if (paramId >= 18 && paramId <= 27)
  {
    return fromSParamIdToName(paramId - 18);
  }

  // the last three have no engine-side collection to delegate to, so they are named here.
  switch (paramId)
  {
    case 28:
      return 'Crit Amp'; // cdm
    case 29:
      return 'Crit Block'; // ctr
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

/**
 * The 8 base params plus MTP ("Max Tech"), each tagged with the `GrowthCurve` suffix instead of the
 * default `BuffPlus` — dedicated to the Classes board's per-level growth-curve formulas (persisted via
 * `<paramGrowthCurve:[formula]>` note tags), kept separate from {@link knownBaseParams} so this doesn't
 * collide with the Enemies board's unrelated `BuffPlus` usage of the same 8 base params.
 *
 * MTP has no `params[paramId]` array in Classes.json (it's a J-Base/J-NaturalGrowth note-tag-only
 * concept), so its `longParamId` reuses the existing "long param" slot (30) rather than a `params[]`
 * index — callers must not assume `param.id` indexes into `RPG_ClassDomainModel.params` for this entry.
 */
const knownGrowthCurveParams = (): KnownParameter[] =>
{
  const [ mhp, mmp, ...restBaseParams ] = knownBaseParams().map((param) => ({ ...param, regex: 'GrowthCurve' }));

  return [
    mhp,
    mmp,
    {
      id: 8,
      name: maxTpName(),
      key: 'mtp',
      longParamId: 30,
      regex: 'GrowthCurve'
    },
    ...restBaseParams,
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
      key: 'ctr',
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
  knownGrowthCurveParams,
  knownExParams,
  knownSpParams,
  knownRewardParams,
  knownLongParams,
  knownParamByLongId,
  KnownParameter
};
