/**
 * OraCare design system — neutral, clinical dark UI.
 *
 * ~90% of every screen is black, graphite, white and gray. Green, amber and
 * red are reserved for medical status and always ship with a text label.
 */
import { Platform } from 'react-native';

export const colors = {
  // Neutral foundation
  bg: '#0A0A0A',
  bg2: '#141414',
  surface: '#1A1A1A', // cards
  surfaceRaised: '#242424', // elevated / selected
  border: '#303030',
  hairline: '#232323',
  hairlineStrong: '#303030',

  text: '#F5F5F5',
  textSecondary: '#989898',
  textMuted: '#696969',
  textOnLight: '#0A0A0A',
  ivory: '#F5F5F5', // primary buttons / active states

  // Functional health colours
  normal: '#39A76D', // in range
  mild: '#D6A34A', // borderline
  elevated: '#E05252', // needs attention
  high: '#E05252', // needs attention (labelled "High")
  unavailable: '#696969',

  // Two-series charts: neutral white vs gray, always with direct labels.
  seriesA: '#F5F5F5',
  seriesB: '#8A8A8A',

  point: '#E8E8E8',
  accent: '#F5F5F5',
} as const;

/** SF Pro on iOS (system font); platform system font elsewhere. */
const family = Platform.select({ ios: 'System', android: undefined, default: 'System' });

export const font = {
  family,
  light: family,
  regular: family,
  medium: family,
  semibold: family,
} as const;

export const weight = { light: '300', regular: '400', medium: '500', semibold: '600' } as const;

/** 8-point spacing. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 12, md: 14, lg: 18, pill: 999 } as const;

const tab = ['tabular-nums' as const];

export const type = {
  display: { fontFamily: family, fontWeight: '600' as const, fontSize: 32, letterSpacing: -0.6, color: colors.text },
  title: { fontFamily: family, fontWeight: '600' as const, fontSize: 22, letterSpacing: -0.35, color: colors.text },
  heading: { fontFamily: family, fontWeight: '600' as const, fontSize: 17, letterSpacing: -0.2, color: colors.text },
  body: { fontFamily: family, fontWeight: '400' as const, fontSize: 15, lineHeight: 21, color: colors.textSecondary },
  bodyStrong: { fontFamily: family, fontWeight: '500' as const, fontSize: 15, lineHeight: 21, color: colors.text },
  small: { fontFamily: family, fontWeight: '400' as const, fontSize: 13, lineHeight: 18, color: colors.textSecondary, fontVariant: tab },
  label: {
    fontFamily: family,
    fontWeight: '600' as const,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
    color: colors.textMuted,
  },
  number: {
    fontFamily: family,
    fontWeight: '500' as const,
    fontSize: 28,
    letterSpacing: -0.5,
    color: colors.text,
    fontVariant: tab,
  },
} as const;
