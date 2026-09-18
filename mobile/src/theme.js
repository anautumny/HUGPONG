// ─── HUGPONG Design System ─────────────────────────────────────
// Inspired by enterprise habit-tracker & finance app aesthetics
// Optimised for outdoor/farm readability — high contrast, bold hierarchy
// Palette: olive · sage · forest green · warm amber · slate
// ────────────────────────────────────────────────────────────────

// ── Color Palette ──────────────────────────────────────────────
export const PALETTE = {
  // Forest greens
  forest900: '#162D0F',
  forest800: '#1E3D14',
  forest700: '#2D5A1E',
  forest600: '#3B7228',
  forest500: '#4A8A32',
  forest400: '#6BA04E',
  forest300: '#8FB870',
  forest200: '#C0D9A8',
  forest100: '#E4EED8',
  forest50:  '#F2F7EE',

  // Sage / olive
  sage500: '#5C7A4A',
  sage400: '#7A9B62',
  sage300: '#A0B888',
  sage200: '#C8D8B8',
  sage100: '#EDF2E8',

  // Amber / harvest
  amber600: '#A85E00',
  amber500: '#C97A00',
  amber400: '#E8920A',
  amber300: '#F5A623',
  amber200: '#FAC96A',
  amber100: '#FEF0D0',
  amber50:  '#FFFBF0',

  // Steel blue / info
  steel600: '#0F4C75',
  steel500: '#1A6B9A',
  steel400: '#2E86C1',
  steel300: '#5BA5D8',
  steel200: '#A8D4EF',
  steel100: '#DFF0FB',
  steel50:  '#F0F8FF',

  // Danger / crimson
  crimson600: '#8B1A1A',
  crimson500: '#B22222',
  crimson400: '#D9534F',
  crimson300: '#E87870',
  crimson100: '#FDECEA',
  crimson50:  '#FFF5F5',

  // Success
  emerald600: '#1A5C1A',
  emerald500: '#267326',
  emerald400: '#339933',
  emerald300: '#5CB85C',
  emerald100: '#E8F5E8',
  emerald50:  '#F2FBF2',

  // Neutrals
  neutral950: '#0D1008',
  neutral900: '#1A200E',
  neutral800: '#2C3422',
  neutral700: '#455038',
  neutral600: '#5E6D50',
  neutral500: '#7A8A6A',
  neutral400: '#9EAE8E',
  neutral300: '#C0CCB0',
  neutral200: '#DCE8CC',
  neutral100: '#EDF3E5',
  neutral50:  '#F7F9F4',
  white:      '#FFFFFF',
};

// ── Semantic Colors ─────────────────────────────────────────────
export const COLORS = {
  // Brand
  primary:        PALETTE.forest700,      // #2D5A1E — main green
  primaryLight:   PALETTE.forest500,      // #4A8A32 — lighter green
  primaryMuted:   PALETTE.forest400,      // #6BA04E — muted green
  primaryBg:      PALETTE.forest50,       // #F2F7EE — green tint bg
  primaryBorder:  PALETTE.forest200,      // #C0D9A8 — green border

  // Accent — harvest amber
  accent:         PALETTE.amber400,       // #E8920A
  accentLight:    PALETTE.amber300,       // #F5A623
  accentBg:       PALETTE.amber50,        // #FFFBF0

  // Status
  success:        PALETTE.emerald500,     // #267326
  successLight:   PALETTE.emerald100,     // #E8F5E8
  danger:         PALETTE.crimson400,     // #D9534F
  dangerBg:       PALETTE.crimson50,      // #FFF5F5
  warning:        PALETTE.amber400,       // #E8920A
  warningBg:      PALETTE.amber100,       // #FEF0D0
  blue:           PALETTE.steel500,       // #1A6B9A
  blueBg:         PALETTE.steel100,       // #DFF0FB
  conflict:       '#7B4FA6',              // purple — conflict state

  // Backgrounds
  background:     PALETTE.neutral50,      // #F7F9F4 — warm off-white
  surface:        PALETTE.white,          // #FFFFFF
  surfaceRaised:  PALETTE.white,
  overlay:        'rgba(22,45,15,0.5)',    // forest-tinted modal overlay

  // Typography
  text:           PALETTE.neutral900,     // #1A200E — near-black, green-tinted
  textSecondary:  PALETTE.neutral700,     // #455038 — secondary
  textMuted:      PALETTE.neutral500,     // #7A8A6A — muted/caption
  textDisabled:   PALETTE.neutral400,     // #9EAE8E — disabled
  textInverse:    PALETTE.white,

  // Borders & Dividers
  border:         PALETTE.neutral200,     // #DCE8CC
  borderStrong:   PALETTE.neutral300,     // #C0CCB0
  divider:        PALETTE.neutral100,     // #EDF3E5

  // Nav bar
  tabBar:         PALETTE.white,
  tabBarBorder:   PALETTE.neutral200,

  // Carry-forwards for backward compat
  inProgress:     PALETTE.steel500,
  inProgressBg:   PALETTE.steel100,
};

