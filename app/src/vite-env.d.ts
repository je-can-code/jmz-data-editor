/// <reference types="vite/client" />

interface ImportMetaEnv
{
  /**
   * Optional override for the Go HTTP API origin (e.g. {@code http://127.0.0.1:8080}).
   * When unset in dev, {@code main.tsx} defaults to port 8080.
   */
  readonly VITE_JMZ_API_BASE?: string;
}

interface ImportMeta
{
  readonly env: ImportMetaEnv;
}

interface Window
{
}
