import { createTheme } from '@mui/material';

// Structural accent: card header strips, tab indicators, active nav items.
// This is the ONLY place cyan/blue should appear as decoration.
const ACCENT_STRUCTURAL = '#90caf9';

// Secondary action color (buttons, SDP chip, etc.)
const ACCENT_SECONDARY = '#f48fb1';

// Semantic chip palette — saturated colors reserved for status meaning only.
// success → item components; error → weapon components; info → armor components;
// warning → gold components; secondary (above) → SDP components.
// Keep JABS AI role chip colors as-is (defined in their own component).

const appTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: ACCENT_STRUCTURAL,
    },
    secondary: {
      main: ACCENT_SECONDARY,
    },
    background: {
      default: '#121212',
      paper: '#1e1e1e',
    },
  },
});

export { appTheme };
