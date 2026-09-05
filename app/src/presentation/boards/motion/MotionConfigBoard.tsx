import { type SyntheticEvent, useState } from "react";
import { Box, Tab, Tabs } from "@mui/material";
import { useMotionConfig } from "@presentation/context/resources/motion.context.tsx";
import { useBoardActions } from "@presentation/context/board-actions.context.tsx";
import MotionTypesTab from "@boards/motion/MotionTypesTab.tsx";
import MotionDeathTab from "@boards/motion/MotionDeathTab.tsx";
import MotionLootTab from "@boards/motion/MotionLootTab.tsx";

type MotionConfigTab = "types" | "death" | "loot";

/**
 * Single editor board for everything J-Motion owns. The board wraps one horizontal sub-tab per
 * concern:
 *
 *   - **Types** — the default parameters every motion type falls back to when a `<motion:[...]>`
 *     notetag omits one.
 *   - **Death** — how long each death style holds a corpse open for, and which style is the default.
 *   - **Loot** — when an expiring loot drop starts blinking, when it starts dissolving, and how the
 *     blink looks.
 *
 * Every block lives in the same `config.motion.json`, so save and reload are owned here rather than
 * by individual tabs: one write persists the whole config root regardless of which tab was touched.
 */
const MotionConfigBoard = () =>
{
  const {
    motionConfig,
    save,
    reload,
    loading,
  } = useMotionConfig();

  const [ activeTab, setActiveTab ] = useState<MotionConfigTab>("types");
  const [ isSaving, setIsSaving ] = useState(false);

  const handleTabChange = (_event: SyntheticEvent, value: MotionConfigTab) =>
  {
    setActiveTab(value);
  };

  const handleSave = async () =>
  {
    if (motionConfig === null)
    {
      return;
    }

    setIsSaving(true);
    try
    {
      await save(motionConfig);
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

  const canSave = loading === false && motionConfig !== null;
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
        <Tabs value={activeTab} onChange={handleTabChange} aria-label={"Motion config sections"}>
          <Tab label={"Types"} value={"types"}/>
          <Tab label={"Death"} value={"death"}/>
          <Tab label={"Loot"} value={"loot"}/>
        </Tabs>
      </Box>

      <Box sx={{ flexGrow: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "auto" }}>
        {activeTab === "types" && <MotionTypesTab/>}
        {activeTab === "death" && <MotionDeathTab/>}
        {activeTab === "loot" && <MotionLootTab/>}
      </Box>
    </Box>
  );
};

export default MotionConfigBoard;
