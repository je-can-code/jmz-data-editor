import React, { type SyntheticEvent, useState } from "react";
import { Box, Tab, Tabs } from "@mui/material";
import SaveButton from "@components/core/SaveButton.tsx";
import ReloadButton from "@components/core/ReloadButton.tsx";
import { useJabs } from "@presentation/context/resources/jabs.context.tsx";
import JabsTeamsTab from "@boards/jabs/JabsTeamsTab.tsx";
import JabsJuiceTab from "@boards/jabs/JabsJuiceTab.tsx";

type JabsConfigTab = "teams" | "juice";

/**
 * Single editor board for everything in `config.jabs.json`. The board wraps two horizontal sub-tabs:
 *
 *   - **Teams** — the original per-team editor (id / key / name / opposes).
 *   - **Juice** — profiles table + target / caster / casting tuning accordions.
 *
 * Save and reload affordances are owned here (not on individual tabs) so the whole config root is
 * persisted in one shot regardless of which tab the user touched. The sidebar entry's title is still
 * "JABS"; the route id moved from {@code jabs-teams} to {@code jabs-config} to reflect the widened
 * scope.
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

  // matches the EnemiesBoard / SkillsBoard layout: the main content lives in a flex-column Box, and
  // the SaveButton / ReloadButton are emitted as siblings (NOT children) so their absolute positioning
  // bubbles up to the app shell's positioned ancestor — landing them on the app bar with every other
  // board's buttons. wrapping them inside a `position: relative` container (the previous mistake)
  // captured them locally and made them collide with the tabs strip.
  return <>
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
        </Tabs>
      </Box>

      <Box sx={{ flexGrow: 1, minHeight: 0 }}>
        {activeTab === "teams"
          ? <JabsTeamsTab/>
          : <JabsJuiceTab/>}
      </Box>
    </Box>

    {/* not-grid-related elements — float onto the app bar via the absolute positioning baked into each button. */}
    <Box sx={{
      display: "flex",
      gap: 2,
    }}>
      <SaveButton
        handleSave={handleSave}
        canSave={canSave}
        isSaving={isSaving}
        extraSaveText={"JABS"}
      />
      <ReloadButton
        handleReload={handleReload}
        canReload={canReload}
        extraReloadText={"JABS"}
      />
    </Box>
  </>;
};

export default JabsConfigBoard;