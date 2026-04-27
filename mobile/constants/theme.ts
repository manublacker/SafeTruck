/**
 * SafeTruck Logistics Design System — tokens.
 * Paleta rediseño: naranja cálido / crema / charcoal oscuro / amarillo peaje / rojo warning.
 */

import { Platform } from 'react-native';

export const Palette = {
  charcoal:    '#1F1815',
  charcoalSoft:'#2D2520',
  charcoal12:  'rgba(31, 24, 21, 0.12)',
  charcoal06:  'rgba(31, 24, 21, 0.06)',
  cream:       '#F4EDE0',
  creamDeep:   '#EDE3D2',
  white:       '#FFFFFF',
  orange:      '#ED7637',
  orangeDk:    '#D85F22',
  orangeSoft:  'rgba(237, 118, 55, 0.12)',
  yellow:      '#F0C24A',
  yellowSoft:  '#F8E2A6',
  red:         '#C44536',
  redSoft:     '#F4D6CD',
  green:       '#2E7D32',
  greenSoft:   'rgba(46, 125, 50, 0.10)',
} as const;

// Tokens semánticos por modo. La shape es idéntica entre light y dark.
const lightSemantic = {
  brand:        Palette.orange,
  brandDk:      Palette.orangeDk,
  cta:          Palette.orange,
  ctaDark:      Palette.orangeDk,
  surface:      Palette.white,
  surfaceAlt:   Palette.cream,
  surfaceDeep:  Palette.creamDeep,
  surfaceDark:  Palette.charcoal,
  border:       Palette.charcoal12,
  borderSoft:   Palette.charcoal06,
  textPrimary:  Palette.charcoal,
  textSecond:   '#6B5E55',
  textMuted:    '#A39689',
  textOnCta:    Palette.white,
  textOnBrand:  Palette.white,
  textOnDark:   Palette.cream,
  toll:         Palette.yellow,
  tollSoft:     Palette.yellowSoft,
  warning:      Palette.red,
  warningSoft:  Palette.redSoft,
  success:      Palette.green,
  successBg:    Palette.greenSoft,
  danger:       Palette.red,
  dangerBg:     Palette.redSoft,
} as const;

const darkSemantic = {
  brand:        Palette.orange,
  brandDk:      Palette.orangeDk,
  cta:          Palette.orange,
  ctaDark:      Palette.orangeDk,
  surface:      '#1F1815',
  surfaceAlt:   '#2A2320',
  surfaceDeep:  '#352C28',
  surfaceDark:  '#0F0B0A',
  border:       'rgba(255, 255, 255, 0.10)',
  borderSoft:   'rgba(255, 255, 255, 0.05)',
  textPrimary:  '#F4EDE0',
  textSecond:   '#C2B8AD',
  textMuted:    '#7A6E63',
  textOnCta:    Palette.white,
  textOnBrand:  Palette.white,
  textOnDark:   '#F4EDE0',
  toll:         Palette.yellow,
  tollSoft:     'rgba(240, 194, 74, 0.18)',
  warning:      '#E07566',
  warningSoft:  'rgba(196, 69, 54, 0.22)',
  success:      Palette.green,
  successBg:    Palette.greenSoft,
  danger:       '#E07566',
  dangerBg:     'rgba(196, 69, 54, 0.22)',
} as const;

const constants = {
  radiusSm:     10,
  radiusMd:     14,
  radiusLg:     18,
  radiusXl:     24,
  radiusPill:   999,
  spaceXs:      4,
  spaceSm:      8,
  spaceMd:      12,
  spaceLg:      16,
  spaceXl:      24,
  ctaHeight:    52,
  ctaRadius:    14,

  fontSizeCaption: 11,
  fontSizeSmall:   13,
  fontSizeBody:    15,
  fontSizeHeading: 22,
  fontSizeTitle:   34,
  letterEyebrow:   1.4,

  shadow: {
    soft:  { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 12, elevation: 5 },
    fab:   { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6,  elevation: 4 },
    sheet: { shadowColor: '#000', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.14, shadowRadius: 16, elevation: 12 },
    none:  { shadowOpacity: 0, elevation: 0 },
  },
} as const;

type Semantic = { -readonly [K in keyof typeof lightSemantic]: string };
type Constants = typeof constants;
export type ThemeTokens = Semantic & Constants;

export const LightTheme: ThemeTokens = { ...lightSemantic, ...constants };
export const DarkTheme:  ThemeTokens = { ...darkSemantic,  ...constants };

// Default export que mantiene el camino histórico (claro). Hooks devuelven el tema activo.
export const Theme = LightTheme;

// Compat con scaffold de Expo
export const Colors = {
  light: {
    text:             Palette.charcoal,
    background:       Palette.cream,
    tint:             Palette.orange,
    icon:             '#6B5E55',
    tabIconDefault:   '#A39689',
    tabIconSelected:  Palette.orange,
  },
  dark: {
    text:             Palette.cream,
    background:       Palette.charcoal,
    tint:             Palette.orange,
    icon:             '#A39689',
    tabIconDefault:   '#6B5E55',
    tabIconSelected:  Palette.orange,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans:    'system-ui',
    serif:   'ui-serif',
    rounded: 'ui-rounded',
    mono:    'ui-monospace',
  },
  default: {
    sans:    'normal',
    serif:   'serif',
    rounded: 'normal',
    mono:    'monospace',
  },
  web: {
    sans:    "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif:   "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono:    "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
