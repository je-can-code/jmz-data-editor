/// <reference types="vite/client" />

interface Window
{
  NL_PORT?: number;
  NL_TOKEN?: string;
  NL_ARGS?: string[];
  /** Neutralino application root (directory containing resources / neutralino.config). */
  NL_PATH?: string;
}
