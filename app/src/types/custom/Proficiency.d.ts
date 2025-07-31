declare namespace Proficiency
{
  interface Configuration
  {
    conditionals: Conditional[];
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