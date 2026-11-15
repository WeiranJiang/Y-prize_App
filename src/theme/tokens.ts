/**
 * SPOT design tokens. Colors are used purposefully: status hues only ever
 * mean a measured state against a configured threshold — never decoration.
 */
export const colors = {
  bg: '#05061B',
  bg2: '#0B1024',
  surface: '#0E1430',
  surfaceRaised: '#131A3A',
  hairline: 'rgba(155,165,184,0.14)',
  hairlineStrong: 'rgba(155,165,184,0.26)',

  ivory: '#F8F9FC',
  coolGray: '#E8ECF2',

  text: '#F7F8FC',
  textSecondary: '#9BA5B8',
  textMuted: '#6B758B',
  textOnLight: '#172033',

  // Sensor states
  normal: '#75BBA5',
  mild: '#F0C76D',
  elevated: '#F29D68',
  high: '#EF6873',
  unavailable: '#69758A',

  // Identity colors for two-series comparisons (validated on #0B1024, ΔE ≥ 24 under CVD).
  seriesA: '#4C78E8',
  seriesB: '#C47A3C',

  point: '#EEF1FA',
  accent: '#A9B8FF',
} as const;

export const font = {
  light: 'Inter_300Light',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 10, md: 16, lg: 22, pill: 999 } as const;

export const type = {
  display: { fontFamily: font.light, fontSize: 34, letterSpacing: -0.8, color: colors.text },
  title: { fontFamily: font.regular, fontSize: 24, letterSpacing: -0.4, color: colors.text },
  heading: { fontFamily: font.medium, fontSize: 17, letterSpacing: -0.2, color: colors.text },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 22, color: colors.textSecondary },
  bodyStrong: { fontFamily: font.medium, fontSize: 15, lineHeight: 22, color: colors.text },
  small: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  label: {
    fontFamily: font.medium,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
    color: colors.textSecondary,
  },
  number: {
    fontFamily: font.light,
    fontSize: 30,
    letterSpacing: -0.6,
    color: colors.text,
    fontVariant: ['tabular-nums' as const],
  },
} as const;
