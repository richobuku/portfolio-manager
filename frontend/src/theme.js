import { createTheme } from '@mui/material/styles';

// GIZ official brand:     #C8102E (red) / #262523 (charcoal) / white
// GOPA Pro brand:         #F3BB36 (gold) / #6A6E6B (slate gray) / #262523 (charcoal)
// Programme accent:       #009B62 (growth green — used in PDF and success states)
// UI primary / corporate: #262523  ← Warm Bronze-Charcoal for sidebar, buttons, chips, headings

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
  proSlateDark:  '#44403C',
  proSlateLight: '#F5F5F4',

  // Legacy compat
  gopaNavy:      '#262523',
  dark:          '#262523',

  // Programme green (PRUDEV II agriculture / growth indicators)
  programmeGreen:      '#009B62',
  programmeGreenLight: '#ECFDF5',
  accent:              '#F3BB36',  // GOPA Gold warning / highlight

  // ── Single unified primary palette (Warm Bronze-Charcoal) ─────────────────
  // A warm, rich dark graphite tone that naturally bridges GOPA Gold and GIZ Red.
  // Replaces all awkward blue/navy across the platform.
  primaryMain:  '#262523',   // Warm Bronze-Charcoal
  primaryDark:  '#191817',   // deep espresso-charcoal (pressed / hover)
  primaryLight: '#3D3B37',   // muted bronze-slate (borders, rings)

  // Sidebar (with GOPA Gold active selection)
  sidebarBg:       '#262523',
  sidebarSelected: 'rgba(243, 187, 54, 0.14)',
  headerBg:        '#262523',
};

const theme = createTheme({
  palette: {
    primary:    { main: BRAND.primaryMain,  dark: BRAND.primaryDark,  light: BRAND.primaryLight },
    secondary:  { main: BRAND.gizRed,       dark: BRAND.gizDarkRed,   light: '#E03050' },
    success:    { main: BRAND.programmeGreen, light: BRAND.programmeGreenLight },
    warning:    { main: BRAND.gopaGold,     dark: BRAND.gopaGoldDark, light: BRAND.gopaGoldLight, contrastText: '#262523' },
    info:       { main: '#57534E',          light: '#F5F5F4' },
    background: { default: '#FAF9F6', paper: '#FFFFFF' },
    text: {
      primary:   '#1C1917',
      secondary: '#78716C',
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
        colorWarning:   { backgroundColor: BRAND.gopaGold, color: '#262523', fontWeight: 700 },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableCell-root': {
            fontWeight: 700, fontSize: 12, textTransform: 'uppercase',
            letterSpacing: '0.04em', color: '#44403C',
            backgroundColor: '#FAF9F6',
            borderBottom: '2px solid #E7E5E4',
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
          borderBottom: '1px solid #F5F5F4',
          '@media (max-width: 599.95px)': {
            paddingLeft: 10,
            paddingRight: 10,
          },
        },
      },
    },
    MuiAppBar:    { styleOverrides: { root:     { backgroundColor: BRAND.headerBg,   boxShadow: 'none' } } },
    MuiCard:      { styleOverrides: { root:     { boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #E7E5E4' } } },
    MuiPaper:     { styleOverrides: { outlined: { border: '1px solid #E7E5E4' } } },
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
