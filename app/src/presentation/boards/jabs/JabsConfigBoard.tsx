import { type SyntheticEvent, useState } from "react";
import { Box, Tab, Tabs } from "@mui/material";
import { useBoardActions } from "@presentation/context/board-actions.context.tsx";
import { useJabs } from "@presentation/context/resources/jabs.context.tsx";
import { useBossConfig } from "@presentation/context/resources/boss.context.tsx";
import JabsTeamsTab from "@boards/jabs/JabsTeamsTab.tsx";
import JabsJuiceTab from "@boards/jabs/JabsJuiceTab.tsx";
import JabsBossesTab from "@boards/jabs/boss/JabsBossesTab.tsx";

type JabsConfigTab = "teams" | "juice" | "bosses";

/**
 * Single editor board for everything JABS owns. The board wraps three horizontal sub-tabs:
 *
 *   - **Teams** — the original per-team editor (id / key / name / opposes).
 *   - **Juice** — profiles table + target / caster / casting tuning accordions.
 *   - **Bosses** — boss encounters, which live in their own `config.boss.json`.
 *
 * Save and reload affordances are owned here (not on individual tabs) so everything the board is
 * holding is persisted in one shot regardless of which tab the user touched. That now spans two files:
 * saving only the active tab's file would let an author edit Teams, switch to Bosses, hit save, and
 * silently lose the Teams work.
 */
const JabsConfigBoard = () =>
{
  const {
    jabsConfig,
    save,
    reload,
    loading,
  } = useJabs();

  const {
    bossConfig,
    save: saveBossConfig,
    reload: reloadBossConfig,
    loading: bossLoading,
  } = useBossConfig();

  const [ activeTab, setActiveTab ] = useState<JabsConfigTab>("teams");
  const [ isSaving, setIsSaving ] = useState(false);

  const handleTabChange = (_event: SyntheticEvent, value: JabsConfigTab) =>
  {
    setActiveTab(value);
  };

  const handleSave = async () =>
  {
    setIsSaving(true);
    try
    {
      if (jabsConfig !== null)
      {
        await save(jabsConfig);
      }

      if (bossConfig !== null)
      {
        await saveBossConfig(bossConfig);
      }
    }
    finally
    {
      setIsSaving(false);
    }
  };

  const handleReload = async () =>
  {
    await reload();
    await reloadBossConfig();
  };

  const canSave = loading === false && bossLoading === false && jabsConfig !== null;
  const canReload = loading === false && bossLoading === false;

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
        </Tabs>
      </Box>

      <Box sx={{ flexGrow: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {activeTab === "teams" && <JabsTeamsTab/>}
        {activeTab === "juice" && <JabsJuiceTab/>}
        {activeTab === "bosses" && <JabsBossesTab/>}
      </Box>
    </Box>
  );
};

export default JabsConfigBoard;