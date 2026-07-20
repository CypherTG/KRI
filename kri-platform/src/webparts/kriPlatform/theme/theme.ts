import { alpha, createTheme } from '@mui/material/styles';

export type ThemeMode = 'light' | 'dark';

declare module '@mui/material/styles' {
  interface Palette {
    kri: {
      knowledge: string;
      rapport: string;
      intimacy: string;
      surface1: string;
      surface2: string;
      border: string;
      muted: string;
    };
  }
  interface PaletteOptions {
    kri?: {
      knowledge?: string;
      rapport?: string;
      intimacy?: string;
      surface1?: string;
      surface2?: string;
      border?: string;
      muted?: string;
    };
  }
}

export function createKriTheme(mode: ThemeMode) {
  const isDark = mode === 'dark';
  const tokens = {
    page: isDark ? '#15202b' : '#F5F6FA',
    surface: isDark ? '#1d2733' : '#FFFFFF',
    surface2: isDark ? '#22303c' : '#F5F6FA',
    border: isDark ? '#31404f' : '#E8ECF0',
    text: isDark ? '#e7eaee' : '#1A1D23',
    muted: isDark ? '#FFFFFF' : '#7B8FA6',
    softer: isDark ? 'rgba(255,255,255,0.82)' : '#B0BEC5',
    hover: isDark ? alpha('#7c6ef5', 0.16) : 'rgba(103,87,239,0.04)',
    hoverStrong: isDark ? alpha('#7c6ef5', 0.24) : 'rgba(103,87,239,0.08)',
    shadow: isDark ? '0 10px 30px rgba(0,0,0,0.28)' : '0 2px 12px rgba(0,0,0,0.06)',
    shadowHover: isDark ? '0 16px 40px rgba(0,0,0,0.36)' : '0 6px 24px rgba(0,0,0,0.10)',
    tooltip: isDark ? '#22303c' : '#1A1D23',
    tableHeader: isDark ? '#22303c' : '#F5F6FA',
  };

  return createTheme({
    palette: {
      mode,
      primary: { main: '#6757EF', light: '#8B7EF5', dark: '#4B3DD6', contrastText: '#FFFFFF' },
      secondary: { main: '#2196F3', light: '#64B5F6', dark: '#1565C0', contrastText: '#FFFFFF' },
      error: { main: '#F44336', light: '#EF9A9A', dark: '#C62828' },
      warning: { main: '#FF7043', light: '#FFAB91', dark: '#BF360C' },
      success: { main: '#00BFA5', light: '#64FFDA', dark: '#00796B' },
      background: { default: tokens.page, paper: tokens.surface },
      text: { primary: tokens.text, secondary: tokens.muted, disabled: tokens.softer },
      divider: tokens.border,
      kri: {
        knowledge: '#2196F3',
        rapport: '#FF7043',
        intimacy: '#00BFA5',
        surface1: tokens.page,
        surface2: tokens.surface2,
        border: tokens.border,
        muted: tokens.muted,
      },
    },
    typography: {
      fontFamily: '"Inter", "Segoe UI", Arial, sans-serif',
      h1: { fontWeight: 800, letterSpacing: '-0.02em', color: tokens.text },
      h2: { fontWeight: 800, letterSpacing: '-0.02em', color: tokens.text },
      h3: { fontWeight: 700, letterSpacing: '-0.01em', color: tokens.text },
      h4: { fontWeight: 700, letterSpacing: '-0.01em', color: tokens.text },
      h5: { fontWeight: 700, color: tokens.text },
      h6: { fontWeight: 700, color: tokens.text },
      subtitle1: { fontWeight: 600 },
      subtitle2: { fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' as const, fontSize: '0.72rem', color: tokens.muted },
      body1: { lineHeight: 1.6 },
      body2: { lineHeight: 1.6 },
      button: { fontWeight: 600, letterSpacing: '0.02em' },
      caption: { color: tokens.muted, fontSize: '0.74rem' },
    },
    shape: { borderRadius: 12 },
    shadows: [
      'none',
      isDark ? '0 1px 4px rgba(0,0,0,0.28)' : '0 1px 4px rgba(0,0,0,0.06)',
      isDark ? '0 2px 8px rgba(0,0,0,0.30)' : '0 2px 8px rgba(0,0,0,0.08)',
      isDark ? '0 4px 16px rgba(0,0,0,0.34)' : '0 4px 16px rgba(0,0,0,0.10)',
      isDark ? '0 6px 24px rgba(0,0,0,0.38)' : '0 6px 24px rgba(0,0,0,0.12)',
      isDark ? '0 8px 32px rgba(0,0,0,0.40)' : '0 8px 32px rgba(0,0,0,0.14)',
      isDark ? '0 10px 40px rgba(0,0,0,0.42)' : '0 10px 40px rgba(0,0,0,0.16)',
      isDark ? '0 12px 48px rgba(0,0,0,0.44)' : '0 12px 48px rgba(0,0,0,0.18)',
      '0 0 0 rgba(0,0,0,0)', '0 0 0 rgba(0,0,0,0)',
      '0 0 0 rgba(0,0,0,0)', '0 0 0 rgba(0,0,0,0)',
      '0 0 0 rgba(0,0,0,0)', '0 0 0 rgba(0,0,0,0)',
      '0 0 0 rgba(0,0,0,0)', '0 0 0 rgba(0,0,0,0)',
      '0 0 0 rgba(0,0,0,0)', '0 0 0 rgba(0,0,0,0)',
      '0 0 0 rgba(0,0,0,0)', '0 0 0 rgba(0,0,0,0)',
      '0 0 0 rgba(0,0,0,0)', '0 0 0 rgba(0,0,0,0)',
      '0 0 0 rgba(0,0,0,0)', '0 0 0 rgba(0,0,0,0)',
      '0 0 0 rgba(0,0,0,0)',
    ],
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          '@import': "url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap')",
          '*': { boxSizing: 'border-box', scrollbarWidth: 'thin', scrollbarColor: `${tokens.border} transparent` },
          '*::-webkit-scrollbar': { width: '6px', height: '6px' },
          '*::-webkit-scrollbar-track': { background: 'transparent' },
          '*::-webkit-scrollbar-thumb': { background: isDark ? '#47617a' : '#D0D5DD', borderRadius: '3px' },
          '*::-webkit-scrollbar-thumb:hover': { background: isDark ? '#5f7b96' : '#B0BEC5' },
          'html, body, #root': { background: tokens.page, color: tokens.text },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: 10,
            transition: 'all 0.2s ease',
            '&:hover': { transform: 'translateY(-1px)' },
            '&:active': { transform: 'translateY(0)' },
          },
          contained: {
            boxShadow: isDark ? '0 4px 14px rgba(103,87,239,0.28)' : '0 4px 14px rgba(103,87,239,0.3)',
            '&:hover': { boxShadow: isDark ? '0 6px 20px rgba(103,87,239,0.38)' : '0 6px 20px rgba(103,87,239,0.45)' },
          },
          containedError: {
            background: '#F44336',
            boxShadow: '0 4px 14px rgba(244,67,54,0.3)',
            '&:hover': { background: '#D32F2F', boxShadow: '0 6px 20px rgba(244,67,54,0.45)' },
          },
          outlined: {
            borderColor: tokens.border,
            color: tokens.text,
            '&:hover': { borderColor: '#6757EF', background: tokens.hover },
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            background: tokens.surface,
            border: `1px solid ${tokens.border}`,
            boxShadow: tokens.shadow,
            transition: 'all 0.25s ease',
            '&:hover': { boxShadow: tokens.shadowHover, transform: 'translateY(-2px)' },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            background: tokens.surface,
            border: `1px solid ${tokens.border}`,
            boxShadow: tokens.shadow,
            backgroundImage: 'none',
          },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              background: tokens.surface,
              borderRadius: 8,
              '& fieldset': { borderColor: tokens.border },
              '&:hover fieldset': { borderColor: '#6757EF' },
              '&.Mui-focused fieldset': { borderColor: '#6757EF', boxShadow: `0 0 0 3px ${alpha('#6757EF', 0.12)}` },
            },
            '& .MuiInputLabel-root': { color: tokens.muted },
            '& .MuiInputLabel-root.Mui-focused': { color: '#6757EF' },
            '& .MuiInputBase-input': { color: tokens.text },
            '& .MuiInputBase-input::placeholder': { color: tokens.softer, opacity: 1 },
          },
        },
      },
      MuiSelect: {
        styleOverrides: {
          root: {
            background: tokens.surface,
            '& .MuiOutlinedInput-notchedOutline': { borderColor: tokens.border },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#6757EF' },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#6757EF' },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { fontWeight: 600, fontSize: '0.75rem', borderRadius: 20 },
        },
      },
      MuiTableHead: {
        styleOverrides: {
          root: {
            '& .MuiTableCell-head': {
              background: tokens.tableHeader,
              fontWeight: 600,
              fontSize: '0.78rem',
              letterSpacing: '0.04em',
              color: tokens.muted,
              borderBottom: `1px solid ${tokens.border}`,
            },
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            '&:hover': { background: tokens.hover },
            '& .MuiTableCell-root': {
              borderBottom: `1px solid ${alpha(tokens.border, isDark ? 0.8 : 0.7)}`,
              color: tokens.text,
              fontSize: '0.875rem',
            },
          },
        },
      },
      MuiTableCell: { styleOverrides: { root: { padding: '14px 16px' } } },
      MuiTabs: {
        styleOverrides: {
          root: { borderBottom: `1px solid ${tokens.border}` },
          indicator: { background: '#6757EF', height: 3, borderRadius: '3px 3px 0 0' },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 600,
            fontSize: '0.875rem',
            color: tokens.muted,
            '&.Mui-selected': { color: '#6757EF' },
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            background: tokens.surface,
            border: `1px solid ${tokens.border}`,
            boxShadow: isDark ? '0 24px 64px rgba(0,0,0,0.50)' : '0 24px 64px rgba(0,0,0,0.12)',
          },
        },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: { borderRadius: 4, backgroundColor: tokens.surface2, height: 6 },
          bar: { borderRadius: 4, background: 'linear-gradient(90deg, #6757EF, #2196F3)' },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            background: tokens.tooltip,
            color: '#FFFFFF',
            fontSize: '0.8rem',
            fontWeight: 500,
            borderRadius: 6,
          },
        },
      },
      MuiSwitch: {
        styleOverrides: {
          switchBase: {
            '&.Mui-checked': { color: '#6757EF' },
            '&.Mui-checked + .MuiSwitch-track': { backgroundColor: '#6757EF' },
          },
          track: { backgroundColor: isDark ? '#5a5f69' : '#D0D5DD' },
        },
      },
      MuiList: { styleOverrides: { root: { padding: 0 } } },
      MuiListItem: { styleOverrides: { root: { borderRadius: 8 } } },
      MuiDivider: { styleOverrides: { root: { borderColor: tokens.border } } },
      MuiIconButton: {
        styleOverrides: {
          root: {
            color: tokens.muted,
            '&:hover': { background: tokens.hover, color: tokens.text },
          },
        },
      },
      MuiAvatar: { styleOverrides: { root: { fontWeight: 700 } } },
    },
  });
}

const kriTheme = createKriTheme('light');

export default kriTheme;
