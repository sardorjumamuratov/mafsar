import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';
import { useTheme } from '../theme/useTheme';

// Small shared building blocks, styled from the design tokens so every screen
// matches the extension's look (theme/tokens.ts mirrors panel.css).

type Variant = 'primary' | 'ghost' | 'danger';

export function Button({
  title, onPress, variant = 'primary', disabled, loading, style, accessibilityHint,
}: {
  title: string; onPress: () => void; variant?: Variant; disabled?: boolean; loading?: boolean;
  style?: StyleProp<ViewStyle>; accessibilityHint?: string;
}) {
  const t = useTheme();
  const off = disabled || loading;
  const bg = variant === 'primary' ? t.colors.primary : variant === 'danger' ? t.colors.danger : t.colors.surface;
  const fg = variant === 'ghost' ? t.colors.ink : t.colors.surface;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, borderColor: variant === 'ghost' ? t.colors.border : bg, borderRadius: t.radii.md },
        { opacity: off ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.btnText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View style={[styles.panel, { backgroundColor: t.colors.surface, borderColor: t.colors.border, borderRadius: t.radii.lg }, style]}>
      {children}
    </View>
  );
}

export function SectionLabel({ children }: { children: string }) {
  const t = useTheme();
  return <Text style={[styles.label, { color: t.colors.faint }]} accessibilityRole="header">{children.toUpperCase()}</Text>;
}

export function ErrorText({ children }: { children: string | null }) {
  const t = useTheme();
  if (!children) return null;
  return <Text style={[styles.error, { color: t.colors.danger }]} accessibilityLiveRegion="polite">{children}</Text>;
}

export function ProgressBar({ pct }: { pct: number }) {
  const t = useTheme();
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <View
      style={[styles.bar, { backgroundColor: t.colors.surface2 }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: clamped }}
    >
      <View style={{ width: `${clamped}%`, height: '100%', backgroundColor: t.colors.primary, borderRadius: 4 }} />
    </View>
  );
}

export function Loading() {
  const t = useTheme();
  return (
    <View style={[styles.center, { backgroundColor: t.colors.bg }]}>
      <ActivityIndicator color={t.colors.primary} />
    </View>
  );
}

export const styles = StyleSheet.create({
  btn: { minHeight: 50, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  btnText: { fontSize: 17, fontWeight: '600' },
  panel: { padding: 16, borderWidth: 1 },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 },
  error: { fontSize: 15, lineHeight: 21, marginTop: 4 },
  bar: { height: 8, borderRadius: 4, overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
