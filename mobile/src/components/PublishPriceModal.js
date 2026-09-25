// ══════════════════════════════════════════════════════════════
// HUGPONG Mobile — Post Official SRA Price Modal Component
// Synchronous parity with Web: PublishPriceModal.jsx
// Role: SRA Admin Weekly Benchmark Broadcast
// ══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW } from '../theme';
import { calculateSRAWeekLabel, publishSraPrice, getSortedPrices } from '../data/dataStore';

function formatDateIso(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function PublishPriceModal({
  visible = false,
  onClose,
  latestPrice = null,
  onPublished
}) {
  const today = useMemo(() => formatDateIso(new Date()), []);

  const [effectiveDate, setEffectiveDate] = useState(today);
  const [weekLabel, setWeekLabel] = useState('');
  const [sugarPrice, setSugarPrice] = useState('');
  const [molassesPrice, setMolassesPrice] = useState('');
  const [circularNumber, setCircularNumber] = useState('');
  const [source, setSource] = useState('Official SRA Sugar & Molasses Price Monitor');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Calendar picker state
  const [showCalendar, setShowCalendar] = useState(false);
  const [calDate, setCalDate] = useState(new Date());

  // Derive previous latest benchmark prices
  const fallbackLatest = useMemo(() => {
    if (latestPrice) return latestPrice;
    const sorted = getSortedPrices();
    return sorted.length > 0 ? sorted[0] : null;
  }, [latestPrice, visible]);

  const prevSugar = fallbackLatest?.sugarPricePerLkg != null ? Number(fallbackLatest.sugarPricePerLkg) : null;
  const prevMolasses = fallbackLatest?.molassesPricePerMetricTon != null ? Number(fallbackLatest.molassesPricePerMetricTon) : null;

  // Initialize or reset form values when opening
  useEffect(() => {
    if (visible) {
      const nowIso = formatDateIso(new Date());
      setEffectiveDate(nowIso);
      setWeekLabel(calculateSRAWeekLabel(nowIso));
      setSugarPrice(prevSugar != null ? String(prevSugar) : '');
      setMolassesPrice(prevMolasses != null ? String(prevMolasses) : '');
      setCircularNumber('');
      setSource('Official SRA Sugar & Molasses Price Monitor');
      setFormError(null);
      setSuccessMessage(null);
      setIsSubmitting(false);
      setShowCalendar(false);
      setCalDate(new Date());
    }
  }, [visible, prevSugar, prevMolasses]);

  const handleDateSelect = (selectedIso) => {
    setEffectiveDate(selectedIso);
    setWeekLabel(calculateSRAWeekLabel(selectedIso));
    setShowCalendar(false);
  };

  // Derive variance vs previous latest price (identical to web)
  const curSugarNum = sugarPrice !== '' ? Number(sugarPrice) : NaN;
  const curMolassesNum = molassesPrice !== '' ? Number(molassesPrice) : NaN;

  const sugarChange = !isNaN(curSugarNum) && prevSugar !== null ? curSugarNum - prevSugar : 0;
  const molassesChange = !isNaN(curMolassesNum) && prevMolasses !== null ? curMolassesNum - prevMolasses : 0;

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setFormError(null);
    setSuccessMessage(null);

    // Strict validation matching web PublishPriceModal.jsx
    if (!effectiveDate) {
      setFormError('Effective Date is required.');
      return;
    }
    const parsedDate = new Date(`${effectiveDate}T00:00:00.000Z`);
    const canonicalDate = /^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)
      && !Number.isNaN(parsedDate.getTime())
      && parsedDate.toISOString().slice(0, 10) === effectiveDate;

    if (!canonicalDate) {
      setFormError('Effective Date must be a valid date in YYYY-MM-DD format.');
      return;
    }
    if (!weekLabel.trim()) {
      setFormError('SRA Week Label is required.');
      return;
    }
    if (isNaN(curSugarNum) || curSugarNum <= 0) {
      setFormError('Raw Sugar price must be a valid positive number.');
      return;
    }
    if (isNaN(curMolassesNum) || curMolassesNum <= 0) {
      setFormError('Molasses price must be a valid positive number.');
      return;
    }
    if (!circularNumber.trim()) {
      setFormError('Official Circular / Reference Number is required.');
      return;
    }
    if (!source.trim()) {
      setFormError('Official Source description is required.');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        effectiveDate,
        weekLabel: weekLabel.trim(),
        sugarPricePerLkg: curSugarNum,
        sugarPriceChange: sugarChange,
        molassesPricePerMetricTon: curMolassesNum,
        molassesPriceChange: molassesChange,
        circularNumber: circularNumber.trim(),
        source: source.trim()
      };

      const result = await publishSraPrice(payload);
      setSuccessMessage('Official SRA price posted successfully.');
      if (typeof onPublished === 'function') {
        onPublished(result);
      }
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err) {
      setFormError(err.message || 'An error occurred while publishing the circular.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
        <SafeAreaView style={s.modalScreen}>
          <KeyboardAvoidingView
            style={s.keyboardView}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={s.modalCard}>
            {/* Header with Regulatory Badge & Icon */}
            <View style={s.modalHeader}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <View style={s.modalBadge}>
                  <Text style={s.modalBadgeText}>SRA ADMIN</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <Ionicons name="trending-up" size={20} color={COLORS.primary} />
                  <Text style={s.modalTitle}>Post Official SRA Price</Text>
                </View>
                <Text style={s.modalSub}>
                  Broadcast weekly domestic millsite sugar and molasses prices.
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} style={s.closeBtn} disabled={isSubmitting}>
                <Ionicons name="close" size={22} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={s.formScroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerStyle={s.formContent}
            >
              {/* Form Error Banner */}
              {formError && (
                <View style={s.errorBanner}>
                  <Ionicons name="alert-circle" size={16} color={COLORS.danger} style={{ marginTop: 1 }} />
                  <Text style={s.errorText}>{formError}</Text>
                </View>
              )}

              {/* Success Banner */}
              {successMessage && (
                <View style={s.successBanner}>
                  <Ionicons name="checkmark-circle" size={16} color={COLORS.primary} style={{ marginTop: 1 }} />
                  <Text style={s.successText}>{successMessage}</Text>
                </View>
              )}

              {/* Row 1: Effective Date & SRA Week Label */}
              <View style={s.rowTwoCol}>
                {/* Effective Date with Calendar Picker Button */}
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>
                    Effective Date <Text style={{ color: COLORS.danger }}>*</Text>
                  </Text>
                  <TouchableOpacity
                    style={s.datePickerBtn}
                    onPress={() => {
                      if (!isSubmitting) setShowCalendar(true);
                    }}
                    activeOpacity={0.7}
                    disabled={isSubmitting}
                  >
                    <Text style={s.datePickerText}>{effectiveDate}</Text>
                    <Ionicons name="calendar-outline" size={18} color={COLORS.primary} />
                  </TouchableOpacity>
                  <Text style={s.helperText}>Date circular takes millsite effect</Text>
                </View>

                {/* SRA Week Label */}
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>
                    SRA Week Label <Text style={{ color: COLORS.danger }}>*</Text>
                  </Text>
                  <TextInput
                    style={s.input}
                    value={weekLabel}
                    onChangeText={setWeekLabel}
                    editable={!isSubmitting}
                    placeholder="e.g. Week 3, September 2026"
                    placeholderTextColor={COLORS.textDisabled}
                  />
                  <Text style={s.helperText}>Official reporting period title</Text>
                </View>
              </View>

              {/* Row 2: Raw Sugar Price & Industrial Molasses Price */}
              <View style={s.rowTwoCol}>
                {/* Raw Sugar Price */}
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>
                    Raw Sugar Price <Text style={{ color: COLORS.danger }}>*</Text>
                  </Text>
                  <View style={s.inputWithAffixes}>
                    <Text style={s.prefixText}>₱</Text>
                    <TextInput
                      style={s.affixInput}
                      value={sugarPrice}
                      onChangeText={setSugarPrice}
                      editable={!isSubmitting}
                      keyboardType="numeric"
                      placeholder="e.g. 2950"
                      placeholderTextColor={COLORS.textDisabled}
                    />
                    <Text style={s.suffixText}>/ Lkg</Text>
                  </View>
                  <Text style={s.helperText}>
                    {prevSugar !== null ? (
                      <Text>
                        Prev: ₱{prevSugar.toLocaleString()} ·{' '}
                        <Text style={{
                          color: sugarChange > 0 ? COLORS.success : sugarChange < 0 ? COLORS.danger : COLORS.textMuted,
                          fontWeight: '800'
                        }}>
                          {sugarChange > 0 ? `+₱${sugarChange.toLocaleString()}` : sugarChange < 0 ? `-₱${Math.abs(sugarChange).toLocaleString()}` : '₱0'}
                        </Text>
                      </Text>
                    ) : (
                      'Price per 50-kg Lkg bag'
                    )}
                  </Text>
                </View>

                {/* Industrial Molasses Price */}
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>
                    Industrial Molasses Price <Text style={{ color: COLORS.danger }}>*</Text>
                  </Text>
                  <View style={s.inputWithAffixes}>
                    <Text style={s.prefixText}>₱</Text>
                    <TextInput
                      style={s.affixInput}
                      value={molassesPrice}
                      onChangeText={setMolassesPrice}
                      editable={!isSubmitting}
                      keyboardType="numeric"
                      placeholder="e.g. 11500"
                      placeholderTextColor={COLORS.textDisabled}
                    />
                    <Text style={s.suffixText}>/ MT</Text>
                  </View>
                  <Text style={s.helperText}>
                    {prevMolasses !== null ? (
                      <Text>
                        Prev: ₱{prevMolasses.toLocaleString()} ·{' '}
                        <Text style={{
                          color: molassesChange > 0 ? COLORS.success : molassesChange < 0 ? COLORS.danger : COLORS.textMuted,
                          fontWeight: '800'
                        }}>
                          {molassesChange > 0 ? `+₱${molassesChange.toLocaleString()}` : molassesChange < 0 ? `-₱${Math.abs(molassesChange).toLocaleString()}` : '₱0'}
                        </Text>
                      </Text>
                    ) : (
                      'Price per Metric Ton'
                    )}
                  </Text>
                </View>
              </View>

              {/* Official Circular / Reference No. */}
              <View style={{ marginTop: 10 }}>
                <Text style={s.fieldLabel}>
                  Official Circular / Reference No. <Text style={{ color: COLORS.danger }}>*</Text>
                </Text>
                <View style={s.inputWithIcon}>
                  <Ionicons name="document-text-outline" size={17} color={COLORS.textMuted} style={{ marginRight: 8 }} />
                  <TextInput
                    style={{ flex: 1, fontSize: 13, color: COLORS.text, paddingVertical: 10 }}
                    value={circularNumber}
                    onChangeText={setCircularNumber}
                    editable={!isSubmitting}
                    placeholder="e.g. SRA-MD-2026-039"
                    placeholderTextColor={COLORS.textDisabled}
                  />
                </View>
                <Text style={s.helperText}>Official document reference code published by SRA</Text>
              </View>

              {/* Issuing Authority / Source */}
              <View style={{ marginTop: 10 }}>
                <Text style={s.fieldLabel}>
                  Issuing Authority / Source <Text style={{ color: COLORS.danger }}>*</Text>
                </Text>
                <TextInput
                  style={s.input}
                  value={source}
                  onChangeText={setSource}
                  editable={!isSubmitting}
                  placeholder="Official SRA Sugar & Molasses Price Monitor"
                  placeholderTextColor={COLORS.textDisabled}
                />
                <Text style={s.helperText}>Originating agency or millsite market monitoring division</Text>
              </View>
            </ScrollView>

            {/* Footer Buttons: Cancel + Post Official SRA Price */}
            <View style={s.modalActionRow}>
              <TouchableOpacity
                onPress={onClose}
                style={s.cancelBtn}
                disabled={isSubmitting}
              >
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.publishBtn, isSubmitting && { opacity: 0.7 }]}
                disabled={isSubmitting}
                onPress={handleSubmit}
                activeOpacity={0.8}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                )}
                <Text style={s.publishBtnText}>
                  {isSubmitting ? 'Posting official price...' : 'Post Official SRA Price'}
                </Text>
              </TouchableOpacity>
            </View>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ── Interactive Calendar Date Picker Modal ── */}
      <Modal visible={showCalendar} transparent animationType="fade" onRequestClose={() => setShowCalendar(false)}>
        <View style={s.calOverlay}>
          <View style={s.calModalCard}>
            {/* Calendar Header with Month & Year Navigation */}
            <View style={s.calHeader}>
              <TouchableOpacity
                style={s.calNavBtn}
                onPress={() => setCalDate(new Date(calDate.getFullYear(), calDate.getMonth() - 1, 1))}
              >
                <Ionicons name="chevron-back" size={20} color="#fff" />
              </TouchableOpacity>
              <View style={{ alignItems: 'center' }}>
                <Text style={s.calMonthTitle}>
                  {new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(calDate)}
                </Text>
                <Text style={s.calSubTitle}>Select Effective Circular Date</Text>
              </View>
              <TouchableOpacity
                style={s.calNavBtn}
                onPress={() => setCalDate(new Date(calDate.getFullYear(), calDate.getMonth() + 1, 1))}
              >
                <Ionicons name="chevron-forward" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Quick 1-Tap Preset Date Chips */}
            <View style={s.calPresetsRow}>
              {[
                { label: 'Today', offsetDays: 0 },
                { label: 'Yesterday', offsetDays: 1 },
                { label: '2 Days Ago', offsetDays: 2 },
              ].map(preset => (
                <TouchableOpacity
                  key={preset.label}
                  style={s.calPresetChip}
                  onPress={() => {
                    const d = new Date();
                    d.setDate(d.getDate() - preset.offsetDays);
                    handleDateSelect(formatDateIso(d));
                  }}
                  activeOpacity={0.75}
                >
                  <Text style={s.calPresetText}>{preset.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Day of Week Headers */}
            <View style={s.calGridContainer}>
              <View style={s.calWeekDaysRow}>
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((dayHeader, idx) => (
                  <Text key={dayHeader + idx} style={s.calWeekDayText}>{dayHeader}</Text>
                ))}
              </View>

              {/* Calendar Days Matrix */}
              <View style={s.calDaysMatrix}>
                {Array.from({ length: new Date(calDate.getFullYear(), calDate.getMonth(), 1).getDay() }).map((_, i) => (
                  <View key={`blank-${i}`} style={s.calDayCell} />
                ))}

                {Array.from({ length: new Date(calDate.getFullYear(), calDate.getMonth() + 1, 0).getDate() }).map((_, i) => {
                  const dayNum = i + 1;
                  const dayIso = `${calDate.getFullYear()}-${String(calDate.getMonth() + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                  const isSelected = effectiveDate === dayIso;
                  const now = new Date();
                  const isToday = calDate.getFullYear() === now.getFullYear() && calDate.getMonth() === now.getMonth() && dayNum === now.getDate();

                  return (
                    <TouchableOpacity
                      key={dayNum}
                      style={[
                        s.calDayCell,
                        s.calDayBtn,
                        isSelected && s.calDaySelected,
                        isToday && !isSelected && s.calDayToday
                      ]}
                      onPress={() => handleDateSelect(dayIso)}
                      activeOpacity={0.7}
                    >
                      <Text style={[
                        s.calDayText,
                        isSelected && s.calDayTextSelected,
                        isToday && !isSelected && s.calDayTextToday
                      ]}>
                        {dayNum}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Calendar Bottom Actions */}
            <View style={s.calActionRow}>
              <TouchableOpacity style={s.calCancelBtn} onPress={() => setShowCalendar(false)}>
                <Text style={s.calCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  modalScreen: {
    flex: 1,
    backgroundColor: '#fff'
  },
  keyboardView: {
    flex: 1
  },
  modalCard: {
    flex: 1,
    backgroundColor: '#fff',
    width: '100%'
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: SPACING.lg,
    paddingTop: 10,
    paddingBottom: 14
  },
  modalBadge: {
    backgroundColor: COLORS.primaryBg,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: RADIUS.full,
    alignSelf: 'flex-start'
  },
  modalBadgeText: {
    fontSize: 9.5,
    fontWeight: '900',
    color: COLORS.primary,
    letterSpacing: 0.6
  },
  modalTitle: {
    fontSize: 16.5,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: -0.2
  },
  modalSub: {
    fontSize: 11.5,
    color: COLORS.textMuted,
    marginTop: 2,
    lineHeight: 16
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F1',
    alignItems: 'center',
    justifyContent: 'center'
  },
  formScroll: {
    flex: 1
  },
  formContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: 4,
    paddingBottom: 24
  },

  errorBanner: {
    backgroundColor: COLORS.dangerBg,
    borderWidth: 1,
    borderColor: COLORS.danger + '40',
    borderRadius: RADIUS.md,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 10
  },
  errorText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: COLORS.danger,
    flex: 1,
    lineHeight: 16
  },
  successBanner: {
    backgroundColor: COLORS.primaryBg,
    borderWidth: 1,
    borderColor: COLORS.primary + '40',
    borderRadius: RADIUS.md,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 10
  },
  successText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: COLORS.primary,
    flex: 1,
    lineHeight: 16
  },

  rowTwoCol: {
    gap: 12,
    marginTop: 10
  },
  fieldLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 4
  },
  helperText: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 3,
    fontWeight: '500'
  },

  input: {
    backgroundColor: '#FAFBF8',
    borderWidth: 1.2,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 12.5,
    color: COLORS.text,
    fontWeight: '600'
  },
  datePickerBtn: {
    backgroundColor: '#FAFBF8',
    borderWidth: 1.2,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  datePickerText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: COLORS.text
  },

  inputWithAffixes: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAFBF8',
    borderWidth: 1.2,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    overflow: 'hidden'
  },
  prefixText: {
    paddingLeft: 10,
    paddingRight: 4,
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.primary
  },
  affixInput: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 4,
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '700'
  },
  suffixText: {
    paddingRight: 10,
    paddingLeft: 4,
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted
  },

  inputWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAFBF8',
    borderWidth: 1.2,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12
  },

  modalActionRow: {
    flexDirection: 'row',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: SPACING.lg,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: '#fff'
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F1'
  },
  cancelBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: COLORS.textSecondary
  },
  publishBtn: {
    flex: 1.8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    ...SHADOW.xs
  },
  publishBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#fff'
  },

  // Calendar Modal Styles
  calOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16
  },
  calModalCard: {
    width: 320,
    backgroundColor: '#fff',
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    ...SHADOW.lg,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  calHeader: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  calNavBtn: {
    padding: 6,
    borderRadius: RADIUS.sm,
    backgroundColor: 'rgba(255,255,255,0.18)'
  },
  calMonthTitle: {
    color: '#fff',
    fontSize: 15.5,
    fontWeight: '900',
    letterSpacing: 0.3
  },
  calSubTitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1
  },
  calPresetsRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#F8FAF5',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border
  },
  calPresetChip: {
    flex: 1,
    paddingVertical: 6,
    backgroundColor: '#fff',
    borderRadius: RADIUS.xs,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center'
  },
  calPresetText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary
  },
  calGridContainer: {
    padding: 14,
    paddingBottom: 10
  },
  calWeekDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  calWeekDayText: {
    width: 36,
    textAlign: 'center',
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '800'
  },
  calDaysMatrix: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 5,
    justifyContent: 'space-between'
  },
  calDayCell: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center'
  },
  calDayBtn: {
    borderRadius: 18
  },
  calDaySelected: {
    backgroundColor: COLORS.primary
  },
  calDayToday: {
    backgroundColor: '#E2EED9',
    borderWidth: 1.2,
    borderColor: COLORS.primary
  },
  calDayText: {
    fontSize: 12.5,
    color: COLORS.text,
    fontWeight: '600'
  },
  calDayTextSelected: {
    color: '#fff',
    fontWeight: '900'
  },
  calDayTextToday: {
    color: COLORS.primary,
    fontWeight: '800'
  },
  calActionRow: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: '#FAFAFA'
  },
  calCancelBtn: {
    paddingVertical: 12,
    alignItems: 'center'
  },
  calCancelText: {
    color: COLORS.textMuted,
    fontWeight: '700',
    fontSize: 12.5
  }
});