// ── Typography Scale ────────────────────────────────────────────
// Standardized hierarchy: readable for outdoor and 40+ users
// Minimum metadata size: 12px; Body: 16px; Titles: 22-24px bold; Section: 18-20px semibold
export const TYPE = {
  // Screen and Section Titles
  screenTitle:   { fontSize: 24, fontWeight: '700', lineHeight: 30, letterSpacing: -0.3 },
  sectionTitle:  { fontSize: 18, fontWeight: '600', lineHeight: 24, letterSpacing: -0.2 },
  importantValue:{ fontSize: 24, fontWeight: '700', lineHeight: 30 },

  // Body & Content
  body:          { fontSize: 16, fontWeight: '400', lineHeight: 24 },
  bodyLg:        { fontSize: 16, fontWeight: '400', lineHeight: 24 },
  bodyMd:        { fontSize: 14, fontWeight: '400', lineHeight: 22 },
  bodySm:        { fontSize: 13, fontWeight: '400', lineHeight: 20 },

  // Forms & UI
  formLabel:     { fontSize: 14, fontWeight: '500', lineHeight: 20 },
  supporting:    { fontSize: 14, fontWeight: '400', lineHeight: 20 },
  metadata:      { fontSize: 12, fontWeight: '500', lineHeight: 16 },

  // Backward compatible display / headings
  displayLg:     { fontSize: 32, fontWeight: '700', letterSpacing: -0.6, lineHeight: 38 },
  displayMd:     { fontSize: 26, fontWeight: '700', letterSpacing: -0.4, lineHeight: 32 },
  displaySm:     { fontSize: 22, fontWeight: '700', letterSpacing: -0.3, lineHeight: 28 },
  h1:            { fontSize: 20, fontWeight: '600', letterSpacing: -0.2, lineHeight: 26 },
  h2:            { fontSize: 18, fontWeight: '600', letterSpacing: -0.1, lineHeight: 24 },
  h3:            { fontSize: 16, fontWeight: '600', lineHeight: 22 },

  // Labels
  labelLg:       { fontSize: 15, fontWeight: '500', letterSpacing: 0.1 },
  labelMd:       { fontSize: 14, fontWeight: '500', letterSpacing: 0.1 },
  labelSm:       { fontSize: 13, fontWeight: '500', letterSpacing: 0.1 },
  labelXs:       { fontSize: 12, fontWeight: '500', letterSpacing: 0.2 },

  // Captions & Metadata (min 12px)
  caption:       { fontSize: 12, fontWeight: '400', lineHeight: 16 },
  captionBold:   { fontSize: 12, fontWeight: '600', lineHeight: 16 },
  overline:      { fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },

  // Number / Data displays
  dataXl:        { fontSize: 32, fontWeight: '700', letterSpacing: -0.5 },
  dataMd:        { fontSize: 24, fontWeight: '700', letterSpacing: -0.3 },
  dataSm:        { fontSize: 18, fontWeight: '700' },
};

// Keep FONTS for backward compat
export const FONTS = {
  regular: { fontWeight: '400' },
  medium: { fontWeight: '500' },
  semiBold: { fontWeight: '600' },
  bold: { fontWeight: '700' },
  extraBold: { fontWeight: '800' },
};

// ── Spacing — 4px-based System ──────────────────────────────────
// 4 / 8 / 12 / 16 / 20 / 24 / 32
export const SPACING = {
  xs:  4,   // 4px  — micro spacing / tight icon gap
  sm:  8,   // 8px  — compact element padding / label gap
  md:  12,  // 12px — compact rows / button gaps
  lg:  16,  // 16px — standard screen padding & card gaps
  xl:  20,  // 20px — generous section gap
  xxl: 24,  // 24px — major section spacing
  '3xl': 32,// 32px — header spacing
  '4xl': 40,
  '5xl': 48,
};

