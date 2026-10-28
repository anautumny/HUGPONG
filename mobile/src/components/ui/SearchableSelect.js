import React, { useState, useMemo } from 'react';
import { View, TouchableOpacity, FlatList, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW } from '../../theme';
import { AppText as Text, AppTextInput as TextInput } from '../Typography';
import AnimatedBottomSheet from '../AnimatedBottomSheet';
import { useExpandedSheet } from '../../context/ExpandedSheetContext';
import { hapticFeedback } from '../../utils/haptics';
import { paginate } from '../../utils/pagination';

export function SearchableSelectContent({
  onClose,
  options = [],
  selectedValue,
  onSelect,
  title = 'Select Option',
  subtitle,
  searchPlaceholder = 'Search options...',
  emptyMessage = 'No matching options found',
  enableSearch = true,
  closeLabel = 'Close selection',
  back = false,
  resetKey,
  pageSize = 5,
  expandedPageSize = 10,
  isExpanded: isExpandedProp,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const sheetContext = typeof useExpandedSheet === 'function' ? useExpandedSheet() : null;
  const isSheetExpanded = Boolean(isExpandedProp ?? sheetContext?.expanded ?? sheetContext?.isExpanded);
  const effectivePageSize = isSheetExpanded ? (expandedPageSize || 10) : (pageSize || 5);

  React.useEffect(() => {
    setSearchQuery('');
    setPage(1);
  }, [resetKey]);

  React.useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  const prevPageSizeRef = React.useRef(effectivePageSize);
  React.useEffect(() => {
    if (prevPageSizeRef.current !== effectivePageSize) {
      const prevSize = prevPageSizeRef.current;
      prevPageSizeRef.current = effectivePageSize;
      setPage(currentPage => {
        const firstVisibleIndex = (currentPage - 1) * prevSize;
        const newPage = Math.floor(firstVisibleIndex / effectivePageSize) + 1;
        return Math.max(1, newPage);
      });
    }
  }, [effectivePageSize]);

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

  const paged = useMemo(() => {
    return paginate(filteredOptions, page, effectivePageSize);
  }, [filteredOptions, page, effectivePageSize]);

  React.useEffect(() => {
    if (paged.totalPages >= 1 && page > paged.totalPages) {
      setPage(paged.totalPages);
    }
  }, [paged.totalPages, page]);

  const closeButton = (
    <TouchableOpacity
      onPress={onClose}
      style={styles.closeBtn}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      accessibilityRole="button"
      accessibilityLabel={closeLabel}
    >
      <Ionicons name={back ? 'arrow-back' : 'close'} size={22} color={COLORS.text} />
    </TouchableOpacity>
  );

  const searchInputRef = React.useRef(null);

  return (
    <>
          {/* Modal Header */}
          <View style={styles.sheetHeader}>
            {back ? (
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={closeLabel || 'Back'}
              >
                <Ionicons name="arrow-back" size={22} color={COLORS.text} />
              </TouchableOpacity>
            ) : null}
            <View style={{ flex: 1, paddingHorizontal: back ? 6 : 0, paddingRight: 8 }}>
              <Text style={styles.sheetTitle}>{title}</Text>
              {subtitle ? (
                <Text style={styles.sheetSubtitle}>{subtitle}</Text>
              ) : (
                <Text style={styles.sheetCountText}>
                  {filteredOptions.length} {filteredOptions.length === 1 ? 'item available' : 'items available'}
                </Text>
              )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {typeof sheetContext?.setExpanded === 'function' && (
                <TouchableOpacity
                  onPress={() => {
                    try { hapticFeedback.light(); } catch {}
                    sheetContext.setExpanded(prev => !prev);
                  }}
                  style={styles.circleCloseBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={isSheetExpanded ? 'Collapse list' : 'Expand list'}
                >
                  <Ionicons
                    name={isSheetExpanded ? 'contract-outline' : 'expand-outline'}
                    size={17}
                    color={COLORS.text}
                  />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={onClose}
                style={styles.circleCloseBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={20} color={COLORS.text} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Search Bar for Quick Filtering */}
          {enableSearch && normalizedOptions.length > 3 && (
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => searchInputRef.current?.focus()}
              style={styles.searchBox}
            >
              <Ionicons name="search" size={19} color={COLORS.textMuted} />
              <TextInput
                ref={searchInputRef}
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
            </TouchableOpacity>
          )}

          {/* Vertical Options Scroll List */}
          <FlatList
            style={[styles.optionsList, isSheetExpanded && styles.optionsListExpanded]}
            contentContainerStyle={[styles.optionsListContent, isSheetExpanded && styles.optionsListContentExpanded]}
            data={paged.items}
            keyExtractor={item => item.id}
            extraData={selectedValue}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            nestedScrollEnabled
            showsVerticalScrollIndicator
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Ionicons name="search-outline" size={36} color={COLORS.textMuted} />
                <Text style={styles.emptyText}>{emptyMessage}</Text>
              </View>
            }
            ListFooterComponent={
              paged.totalPages > 1 ? (
                <View style={[styles.paginationContainer, isSheetExpanded && styles.paginationContainerExpanded]}>
                  <Text style={styles.paginationSummary} accessibilityLiveRegion="polite">
                    {paged.start}–{paged.end} / {paged.total} items
                  </Text>
                  <View style={styles.paginationControls}>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel="Previous page of items"
                      accessibilityState={{ disabled: paged.page <= 1 }}
                      disabled={paged.page <= 1}
                      onPress={() => {
                        try { hapticFeedback.light(); } catch {}
                        setPage(p => Math.max(1, p - 1));
                      }}
                      style={[styles.paginationBtn, paged.page <= 1 && styles.paginationBtnDisabled]}
                    >
                      <Ionicons name="chevron-back" size={16} color={paged.page <= 1 ? '#94A3B8' : COLORS.primary} />
                      <Text style={[styles.paginationBtnText, paged.page <= 1 && styles.paginationBtnTextDisabled]}>Previous</Text>
                    </TouchableOpacity>
                    <Text style={styles.paginationPageText}>{paged.page} / {paged.totalPages}</Text>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel="Next page of items"
                      accessibilityState={{ disabled: paged.page >= paged.totalPages }}
                      disabled={paged.page >= paged.totalPages}
                      onPress={() => {
                        try { hapticFeedback.light(); } catch {}
                        setPage(p => Math.min(paged.totalPages, p + 1));
                      }}
                      style={[styles.paginationBtn, paged.page >= paged.totalPages && styles.paginationBtnDisabled]}
                    >
                      <Text style={[styles.paginationBtnText, paged.page >= paged.totalPages && styles.paginationBtnTextDisabled]}>Next</Text>
                      <Ionicons name="chevron-forward" size={16} color={paged.page >= paged.totalPages ? '#94A3B8' : COLORS.primary} />
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null
            }
            renderItem={({ item }) => {
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
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isSelected }}
                    accessibilityLabel={[item.label, item.sublabel].filter(Boolean).join(', ')}
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
                        >
                          {item.label}
                        </Text>
                        {Boolean(item.sublabel) && (
                          <Text
                            numberOfLines={2}
                            style={[
                              styles.optionSublabel,
                              isSelected && styles.optionSublabelSelected
                            ]}
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
              }}
          />
    </>
  );
}

export function SearchableSelectModal({ visible, onClose, ...props }) {
  return (
    <AnimatedBottomSheet
      dismissible
      expandable
      visible={visible}
      onClose={onClose}
      keyboardAvoiding
      backdropColor="rgba(0, 0, 0, 0.65)"
      sheetStyle={styles.sheetContainer}
    >
      <SearchableSelectContent {...props} resetKey={visible} onClose={onClose} />
    </AnimatedBottomSheet>
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
  onOpen,
  variant,
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
    if (selectedItem == null) return placeholder;
    if (typeof selectedItem === 'string' || typeof selectedItem === 'number') {
      return String(selectedItem);
    }
    return selectedItem.label || selectedItem.name || selectedItem.title
      || String(selectedItem.id ?? selectedItem.value ?? selectedItem.key ?? selectedItem.code ?? placeholder);
  }, [selectedItem, placeholder]);

  const displaySublabel = useMemo(() => {
    if (selectedItem == null || typeof selectedItem !== 'object') return null;
    return selectedItem.sublabel || selectedItem.subtitle || (selectedItem.ha ? `${selectedItem.ha} Ha` : null);
  }, [selectedItem]);

  if (variant === 'capsule') {
    const isLargeList = options.length > 5;
    const selectedId = String(selectedValue ?? '');

    // For lists > 5, show top 3 options + selected option (if outside top 3) + search capsule
    let capsulesToRender = options;
    if (isLargeList) {
      const topOptions = options.slice(0, 3);
      const isSelectedInTop = topOptions.some(opt => String(opt.id ?? opt.value ?? opt.key ?? opt) === selectedId);
      const activeOption = !isSelectedInTop
        ? options.find(opt => String(opt.id ?? opt.value ?? opt.key ?? opt) === selectedId)
        : null;
      capsulesToRender = activeOption ? [...topOptions, activeOption] : topOptions;
    }

    return (
      <View style={[styles.container, style]}>
        {Boolean(label) && (
          <View style={styles.capsuleSectionHeader}>
            {leftIcon && (
              <Ionicons
                name={leftIcon.endsWith('-outline') ? leftIcon : `${leftIcon}-outline`}
                size={14}
                color={COLORS.primary}
                style={{ marginRight: 6 }}
              />
            )}
            <Text style={styles.fieldLabel}>{label}</Text>
          </View>
        )}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.capsuleScroll}
        >
          {capsulesToRender.map((opt) => {
            const optId = String(opt.id ?? opt.value ?? opt.key ?? opt);
            const isSelected = selectedId === optId;
            const optLabel = opt.label || opt.name || opt.title || String(optId);
            return (
              <TouchableOpacity
                key={optId}
                style={[
                  styles.capsulePill,
                  isSelected && styles.capsulePillActive,
                  disabled && styles.capsulePillDisabled
                ]}
                onPress={() => {
                  hapticFeedback.light();
                  onSelect(opt.raw ?? opt);
                }}
                disabled={disabled}
                activeOpacity={0.65}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
              >
                {isSelected ? (
                  <View style={styles.capsuleCheckBadge}>
                    <Ionicons name="checkmark" size={12} color={COLORS.primary} />
                  </View>
                ) : (
                  <View style={styles.capsuleUnselectedDot} />
                )}
                <Text
                  style={[
                    styles.capsulePillText,
                    isSelected && styles.capsulePillTextActive
                  ]}
                >
                  {optLabel}
                </Text>
              </TouchableOpacity>
            );
          })}
          {isLargeList && (
            <TouchableOpacity
              style={[styles.capsulePillMore, disabled && styles.capsulePillDisabled]}
              onPress={() => {
                hapticFeedback.light();
                if (onOpen) {
                  onOpen({ options, selectedValue, onSelect, title: modalTitle || label || 'Select Option', subtitle, searchPlaceholder });
                } else {
                  setModalVisible(true);
                }
              }}
              disabled={disabled}
              activeOpacity={0.65}
              accessibilityRole="button"
              accessibilityLabel="View all options"
            >
              <Ionicons name="ellipsis-horizontal-circle-outline" size={15} color={COLORS.primary} style={{ marginRight: 5 }} />
              <Text style={styles.capsulePillMoreText}>
                View all
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
        {helperText && <Text style={styles.helperText}>{helperText}</Text>}
        {!onOpen && (
          <SearchableSelectModal
            visible={modalVisible}
            onClose={() => setModalVisible(false)}
            options={options}
            selectedValue={selectedValue}
            onSelect={onSelect}
            title={modalTitle || label}
            subtitle={subtitle}
            searchPlaceholder={searchPlaceholder}
          />
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      {Boolean(label) && <Text style={styles.fieldLabel}>{label}</Text>}
      <TouchableOpacity
        style={[
          styles.triggerBtn,
          triggerStyle,
          disabled && styles.triggerDisabled
        ]}
        onPress={() => {
          if (disabled) return;
          if (onOpen) {
            onOpen({ options, selectedValue, onSelect, title: modalTitle || label || 'Select Option', subtitle, searchPlaceholder });
          } else {
            setModalVisible(true);
          }
        }}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={[label, displayLabel].filter(Boolean).join(', ')}
        accessibilityState={{ disabled, expanded: modalVisible }}
        activeOpacity={0.75}
      >
        <View style={styles.triggerContent}>
          {leftIcon && (
            <Ionicons
              name={leftIcon}
              size={20}
              color={selectedItem != null ? COLORS.primary : COLORS.textMuted}
              style={styles.triggerLeftIcon}
            />
          )}
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text
              style={[
                styles.triggerText,
                selectedItem == null && styles.triggerPlaceholder
              ]}
            >
              {displayLabel}
            </Text>
            {displaySublabel && (
              <Text style={styles.triggerSubtext} numberOfLines={2}>
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
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 52,
  },
  triggerDisabled: {
    backgroundColor: '#F3F4F6',
    opacity: 0.6,
  },
  triggerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  triggerLeftIcon: {
    marginRight: 10,
  },
  triggerText: {
    flexShrink: 1,
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
    flexShrink: 1,
    fontSize: 12.5,
    fontWeight: '400',
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
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    maxHeight: '85%',
    paddingBottom: 12,
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
    gap: 8,
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
    width: 40,
    height: 40,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
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
    minHeight: 50,
    paddingVertical: 6,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
    fontWeight: '500',
  },
  optionsList: {
    flexGrow: 0,
    flexShrink: 1,
    minHeight: 0,
  },
  optionsListExpanded: {
    flex: 1,
    flexGrow: 1,
    flexShrink: 1,
  },
  optionsListContent: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: 8,
    gap: 8,
    paddingBottom: 20,
  },
  optionsListContentExpanded: {
    flexGrow: 1,
    paddingBottom: 28,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 56,
  },
  optionRowSelected: {
    backgroundColor: COLORS.primaryBg,
    borderColor: COLORS.primary,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  syncDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  optionLabel: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  optionLabelSelected: {
    fontWeight: '800',
    color: COLORS.primary,
  },
  optionSublabel: {
    flexShrink: 1,
    fontSize: 12.5,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  optionSublabelSelected: {
    color: COLORS.primaryLight,
    fontWeight: '600',
  },
  optionBadge: {
    maxWidth: '35%',
    flexShrink: 1,
    backgroundColor: COLORS.primaryBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.xs,
    marginRight: 8,
  },
  optionBadgeText: {
    flexShrink: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
  },
  radioBox: {
    flexShrink: 0,
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

  // Pagination
  paginationContainer: {
    gap: 8,
    paddingTop: 12,
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  paginationContainerExpanded: {
    marginTop: 'auto',
    paddingBottom: 10,
  },
  paginationSummary: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    fontWeight: '500',
  },
  paginationControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  paginationBtn: {
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: RADIUS.sm,
    borderWidth: 1.2,
    borderColor: COLORS.primaryBorder,
    backgroundColor: '#F8FAF5',
  },
  paginationBtnDisabled: {
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    opacity: 0.5,
  },
  paginationBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: COLORS.primary,
  },
  paginationBtnTextDisabled: {
    color: '#94A3B8',
  },
  paginationPageText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: COLORS.text,
    minWidth: 44,
    textAlign: 'center',
  },

  // Capsule Variant
  capsuleSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  capsuleScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  capsulePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    minHeight: 40,
    borderRadius: RADIUS.full,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#D4E2D0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.1,
    shadowRadius: 2.5,
    elevation: 2.5,
  },
  capsulePillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 3.5,
    elevation: 3.5,
  },
  capsuleUnselectedDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#A3BFA0',
    marginRight: 7,
  },
  capsuleCheckBadge: {
    width: 17,
    height: 17,
    borderRadius: 8.5,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  capsulePillText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: COLORS.text,
  },
  capsulePillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  capsulePillMore: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    minHeight: 40,
    borderRadius: RADIUS.full,
    backgroundColor: '#F5F9F3',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  capsulePillMoreText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.primary,
  },
  capsulePillDisabled: {
    opacity: 0.55,
  },
  sheetContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1.5,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 24,
  },
});
