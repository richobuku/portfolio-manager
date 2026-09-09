import { createTheme } from '@mui/material/styles';

// GIZ official brand:  #C8102E (red)
// GOPA Pro brand:      #F3BB36 (gold) / #6A6E6B (slate gray)
// Programme accent:    #009B62 (green — used in PDF and success states)
// UI primary / dark slate: #1A2E42  ← unified colour for sidebar, buttons, chips, badges, headings

export const BRAND = {
  // GIZ official brand (partnership partner)
  gizRed:        '#C8102E',
  gizDarkRed:    '#9B0C22',
  gizLightRed:   '#FFF1F2',

  // GOPA Pro brand (implementing partner)
  gopaGold:      '#F3BB36',
  gopaGoldDark:  '#D97706',   // accessible amber-gold for text/buttons
  gopaGoldLight: '#FEF3C7',   // soft gold background for highlights and tags
  gopaGoldHover: '#E5A812',
  proSlate:      '#6A6E6B',   // GOPA Pro brand slate gray
  proSlateDark:  '#374151',
  proSlateLight: '#F1F5F9',

  // Legacy compat
  gopaNavy:      '#1A2E42',
  dark:          '#1A2E42',

  // Programme green (PRUDEV II agriculture / growth indicators)
  programmeGreen:      '#009B62',
  programmeGreenLight: '#ECFDF5',
  accent:              '#F3BB36',  // GOPA Gold warning / highlight

  // ── Single unified primary palette ────────────────────────────────────────
  // All sidebar, nav, buttons, chips, badges, outlines use this family
  // so the whole UI feels like one cohesive, state-of-the-art system.
  primaryMain:  '#1A2E42',   // dark corporate slate
  primaryDark:  '#0F1F2E',   // pressed / hover state
  primaryLight: '#2E4A62',   // light variant (outlined chip border, focus rings)

  // Sidebar (with GOPA Gold active selection)
  sidebarBg:       '#1A2E42',
  sidebarSelected: 'rgba(243, 187, 54, 0.14)',
  headerBg:        '#1A2E42',
};

const theme = createTheme({
  palette: {
    primary:    { main: BRAND.primaryMain,  dark: BRAND.primaryDark,  light: BRAND.primaryLight },
    secondary:  { main: BRAND.gizRed,       dark: BRAND.gizDarkRed,   light: '#E03050' },
    success:    { main: BRAND.programmeGreen, light: BRAND.programmeGreenLight },
    warning:    { main: BRAND.gopaGold,     dark: BRAND.gopaGoldDark, light: BRAND.gopaGoldLight, contrastText: '#1A2E42' },
    info:       { main: '#0288D1',          light: '#E1F5FE' },
    background: { default: '#F8FAFC', paper: '#FFFFFF' },
    text: {
      primary:   '#1E293B',
      secondary: '#64748B',
    },
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
        containedSecondary: { backgroundColor: BRAND.gizRed,     '&:hover': { backgroundColor: BRAND.gizDarkRed } },
        outlinedPrimary:  { borderColor:     BRAND.primaryMain,  color: BRAND.primaryMain,
                            '&:hover': { backgroundColor: BRAND.primaryMain + '0D' } },
      },
    },
    MuiChip: {
      styleOverrides: {
        root:              { fontWeight: 500 },
        filledPrimary:     { backgroundColor: BRAND.primaryMain,  color: '#fff' },
        outlinedPrimary:   { borderColor:     BRAND.primaryMain,  color: BRAND.primaryMain },
        colorWarning:      { backgroundColor: BRAND.gopaGoldLight, color: '#92400E', border: '1px solid #FDE68A', fontWeight: 600 },
        colorSecondary:    { backgroundColor: BRAND.gizLightRed,  color: BRAND.gizRed,   border: '1px solid #FECDD3', fontWeight: 600 },
      },
    },
    MuiBadge: {
      styleOverrides: {
        colorPrimary:   { backgroundColor: BRAND.primaryMain },
        colorSecondary: { backgroundColor: BRAND.gizRed },
        colorWarning:   { backgroundColor: BRAND.gopaGold, color: '#1A2E42', fontWeight: 700 },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableCell-root': {
            fontWeight: 700, fontSize: 12, textTransform: 'uppercase',
            letterSpacing: '0.04em', color: '#475569',
            backgroundColor: '#F8FAFC',
            borderBottom: '2px solid #E2E8F0',
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
          borderBottom: '1px solid #F1F5F9',
          '@media (max-width: 599.95px)': {
            paddingLeft: 10,
            paddingRight: 10,
          },
        },
      },
    },
    MuiAppBar:    { styleOverrides: { root:     { backgroundColor: BRAND.headerBg,   boxShadow: 'none' } } },
    MuiCard:      { styleOverrides: { root:     { boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #E2E8F0' } } },
    MuiPaper:     { styleOverrides: { outlined: { border: '1px solid #E2E8F0' } } },
    MuiLinearProgress: {
      styleOverrides: {
        bar: { backgroundColor: BRAND.gopaGold },
      },
    },
    MuiCircularProgress: {
      defaultProps: { color: 'primary' },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: { backgroundColor: BRAND.gopaGold, height: 3, borderRadius: '3px 3px 0 0' },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          '&.Mui-selected': { color: BRAND.primaryMain, fontWeight: 700 },
          '&:hover': { color: BRAND.gopaGoldDark },
        },
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
        root: {
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: BRAND.primaryLight },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: BRAND.primaryMain },
        },
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