// ── Border Radii ─────────────────────────────────────────────────
export const RADIUS = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  '2xl': 24,
  full: 999,
};

// ── Elevation / Shadow System ────────────────────────────────────
// Level 1 = resting card  Level 2 = raised  Level 3 = floating (FAB/modal)
export const SHADOW = {
  // Subtle resting state — card on background
  card: {
    shadowColor: PALETTE.forest900,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  // Elevated — dropdown, active state
  raised: {
    shadowColor: PALETTE.forest900,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  // Floating — FAB, sheet handle, bottom nav
  float: {
    shadowColor: PALETTE.forest900,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  // Modal / overlay surfaces
  modal: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 16,
  },
};

// ── Touch / Hit-slop ─────────────────────────────────────────────
// Minimum 44px targets for touch usability
export const TOUCH = {
  minHeight: 44,        // Minimum touch target
  minWidth: 44,
  standard: 48,         // Standard form inputs & buttons
  farmSafe: 52,         // Larger for outdoor/field use
  hitSlop: { top: 8, bottom: 8, left: 8, right: 8 },
};

// ── Z-Index Scale ─────────────────────────────────────────────────
export const Z = {
  base:    0,
  card:    10,
  sticky:  100,
  overlay: 200,
  modal:   300,
  toast:   400,
};

// ── Animation Configs ─────────────────────────────────────────────
export const ANIM = {
  spring: { tension: 68, friction: 12 },
  springFast: { tension: 100, friction: 14 },
  fade: { duration: 200 },
  slide: { duration: 250 },
};

// ── Approved HUGPONG Analytics Palette ────────────────────────────
// Consistent tonal green, sage, and neutral shades — NO random rainbow colors!
export const ANALYTICS_PALETTE = {
  // Agronomic Categories
  prep:    PALETTE.forest700, // Land Preparation (Deep forest)
  plant:   PALETTE.forest600, // Planting & Seedcane
  fert:    PALETTE.forest500, // Basal Fertilization
  weed:    PALETTE.sage500,   // Cultivation & Weeding (Sage/Olive)
  maint:   PALETTE.forest400, // Maintenance & Hilling-Up
  harvest: PALETTE.forest800, // Harvesting & Transport

  // Stage Tones (1 to 6)
  stage1:  PALETTE.forest700,
  stage2:  PALETTE.forest600,
  stage3:  PALETTE.forest500,
  stage4:  PALETTE.sage500,
  stage5:  PALETTE.forest400,
  stage6:  PALETTE.forest800,

  // Zero-value / Muted states
  zeroMuted: PALETTE.neutral300,
  zeroText:  PALETTE.neutral500,
  zeroBg:    PALETTE.neutral100,
};

// ── Shared Component Tokens ───────────────────────────────────────
// Pre-built style objects for commonly repeated patterns
export const TOKEN = {
  // Card base
  card: {
    backgroundColor: PALETTE.white,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.card,
  },

  // Standard Form Input
  input: {
    minHeight: 46,
    backgroundColor: PALETTE.white,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    fontSize: 15,
    color: COLORS.text,
  },

  // Buttons
  buttonPrimary: {
    minHeight: 46,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  buttonSecondary: {
    minHeight: 46,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primaryBg,
    borderWidth: 1.5,
    borderColor: COLORS.primaryBorder,
    paddingHorizontal: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  buttonDestructive: {
    minHeight: 46,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.dangerBg,
    borderWidth: 1,
    borderColor: COLORS.danger,
    paddingHorizontal: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  buttonGhost: {
    minHeight: 44,
    paddingHorizontal: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
  },

  // Pill badge
  badge: (bg, color) => ({
    backgroundColor: bg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  }),

  // Icon circle
  iconCircle: (size = 40, bg) => ({
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: bg || PALETTE.forest50,
    justifyContent: 'center',
    alignItems: 'center',
  }),

  // Row separator
  dividerRow: {
    borderTopWidth: 1,
    borderTopColor: PALETTE.neutral100,
  },

  // Section header text
  sectionHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: PALETTE.neutral800,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
};
