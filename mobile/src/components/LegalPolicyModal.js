import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SHADOW, SPACING } from '../theme';
import legalPolicy from '../domain/legalPolicy.json';

const DOCUMENTS = [
  { key: 'privacy', label: 'Privacy' },
  { key: 'terms', label: 'Terms' },
  { key: 'compliance', label: 'Compliance' },
];

export default function LegalPolicyModal({ visible = true, onClose }) {
  const [activeDocument, setActiveDocument] = useState('privacy');
  const document = legalPolicy[activeDocument];

  useEffect(() => {
    if (visible) setActiveDocument('privacy');
  }, [visible]);

  if (!visible) return null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Standard Header matching My Sync Status */}
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityLabel="Back"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Legal Information</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            Effective {legalPolicy.effectiveDate} · Version {legalPolicy.version}
          </Text>
        </View>
        <View style={{ width: 38 }} />
      </View>

      {/* Segmented Document Switcher */}
      <View style={styles.tabsWrap}>
        <View style={styles.tabs} accessibilityRole="tablist">
          {DOCUMENTS.map(item => {
            const selected = activeDocument === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setActiveDocument(item.key)}
                style={[styles.tab, selected && styles.tabSelected]}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabText, selected && styles.tabTextSelected]}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <ScrollView key={activeDocument} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Document Header Card */}
        <View style={styles.card}>
          <View style={styles.badgeWrap}>
            <Text style={styles.badge}>{document.badge}</Text>
          </View>
          <Text style={styles.documentTitle}>{document.title}</Text>
          <Text style={styles.documentSubtitle}>{document.subtitle}</Text>
        </View>

        {/* Document Sections in Cards */}
        {document.sections.map(section => (
          <View key={section.heading} style={styles.card}>
            <Text style={styles.sectionHeading}>{section.heading}</Text>
            {section.paragraphs?.map(paragraph => (
              <Text key={paragraph} style={styles.bodyText}>{paragraph}</Text>
            ))}
            {section.bullets?.map(item => (
              <View key={item} style={styles.bulletRow}>
                <View style={styles.bullet} />
                <Text style={[styles.bodyText, styles.bulletText]}>{item}</Text>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.noticeCard}>
          <Ionicons name="information-circle-outline" size={20} color={COLORS.primary} style={{ marginTop: 1 }} />
          <Text style={styles.noticeText}>Use the in-app Support Desk for account, privacy, or policy questions.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    minHeight: 64,
    paddingHorizontal: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.sm,
    backgroundColor: '#F8FAF5',
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
  tabsWrap: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: 10,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tabs: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.background,
    gap: 4,
  },
  tab: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.sm,
  },
  tabSelected: {
    backgroundColor: COLORS.surface,
    ...SHADOW.card,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  tabTextSelected: {
    color: COLORS.primaryDark,
    fontWeight: '800',
  },
  content: {
    padding: SPACING.lg,
    paddingBottom: 48,
    gap: SPACING.md,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
    ...SHADOW.card,
  },
  badgeWrap: {
    alignSelf: 'flex-start',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryBg,
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  documentTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: 2,
  },
  documentSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textSecondary,
  },
  sectionHeading: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 2,
  },
  bodyText: {
    fontSize: 13.5,
    lineHeight: 20,
    color: COLORS.textSecondary,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 2,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
    marginTop: 7,
  },
  bulletText: {
    flex: 1,
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    backgroundColor: '#F8FAF5',
  },
  noticeText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
});
