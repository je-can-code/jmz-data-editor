interface JabsBattlerData
{
  sight: number;
  pursuit: number;
  prepareSpeed: number;
  alertDuration: number;
  alertSightBoost: number;
  alertPursuitBoost: number;
}

class EnemyJabsBattlerModel
  implements JabsBattlerData
{
  constructor(
    public sight: number = 0,
    public pursuit: number = 0,
    public prepareSpeed: number = 0,
    public alertDuration: number = 0,
    public alertSightBoost: number = 0,
    public alertPursuitBoost: number = 0
  )
  {
  }
}

export {
  JabsBattlerData,
  EnemyJabsBattlerModel
}
