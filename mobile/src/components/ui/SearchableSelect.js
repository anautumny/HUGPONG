import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  StyleSheet,
  Platform,
  KeyboardAvoidingView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW } from '../../theme';

export function SearchableSelectModal({
  visible,
  onClose,
  options = [],
  selectedValue,
  onSelect,
  title = 'Select Option',
  subtitle,
  searchPlaceholder = 'Search options...',
  emptyMessage = 'No matching options found',
  enableSearch = true,
}) {
  const [searchQuery, setSearchQuery] = useState('');

  // Reset search when modal opens/closes
  React.useEffect(() => {
    if (visible) {
      setSearchQuery('');
    }
  }, [visible]);

  // Normalize options to a uniform structure
  const normalizedOptions = useMemo(() => {
    return options.map(opt => {
      if (typeof opt === 'string' || typeof opt === 'number') {
        return { id: String(opt), label: String(opt), raw: opt };
      }
      const idVal = opt.id ?? opt.value ?? opt.key ?? opt.code ?? '';
      return {
        id: String(idVal),
        label: opt.label || opt.name || opt.title || String(idVal) || '',
        sublabel: opt.sublabel || opt.subtitle || opt.description || (opt.ha ? `${opt.ha} Ha` : '') || '',
        badge: opt.badge,
        badgeColor: opt.badgeColor,
        icon: opt.icon,
        isSynced: opt.isSynced,
        raw: opt,
      };
    });
  }, [options]);

  const filteredOptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return normalizedOptions;
    return normalizedOptions.filter(opt =>
      opt.label.toLowerCase().includes(q) ||
      (opt.sublabel && opt.sublabel.toLowerCase().includes(q)) ||
      opt.id.toLowerCase().includes(q)
    );
  }, [normalizedOptions, searchQuery]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.sheetContainer}>
          {/* Drag Handle Indicator */}
          <View style={styles.handleBar} />

          {/* Modal Header */}
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.sheetTitle}>{title}</Text>
              {subtitle ? (
                <Text style={styles.sheetSubtitle}>{subtitle}</Text>
              ) : (
                <Text style={styles.sheetCountText}>
                  {filteredOptions.length} {filteredOptions.length === 1 ? 'item available' : 'items available'}
                </Text>
              )}
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Close selection"
            >
              <Ionicons name="close-circle" size={26} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Search Bar for Quick Filtering */}
          {enableSearch && normalizedOptions.length > 3 && (
            <View style={styles.searchBox}>
              <Ionicons name="search" size={19} color={COLORS.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder={searchPlaceholder}
                placeholderTextColor={COLORS.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Vertical Options Scroll List */}
          <ScrollView
            style={styles.optionsList}
            contentContainerStyle={styles.optionsListContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
          >
            {filteredOptions.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="search-outline" size={36} color={COLORS.textMuted} />
                <Text style={styles.emptyText}>{emptyMessage}</Text>
              </View>
            ) : (
              filteredOptions.map((item) => {
                const isSelected = String(selectedValue ?? '') === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.optionRow,
                      isSelected && styles.optionRowSelected
                    ]}
                    onPress={() => {
                      onSelect(item.raw ?? item);
                      onClose();
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.optionLeft}>
                      {item.isSynced !== undefined && (
                        <View
                          style={[
                            styles.syncDot,
                            { backgroundColor: item.isSynced ? COLORS.success : '#C97A00' }
                          ]}
                        />
                      )}
                      {item.icon && (
                        <Ionicons
                          name={item.icon}
                          size={20}
                          color={isSelected ? COLORS.primary : COLORS.textMuted}
                          style={{ marginRight: 10 }}
                        />
                      )}
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text
                          style={[
                            styles.optionLabel,
                            isSelected && styles.optionLabelSelected
                          ]}
                          numberOfLines={2}
                        >
                          {item.label}
                        </Text>
                        {Boolean(item.sublabel) && (
                          <Text
                            style={[
                              styles.optionSublabel,
                              isSelected && styles.optionSublabelSelected
                            ]}
                            numberOfLines={1}
                          >
                            {item.sublabel}
                          </Text>
                        )}
                      </View>
                    </View>

                    {item.badge && (
                      <View style={[styles.optionBadge, item.badgeColor ? { backgroundColor: item.badgeColor } : null]}>
                        <Text style={styles.optionBadgeText}>{item.badge}</Text>
                      </View>
                    )}

                    <View style={styles.radioBox}>
                      {isSelected ? (
                        <Ionicons name="checkmark-circle" size={24} color={COLORS.primary} />
                      ) : (
                        <View style={styles.radioUnchecked} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function SearchableSelect({
  label,
  options = [],
  selectedValue,
  onSelect,
  placeholder = 'Select option...',
  modalTitle,
  subtitle,
  searchPlaceholder,
  icon = 'chevron-down',
  leftIcon,
  style,
  triggerStyle,
  disabled = false,
  helperText,
}) {
  const [modalVisible, setModalVisible] = useState(false);

  // Derive selected item label
  const selectedItem = useMemo(() => {
    const sId = String(selectedValue ?? '');
    return options.find(opt => {
      if (typeof opt === 'string' || typeof opt === 'number') {
        return String(opt) === sId;
      }
      const idVal = opt.id ?? opt.value ?? opt.key ?? opt.code ?? '';
      return String(idVal) === sId;
    });
  }, [options, selectedValue]);

  const displayLabel = useMemo(() => {
    if (!selectedItem) return placeholder;
    if (typeof selectedItem === 'string' || typeof selectedItem === 'number') {
      return String(selectedItem);
    }
    return selectedItem.label || selectedItem.name || selectedItem.title || selectedItem.id || placeholder;
  }, [selectedItem, placeholder]);

  const displaySublabel = useMemo(() => {
    if (!selectedItem || typeof selectedItem !== 'object') return null;
    return selectedItem.sublabel || selectedItem.subtitle || (selectedItem.ha ? `${selectedItem.ha} Ha` : null);
  }, [selectedItem]);

  return (
    <View style={[styles.container, style]}>
      {Boolean(label) && <Text style={styles.fieldLabel}>{label}</Text>}
      <TouchableOpacity
        style={[
          styles.triggerBtn,
          triggerStyle,
          disabled && styles.triggerDisabled
        ]}
        onPress={() => !disabled && setModalVisible(true)}
        activeOpacity={0.75}
      >
        <View style={styles.triggerContent}>
          {leftIcon && (
            <Ionicons
              name={leftIcon}
              size={20}
              color={selectedItem ? COLORS.primary : COLORS.textMuted}
              style={styles.triggerLeftIcon}
            />
          )}
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text
              style={[
                styles.triggerText,
                !selectedItem && styles.triggerPlaceholder
              ]}
              numberOfLines={1}
            >
              {displayLabel}
            </Text>
            {displaySublabel && (
              <Text style={styles.triggerSubtext} numberOfLines={1}>
                {displaySublabel}
              </Text>
            )}
          </View>
        </View>
        <View style={styles.chevronBox}>
          <Ionicons name={icon} size={18} color={COLORS.textMuted} />
        </View>
      </TouchableOpacity>
      {Boolean(helperText) && <Text style={styles.helperText}>{helperText}</Text>}

      <SearchableSelectModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        options={options}
        selectedValue={selectedValue}
        onSelect={onSelect}
        title={modalTitle || label || 'Select Option'}
        subtitle={subtitle}
        searchPlaceholder={searchPlaceholder}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.md,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  triggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 52,
    ...SHADOW.card,
  },
  triggerDisabled: {
    backgroundColor: '#F3F4F6',
    opacity: 0.6,
  },
  triggerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  triggerLeftIcon: {
    marginRight: 10,
  },
  triggerText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.2,
  },
  triggerPlaceholder: {
    fontWeight: '500',
    color: COLORS.textMuted,
  },
  triggerSubtext: {
    fontSize: 12.5,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginTop: 2,
  },
  chevronBox: {
    paddingLeft: 6,
  },
  helperText: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 4,
    paddingHorizontal: 2,
  },

  // Modal Sheet Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    flex: 1,
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    maxHeight: '82%',
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    ...SHADOW.lg,
  },
  handleBar: {
    width: 44,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  sheetSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  sheetCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primaryLight,
    marginTop: 2,
  },
  closeBtn: {
    padding: 2,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAF5',
    borderWidth: 1.5,
    borderColor: COLORS.primaryBorder,
    borderRadius: RADIUS.md,
    marginHorizontal: SPACING.lg,
    marginTop: 12,
    marginBottom: 6,
    paddingHorizontal: 12,
    height: 48,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
    fontWeight: '500',
  },
  optionsList: {
    maxHeight: 400,
  },
  optionsListContent: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: 8,
    gap: 8,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 56,
  },
  optionRowSelected: {
    backgroundColor: COLORS.primaryBg,
    borderColor: COLORS.primary,
    borderWidth: 1.5,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  syncDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  optionLabelSelected: {
    fontWeight: '800',
    color: COLORS.primary,
  },
  optionSublabel: {
    fontSize: 12.5,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  optionSublabelSelected: {
    color: COLORS.primaryLight,
    fontWeight: '600',
  },
  optionBadge: {
    backgroundColor: COLORS.primaryBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.xs,
    marginRight: 8,
  },
  optionBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
  },
  radioBox: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioUnchecked: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    gap: 10,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
});
