import { type SyntheticEvent, useState } from "react";
import { Box, Tab, Tabs } from "@mui/material";
import { useBoardActions } from "@presentation/context/board-actions.context.tsx";
import { useJabs } from "@presentation/context/resources/jabs.context.tsx";
import JabsTeamsTab from "@boards/jabs/JabsTeamsTab.tsx";
import JabsJuiceTab from "@boards/jabs/JabsJuiceTab.tsx";
import JabsFoodTypesTab from "@presentation/boards/jabs/JabsFoodTypesTab.tsx";
import JabsBossesTab from "@boards/jabs/boss/JabsBossesTab.tsx";
import JabsMetricsTab from "@boards/jabs/JabsMetricsTab.tsx";

type JabsConfigTab = "teams" | "juice" | "bosses" | "foodTypes" | "metrics";

/**
 * Single editor board for everything JABS owns. The board wraps one horizontal sub-tab per plugin in
 * the family:
 *
 *   - **Teams** — the original per-team editor (id / key / name / opposes).
 *   - **Juice** — profiles table + target / caster / casting tuning accordions.
 *   - **Bosses** — boss encounters, one per fight, with their participants and routines.
 *   - **Food Groups** — the vocabulary a consumable's chain states are tagged with.
 *   - **Metrics** — which game variable holds which combat statistic.
 *
 * Every block lives in the same `config.jabs.json`, so save and reload are owned here rather than by
 * individual tabs: one write persists the whole config root regardless of which tab the user touched.
 */
const JabsConfigBoard = () =>
{
  const {
    jabsConfig,
    save,
    reload,
    loading,
  } = useJabs();

  const [ activeTab, setActiveTab ] = useState<JabsConfigTab>("teams");
  const [ isSaving, setIsSaving ] = useState(false);

  const handleTabChange = (_event: SyntheticEvent, value: JabsConfigTab) =>
  {
    setActiveTab(value);
  };

  const handleSave = async () =>
  {
    if (jabsConfig === null)
    {
      return;
    }

    setIsSaving(true);
    try
    {
      await save(jabsConfig);
    }
    finally
    {
      setIsSaving(false);
    }
  };

  const handleReload = async () =>
  {
    await reload();
  };

  const canSave = loading === false && jabsConfig !== null;
  const canReload = loading === false;

  useBoardActions({
    onSave: handleSave,
    canSave,
    isSaving,
    onReload: handleReload,
    canReload,
  });

  return (
    <Box sx={{
      flex: 1,
      minHeight: 0,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>
      <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Tabs value={activeTab} onChange={handleTabChange} aria-label={"JABS config sections"}>
          <Tab label={"Teams"} value={"teams"}/>
          <Tab label={"Juice"} value={"juice"}/>
          <Tab label={"Bosses"} value={"bosses"}/>
          <Tab label={"Food Groups"} value={"foodTypes"}/>
          <Tab label={"Metrics"} value={"metrics"}/>
        </Tabs>
      </Box>

      <Box sx={{ flexGrow: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {activeTab === "teams" && <JabsTeamsTab/>}
        {activeTab === "juice" && <JabsJuiceTab/>}
        {activeTab === "bosses" && <JabsBossesTab/>}
        {activeTab === "foodTypes" && <JabsFoodTypesTab/>}
        {activeTab === "metrics" && <JabsMetricsTab/>}
      </Box>
    </Box>
  );
};

export default JabsConfigBoard;