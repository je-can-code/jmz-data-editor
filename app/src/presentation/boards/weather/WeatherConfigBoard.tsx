import { type SyntheticEvent, useState } from 'react';
import { Box, Tab, Tabs } from '@mui/material';
import { useWeatherConfig } from '@presentation/context/resources/weather.context.tsx';
import { useBoardActions } from '@presentation/context/board-actions.context.tsx';
import WeatherMotionsTab from '@boards/weather/WeatherMotionsTab.tsx';
import WeatherSkyTab from '@boards/weather/WeatherSkyTab.tsx';
import WeatherLooksTab from '@boards/weather/WeatherLooksTab.tsx';
import WeatherVoicesTab from '@boards/weather/WeatherVoicesTab.tsx';
import WeatherPlacesTab from '@boards/weather/WeatherPlacesTab.tsx';
import WeatherWiringTab from '@boards/weather/WeatherWiringTab.tsx';

type WeatherConfigTab = 'sky' | 'looks' | 'motions' | 'voices' | 'places' | 'wiring';

/**
 * Editor board for the weather. The board wraps one horizontal sub-tab per concern:
 *
 *   - **Sky** — what each season can be, how each condition is drawn at what time of year and
 *     day, how the sky moves between them, what each month leans toward, and how far ahead the
 *     forecast is rolled.
 *   - **Looks** — the picture, the description, the layers and the sound of each kind of weather.
 *   - **Motions** — the physics those layers are carried by.
 *   - **Voices** — what somebody travelling with you says about the weather.
 *   - **Places** — how a place answers the sky instead of following it, and which destinations
 *     the developer forecast reports on.
 *   - **Wiring** — the variables events read the weather from, and the numbers they see.
 *
 * **Everything the file holds is reachable from here**, down to the individual particle knobs.
 * Something that turns out to have too much floating about after actually playing with it is a
 * thing to fix on a screen, not by opening the JSON.
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
          <Tab label={'Motions'} value={'motions'}/>
          <Tab label={'Voices'} value={'voices'}/>
          <Tab label={'Places'} value={'places'}/>
          <Tab label={'Wiring'} value={'wiring'}/>
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
        {activeTab === 'motions' && <WeatherMotionsTab/>}
        {activeTab === 'voices' && <WeatherVoicesTab/>}
        {activeTab === 'places' && <WeatherPlacesTab/>}
        {activeTab === 'wiring' && <WeatherWiringTab/>}
      </Box>
    </Box>
  );
};

export default WeatherConfigBoard;
