type JabsTeamDefinition = {
  id: number;
  key?: string;
  name?: string;
  opposes?: number[];
};

type JabsConfigRoot = {
  teams: JabsTeamDefinition[];
  [key: string]: any;
};

export type {
  JabsTeamDefinition,
  JabsConfigRoot,
};
