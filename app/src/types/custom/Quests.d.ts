// IMPORTANT: No top-level import/export to keep this ambient
declare namespace Questopedia
{
  interface Configuration
  {
    quests: OmniQuest[];
    tags: OmniTag[];
    categories: OmniCategory[];
  }

  //region quests
  interface OmniQuest
  {
    name: string;
    key: string;
    categoryKey: string;
    tagKeys: string[];
    unknownHint: string;
    overview: string;
    recommendedLevel: number;
    objectives: OmniObjective[];
  }

  interface OmniObjective
  {
    id: number;
    // Inline import type – this does NOT make the file a module
    type: import('../../enums/OmniObjectiveType.ts').OmniObjectiveType;
    description: string;
    logs: OmniObjectiveLogs;
    fulfillment: OmniFulfillmentData;
    hiddenByDefault: boolean;
    isOptional: boolean;
  }

  interface OmniObjectiveLogs
  {
    inactive: string;
    active: string;
    completed: string;
    failed: string;
    missed: string;
  }

  interface OmniFulfillmentData
  {
    indiscriminate: IndiscriminateData;
    destination: DestinationData;
    fetch: FetchData;
    slay: SlayData;
    quest: QuestData;
  }

  //region fulfillment data
  interface IndiscriminateData
  {
    hint: string;
  }

  interface DestinationData
  {
    mapId: number;
    x1: number;
    x2: number;
    y1: number;
    y2: number;
  }

  interface FetchData
  {
    type: number;
    id: number;
    amount: number;
  }

  interface SlayData
  {
    id: number;
    amount: number;
  }

  interface QuestData
  {
    keys: string[];
  }

  //endregion fulfillment data
  //endregion quests

  //region tags
  interface OmniTag
  {
    key: string;
    name: string;
    iconIndex: number;
  }

  //endregion tags

  //region categories
  interface OmniCategory
  {
    key: string;
    name: string;
    iconIndex: number;
  }

  //endregion categories
}