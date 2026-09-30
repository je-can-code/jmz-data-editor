import React, { createContext, useContext } from 'react';
import type { MapEditorServices } from './MapEditorServices.ts';

/**
 * Carries the window's services to every component below it.
 */
const MapEditorServicesContext = createContext<MapEditorServices | null>(null);

/**
 * Provides the window's services.
 * @param {{ services: MapEditorServices, children: React.ReactNode }} props The services and the tree below them.
 * @returns {React.JSX.Element} The provider.
 */
const MapEditorServicesProvider = (props: { services: MapEditorServices; children: React.ReactNode }) =>
{
  const { services, children } = props;
  return (
    <MapEditorServicesContext.Provider value={services}>
      {children}
    </MapEditorServicesContext.Provider>
  );
};

/**
 * Reads the window's services.
 * @returns {MapEditorServices} The services.
 */
const useMapEditorServices = (): MapEditorServices =>
{
  const services = useContext(MapEditorServicesContext);
  if (services === null)
  {
    throw new Error('the map editor\'s services are missing; render inside MapEditorServicesProvider');
  }

  return services;
};

export { MapEditorServicesProvider, useMapEditorServices };
