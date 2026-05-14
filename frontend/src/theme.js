import { createTheme } from '@mui/material/styles';

// GIZ official brand:  #C8102E (red)
// GOPA AFC brand:      #003D7A (navy — kept as reference only)
// Programme accent:    #009B62 (green — used in PDF and success states)
// UI primary / dark slate: #1A2E42  ← unified colour for sidebar, buttons, chips, badges, headings

export const BRAND = {
  // Logo colours (reference only — do not use as primary UI colour)
  gizRed:        '#C8102E',
  gizDarkRed:    '#9B0C22',
  gopaNavy:      '#003D7A',   // kept for backwards compat; use primaryMain for buttons

  // Programme green (PDF accent bar, success chips, cohort badges)
  programmeGreen: '#009B62',
  accent:         '#F5A623',  // warning / highlight

  // ── Single unified primary palette ────────────────────────────────────────
  // All sidebar, nav, buttons, chips, badges, outlines use this family
  // so the whole UI "feels" like one colour.
  primaryMain:  '#1A2E42',   // dark slate  ← matches sidebar exactly
  primaryDark:  '#0F1F2E',   // pressed / hover state
  primaryLight: '#2E4A62',   // light variant (outlined chip border, focus rings)

  // Sidebar (same as primaryMain — explicitly named for clarity)
  sidebarBg:       '#1A2E42',
  sidebarSelected: 'rgba(255,255,255,0.12)',
  headerBg:        '#1A2E42',
};

const theme = createTheme({
  palette: {
    primary:    { main: BRAND.primaryMain,  dark: BRAND.primaryDark,  light: BRAND.primaryLight },
    secondary:  { main: BRAND.gizRed,       dark: BRAND.gizDarkRed,   light: '#E03050' },
    success:    { main: BRAND.programmeGreen },
    warning:    { main: BRAND.accent },
    background: { default: '#F4F6F9', paper: '#FFFFFF' },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica Neue", Arial, sans-serif',
    h6:        { fontWeight: 700 },
    subtitle1: { fontWeight: 600 },
    subtitle2: { fontWeight: 600 },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiButton: {
      styleOverrides: {
        root:             { textTransform: 'none', fontWeight: 600, borderRadius: 6 },
        containedPrimary: { backgroundColor: BRAND.primaryMain,  '&:hover': { backgroundColor: BRAND.primaryDark } },
        outlinedPrimary:  { borderColor:     BRAND.primaryMain,  color: BRAND.primaryMain,
                            '&:hover': { backgroundColor: BRAND.primaryMain + '0D' } },
      },
    },
    MuiChip: {
      styleOverrides: {
        root:              { fontWeight: 500 },
        filledPrimary:     { backgroundColor: BRAND.primaryMain,  color: '#fff' },
        outlinedPrimary:   { borderColor:     BRAND.primaryMain,  color: BRAND.primaryMain },
      },
    },
    MuiBadge: {
      styleOverrides: {
        colorPrimary: { backgroundColor: BRAND.primaryMain },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableCell-root': {
            fontWeight: 700, fontSize: 12, textTransform: 'uppercase',
            letterSpacing: '0.04em', color: '#555',
          },
        },
      },
    },
    MuiTableContainer: {
      styleOverrides: {
        root: {
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          maxWidth: '100%',
        },
      },
    },
    MuiTable: {
      styleOverrides: {
        root: {
          '@media (max-width: 899.95px)': {
            minWidth: 720,
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          '@media (max-width: 599.95px)': {
            paddingLeft: 10,
            paddingRight: 10,
          },
        },
      },
    },
    MuiAppBar:    { styleOverrides: { root:     { backgroundColor: BRAND.headerBg,   boxShadow: 'none' } } },
    MuiCard:      { styleOverrides: { root:     { boxShadow: '0 1px 4px rgba(0,0,0,0.08)', border: '1px solid #E8EDF2' } } },
    MuiPaper:     { styleOverrides: { outlined: { border: '1px solid #E8EDF2' } } },
    MuiLinearProgress: {
      styleOverrides: {
        bar: { backgroundColor: BRAND.primaryMain },
      },
    },
    MuiCircularProgress: {
      defaultProps: { color: 'primary' },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: { backgroundColor: BRAND.primaryMain },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: { '&.Mui-selected': { color: BRAND.primaryMain } },
      },
    },
    MuiCheckbox: {
      styleOverrides: {
        root: { '&.Mui-checked': { color: BRAND.primaryMain } },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        switchBase: { '&.Mui-checked': { color: BRAND.primaryMain },
                      '&.Mui-checked + .MuiSwitch-track': { backgroundColor: BRAND.primaryMain } },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: BRAND.primaryMain } },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: { '&.Mui-focused': { color: BRAND.primaryMain } },
      },
    },
  },
});

export default theme;
