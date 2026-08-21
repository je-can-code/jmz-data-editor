declare namespace Proficiency
{
  interface Configuration
  {
    conditionals: Conditional[];

    // the three blocks below belong to J-Proficiency-Knowledge rather than to J-Proficiency itself.
    // they are optional to match the omitempty on the Go structs, so a project that has authored none
    // of them keeps its file byte-identical.
    knowledgeTags?: KnowledgeTag[];
    skillTypeMapping?: SkillTypeMapping;
    knowledgeExchanges?: KnowledgeExchange[];
  }

  interface KnowledgeTag
  {
    key: string;
    name: string;
    iconIndex: number;
    description: string;
  }

  // keyed by skill type id, which arrives as a string because JSON object keys always do.
  type SkillTypeMapping = Record<string, string[]>;

  interface KnowledgeExchange
  {
    key: string;
    tagKey: string;
    cost: number;
    output: KnowledgeExchangeOutput;
  }

  interface KnowledgeExchangeOutput
  {
    id: number;
    type: string;
    count: number;
  }

  interface Conditional
  {
    key: string;
    actorIds: number[];
    requirements: Requirement[];
    skillRewards: number[];
    jsRewards: string;
  }

  interface Requirement
  {
    skillId: number;
    proficiency: number;
    secondarySkillIds: number[];
  }
}