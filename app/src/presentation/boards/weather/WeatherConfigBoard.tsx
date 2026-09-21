import { type SyntheticEvent, useState } from 'react';
import { Box, Tab, Tabs } from '@mui/material';
import { useWeatherConfig } from '@presentation/context/resources/weather.context.tsx';
import { useBoardActions } from '@presentation/context/board-actions.context.tsx';
import WeatherSkyTab from '@boards/weather/WeatherSkyTab.tsx';
import WeatherLooksTab from '@boards/weather/WeatherLooksTab.tsx';
import WeatherVoicesTab from '@boards/weather/WeatherVoicesTab.tsx';
import WeatherPlacesTab from '@boards/weather/WeatherPlacesTab.tsx';

type WeatherConfigTab = 'sky' | 'looks' | 'voices' | 'places';

/**
 * Editor board for the weather. The board wraps one horizontal sub-tab per concern:
 *
 *   - **Sky** — what each season permits, how it moves between conditions, what each month leans
 *     toward, and how far ahead the forecast is rolled.
 *   - **Looks** — the picture and the description each kind of weather carries in the forecast.
 *   - **Voices** — what somebody travelling with you says about the weather.
 *   - **Places** — how a place answers the sky instead of following it, and which destinations
 *     the developer forecast reports on.
 *
 * **The particle tuning is deliberately absent.** The motions and the layer stacks inside each
 * look hold a couple of hundred numbers that were tuned by eye against a running game, which is a
 * better tool for them than a form is. They are carried through a save untouched rather than
 * rebuilt, so editing anything here cannot disturb them.
 *
 * Every block lives in the same `config.weather.json`, so save and reload are owned here rather
 * than by individual tabs: one write persists the whole config regardless of which tab was
 * touched.
 */
const WeatherConfigBoard = () =>
{
  const {
    weatherConfig,
    save,
    reload,
    loading,
  } = useWeatherConfig();

  const [ activeTab, setActiveTab ] = useState<WeatherConfigTab>('sky');
  const [ isSaving, setIsSaving ] = useState(false);

  const handleTabChange = (_event: SyntheticEvent, value: WeatherConfigTab) =>
  {
    setActiveTab(value);
  };

  const handleSave = async () =>
  {
    if (weatherConfig === null)
    {
      return;
    }

    setIsSaving(true);
    try
    {
      await save(weatherConfig);
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

  const canSave = loading === false && weatherConfig !== null;
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
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <Box sx={{
        borderBottom: 1,
        borderColor: 'divider',
      }}>
        <Tabs value={activeTab} onChange={handleTabChange} aria-label={'Weather config sections'}>
          <Tab label={'Sky'} value={'sky'}/>
          <Tab label={'Looks'} value={'looks'}/>
          <Tab label={'Voices'} value={'voices'}/>
          <Tab label={'Places'} value={'places'}/>
        </Tabs>
      </Box>

      <Box sx={{
        flexGrow: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
      }}>
        {activeTab === 'sky' && <WeatherSkyTab/>}
        {activeTab === 'looks' && <WeatherLooksTab/>}
        {activeTab === 'voices' && <WeatherVoicesTab/>}
        {activeTab === 'places' && <WeatherPlacesTab/>}
      </Box>
    </Box>
  );
};

export default WeatherConfigBoard;
