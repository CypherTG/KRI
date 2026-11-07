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

const FONT_SANS = '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

export function createKriTheme(mode: ThemeMode) {
  const isDark = mode === 'dark';
  const tokens = {
    page: isDark ? '#0B111E' : '#F8FAFC',
    surface: isDark ? '#111927' : '#FFFFFF',
    surface2: isDark ? '#182234' : '#F1F5F9',
    border: isDark ? '#243244' : '#E2E8F0',
    text: isDark ? '#F1F5F9' : '#0F172A',
    muted: isDark ? '#94A3B8' : '#475569',
    softer: isDark ? '#64748B' : '#94A3B8',
    hover: isDark ? alpha('#6757EF', 0.14) : 'rgba(15, 23, 42, 0.03)',
    hoverStrong: isDark ? alpha('#6757EF', 0.22) : 'rgba(15, 23, 42, 0.06)',
    shadow: isDark
      ? '0 1px 3px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.28)'
      : '0 1px 2px rgba(15,23,42,0.04), 0 2px 8px rgba(15,23,42,0.04)',
    shadowHover: isDark
      ? '0 4px 16px rgba(0,0,0,0.45)'
      : '0 4px 14px rgba(15,23,42,0.08)',
    tooltip: isDark ? '#1E293B' : '#0F172A',
    tableHeader: isDark ? '#151F30' : '#F8FAFC',
  };

  return createTheme({
    palette: {
      mode,
      primary: { main: '#4F46E5', light: '#6366F1', dark: '#3730A3', contrastText: '#FFFFFF' },
      secondary: { main: '#0284C7', light: '#38BDF8', dark: '#0369A1', contrastText: '#FFFFFF' },
      error: { main: '#DC2626', light: '#FCA5A5', dark: '#991B1B' },
      warning: { main: '#EA580C', light: '#FDBA74', dark: '#9A3412' },
      success: { main: '#0D9488', light: '#5EEAD4', dark: '#115E59' },
      background: { default: tokens.page, paper: tokens.surface },
      text: { primary: tokens.text, secondary: tokens.muted, disabled: tokens.softer },
      divider: tokens.border,
      kri: {
        knowledge: '#0284C7',
        rapport: '#EA580C',
        intimacy: '#0D9488',
        surface1: tokens.page,
        surface2: tokens.surface2,
        border: tokens.border,
        muted: tokens.muted,
      },
    },
    typography: {
      fontFamily: FONT_SANS,
      h1: { fontWeight: 700, letterSpacing: '-0.025em', color: tokens.text, lineHeight: 1.18 },
      h2: { fontWeight: 700, letterSpacing: '-0.022em', color: tokens.text, lineHeight: 1.22 },
      h3: { fontWeight: 700, letterSpacing: '-0.018em', color: tokens.text, lineHeight: 1.25 },
      h4: { fontWeight: 600, letterSpacing: '-0.015em', color: tokens.text, lineHeight: 1.3 },
      h5: { fontWeight: 600, letterSpacing: '-0.01em', color: tokens.text },
      h6: { fontWeight: 600, letterSpacing: '-0.008em', color: tokens.text },
      subtitle1: { fontWeight: 600, letterSpacing: '-0.005em' },
      subtitle2: {
        fontWeight: 600,
        letterSpacing: '0.05em',
        textTransform: 'uppercase' as const,
        fontSize: '0.7rem',
        color: tokens.muted,
      },
      body1: { lineHeight: 1.55, letterSpacing: '-0.006em', fontSize: '0.925rem' },
      body2: { lineHeight: 1.55, letterSpacing: '-0.004em', fontSize: '0.85rem' },
      button: { fontWeight: 600, letterSpacing: '-0.005em' },
      caption: { color: tokens.muted, fontSize: '0.74rem', letterSpacing: '0.005em' },
    },
    shape: { borderRadius: 8 },
    shadows: [
      'none',
      isDark ? '0 1px 2px rgba(0,0,0,0.35)' : '0 1px 2px rgba(15,23,42,0.04)',
      isDark ? '0 1px 3px rgba(0,0,0,0.4)' : '0 1px 3px rgba(15,23,42,0.06)',
      isDark ? '0 4px 10px rgba(0,0,0,0.42)' : '0 2px 6px rgba(15,23,42,0.06)',
      isDark ? '0 6px 16px rgba(0,0,0,0.45)' : '0 4px 12px rgba(15,23,42,0.07)',
      isDark ? '0 8px 24px rgba(0,0,0,0.48)' : '0 8px 20px rgba(15,23,42,0.08)',
      isDark ? '0 10px 32px rgba(0,0,0,0.50)' : '0 10px 28px rgba(15,23,42,0.10)',
      isDark ? '0 12px 40px rgba(0,0,0,0.52)' : '0 12px 36px rgba(15,23,42,0.12)',
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
          '*': {
            boxSizing: 'border-box',
            scrollbarWidth: 'thin',
            scrollbarColor: `${tokens.border} transparent`,
          },
          '*::-webkit-scrollbar': { width: '6px', height: '6px' },
          '*::-webkit-scrollbar-track': { background: 'transparent' },
          '*::-webkit-scrollbar-thumb': {
            background: isDark ? '#334155' : '#CBD5E1',
            borderRadius: '3px',
          },
          '*::-webkit-scrollbar-thumb:hover': {
            background: isDark ? '#475569' : '#94A3B8',
          },
          'html, body, #root': {
            background: tokens.page,
            color: tokens.text,
            fontFamily: FONT_SANS,
            WebkitFontSmoothing: 'antialiased',
            MozOsxFontSmoothing: 'grayscale',
            textRendering: 'optimizeLegibility',
            fontFeatureSettings: '"cv02", "cv03", "cv04", "cv11"',
          },
        },
      },
      MuiTypography: {
        styleOverrides: {
          root: {
            fontFamily: FONT_SANS,
            letterSpacing: '-0.008em',
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            fontFamily: FONT_SANS,
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: 7,
            letterSpacing: '-0.005em',
            transition: 'background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
          },
          contained: {
            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.12)',
            '&:hover': {
              boxShadow: '0 2px 6px rgba(15, 23, 42, 0.18)',
            },
          },
          containedError: {
            background: '#DC2626',
            boxShadow: '0 1px 2px rgba(220, 38, 38, 0.2)',
            '&:hover': { background: '#B91C1C' },
          },
          outlined: {
            borderColor: tokens.border,
            color: tokens.text,
            '&:hover': { borderColor: '#4F46E5', background: tokens.hover },
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            background: tokens.surface,
            border: `1px solid ${tokens.border}`,
            boxShadow: tokens.shadow,
            borderRadius: 10,
            transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
            '&:hover': { boxShadow: tokens.shadowHover },
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
              borderRadius: 7,
              fontSize: '0.875rem',
              '& fieldset': { borderColor: tokens.border },
              '&:hover fieldset': { borderColor: isDark ? '#475569' : '#94A3B8' },
              '&.Mui-focused fieldset': {
                borderColor: '#4F46E5',
                borderWidth: '1px',
                boxShadow: `0 0 0 3px ${alpha('#4F46E5', 0.12)}`,
              },
            },
            '& .MuiInputLabel-root': { color: tokens.muted, fontSize: '0.85rem' },
            '& .MuiInputLabel-root.Mui-focused': { color: '#4F46E5' },
            '& .MuiInputBase-input': { color: tokens.text },
            '& .MuiInputBase-input::placeholder': { color: tokens.softer, opacity: 1 },
          },
        },
      },
      MuiSelect: {
        styleOverrides: {
          root: {
            background: tokens.surface,
            fontSize: '0.875rem',
            '& .MuiOutlinedInput-notchedOutline': { borderColor: tokens.border },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#4F46E5' },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#4F46E5' },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            fontFamily: FONT_SANS,
            fontWeight: 600,
            fontSize: '0.73rem',
            borderRadius: 6,
            fontVariantNumeric: 'tabular-nums',
          },
        },
      },
      MuiTableHead: {
        styleOverrides: {
          root: {
            '& .MuiTableCell-head': {
              background: tokens.tableHeader,
              fontWeight: 600,
              fontSize: '0.73rem',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
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
              borderBottom: `1px solid ${alpha(tokens.border, isDark ? 0.8 : 0.75)}`,
              color: tokens.text,
              fontSize: '0.85rem',
              fontVariantNumeric: 'tabular-nums',
            },
          },
        },
      },
      MuiTableCell: { styleOverrides: { root: { padding: '12px 16px' } } },
      MuiTabs: {
        styleOverrides: {
          root: { borderBottom: `1px solid ${tokens.border}` },
          indicator: { background: '#4F46E5', height: 2 },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            fontFamily: FONT_SANS,
            textTransform: 'none',
            fontWeight: 600,
            fontSize: '0.85rem',
            color: tokens.muted,
            '&.Mui-selected': { color: tokens.text },
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            background: tokens.surface,
            border: `1px solid ${tokens.border}`,
            borderRadius: 12,
            boxShadow: isDark ? '0 24px 64px rgba(0,0,0,0.55)' : '0 20px 48px rgba(15,23,42,0.14)',
          },
        },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: { borderRadius: 3, backgroundColor: tokens.surface2, height: 5 },
          bar: { borderRadius: 3, background: '#4F46E5' },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            background: tokens.tooltip,
            color: '#FFFFFF',
            fontSize: '0.76rem',
            fontWeight: 500,
            borderRadius: 6,
          },
        },
      },
      MuiSwitch: {
        styleOverrides: {
          switchBase: {
            '&.Mui-checked': { color: '#4F46E5' },
            '&.Mui-checked + .MuiSwitch-track': { backgroundColor: '#4F46E5' },
          },
          track: { backgroundColor: isDark ? '#475569' : '#CBD5E1' },
        },
      },
      MuiList: { styleOverrides: { root: { padding: 0 } } },
      MuiListItem: { styleOverrides: { root: { borderRadius: 6 } } },
      MuiDivider: { styleOverrides: { root: { borderColor: tokens.border } } },
      MuiIconButton: {
        styleOverrides: {
          root: {
            color: tokens.muted,
            '&:hover': { background: tokens.hover, color: tokens.text },
          },
        },
      },
      MuiAvatar: {
        styleOverrides: {
          root: { fontFamily: FONT_SANS, fontWeight: 600, fontSize: '0.82rem' },
        },
      },
    },
  });
}

const kriTheme = createKriTheme('light');

export default kriTheme;
