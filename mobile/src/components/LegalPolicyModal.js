import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING } from '../theme';
import legalPolicy from '../domain/legalPolicy.json';

const DOCUMENTS = [
  { key: 'privacy', label: 'Privacy' },
  { key: 'terms', label: 'Terms' },
  { key: 'compliance', label: 'Compliance' },
];

export default function LegalPolicyModal({ visible, onClose }) {
  const [activeDocument, setActiveDocument] = useState('privacy');
  const document = legalPolicy[activeDocument];

  useEffect(() => {
    if (visible) setActiveDocument('privacy');
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>Legal Information</Text>
            <Text style={styles.headerSubtitle}>
              Effective {legalPolicy.effectiveDate} | Version {legalPolicy.version}
            </Text>
          </View>
          <TouchableOpacity
            accessibilityLabel="Close legal information"
            accessibilityRole="button"
            onPress={onClose}
            style={styles.closeButton}
          >
            <Ionicons name="close" size={23} color={COLORS.text} />
          </TouchableOpacity>
        </View>

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
              >
                <Text style={[styles.tabText, selected && styles.tabTextSelected]}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <ScrollView key={activeDocument} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.documentHeader}>
            <Text style={styles.badge}>{document.badge}</Text>
            <Text style={styles.documentTitle}>{document.title}</Text>
            <Text style={styles.documentSubtitle}>{document.subtitle}</Text>
          </View>

          {document.sections.map(section => (
            <View key={section.heading} style={styles.section}>
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

          <View style={styles.notice}>
            <Text style={styles.noticeText}>Use the in-app Support Desk for account, privacy, or policy questions.</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    minHeight: 72,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerCopy: { flex: 1 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  headerSubtitle: { fontSize: 11.5, lineHeight: 17, color: COLORS.textMuted, marginTop: 2 },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F7F3',
  },
  tabs: {
    flexDirection: 'row',
    margin: SPACING.md,
    padding: 4,
    borderRadius: RADIUS.lg,
    backgroundColor: '#F3F6F1',
  },
  tab: {
    flex: 1,
    minHeight: 42,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.md,
  },
  tabSelected: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: COLORS.border },
  tabText: { fontSize: 12.5, fontWeight: '700', color: COLORS.textMuted },
  tabTextSelected: { color: COLORS.primary },
  content: { paddingHorizontal: SPACING.lg, paddingBottom: 48 },
  documentHeader: { paddingTop: 4, paddingBottom: SPACING.lg, gap: 7 },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#EDF5E9',
    color: COLORS.primary,
    fontSize: 10.5,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  documentTitle: { fontSize: 23, lineHeight: 29, fontWeight: '800', color: COLORS.text },
  documentSubtitle: { fontSize: 13, lineHeight: 19, color: COLORS.textSecondary },
  section: { paddingVertical: SPACING.md, borderTopWidth: 1, borderTopColor: '#E9EDE7', gap: 8 },
  sectionHeading: { fontSize: 15, lineHeight: 21, fontWeight: '800', color: COLORS.text },
  bodyText: { fontSize: 13, lineHeight: 20, color: COLORS.textSecondary },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bullet: { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.primary, marginTop: 7 },
  bulletText: { flex: 1 },
  notice: {
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: '#F8FAF7',
  },
  noticeText: { fontSize: 12, lineHeight: 18, color: COLORS.textSecondary, fontWeight: '600' },
});
