import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import AnimatedBottomSheet from './AnimatedBottomSheet';
import { SearchableSelect, SearchableSelectContent } from './ui/SearchableSelect';
import { PrimaryButton, SecondaryButton } from './ui';
import { AppText as Text } from './Typography';
import { COLORS } from '../theme';
import { useTranslation } from '../services/i18n';

export default function ArchiveFilters({ visible, onClose, filters, onApply, cropYears, fields, operations }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(filters);
  const [picker, setPicker] = useState(null);
  useEffect(() => { if (visible) setDraft(filters); setPicker(null); }, [visible]);
  const update = key => item => setDraft(value => ({ ...value, [key]: item.id }));
  return <AnimatedBottomSheet visible={visible} onClose={() => picker ? setPicker(null) : onClose()} dismissible expandable keyboardAvoiding sheetStyle={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' }}>
    {picker ? <SearchableSelectContent {...picker} back onClose={() => setPicker(null)} closeLabel={t('sheet_back_filters', 'Back to filters')} /> : <>
      <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.text, paddingHorizontal: 20, paddingBottom: 12 }}>{t('sheet_past_cycles', 'Filter past cycles')}</Text>
      <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: 20 }} keyboardShouldPersistTaps="handled">
        <SearchableSelect onOpen={setPicker} label={t('sheet_crop_year', 'Crop year')} options={[{ id: '', label: t('sheet_all_years', 'All crop years') }, ...cropYears.map(year => ({ id: year, label: year }))]} selectedValue={draft.cropYearCycle} onSelect={update('cropYearCycle')} />
        <SearchableSelect onOpen={setPicker} label={t('sheet_plot', 'Plot')} options={[{ id: '', label: t('sheet_all_plots', 'All plots') }, ...fields.map(field => ({ id: field.id, label: field.id, sublabel: field.memberName || field.farmerName }))]} selectedValue={draft.fieldId} onSelect={update('fieldId')} />
        <SearchableSelect onOpen={setPicker} label={t('sheet_operation', 'Operation')} options={[{ id: '', label: t('sheet_all_operations', 'All operations') }, ...operations.map(op => ({ id: op.id, label: op.name, sublabel: `${t('sheet_stage', 'Stage')} ${op.stageNumber}` }))]} selectedValue={draft.operationDefinitionId} onSelect={update('operationDefinitionId')} />
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 10, padding: 20 }}>
        <SecondaryButton title={t('sheet_reset', 'Reset')} onPress={() => setDraft(value => ({ ...value, cropYearCycle: '', fieldId: '', operationDefinitionId: '' }))} style={{ flex: 1 }} />
        <PrimaryButton title={t('sheet_apply', 'Apply filters')} onPress={() => { onApply(draft); onClose(); }} style={{ flex: 2 }} />
      </View>
    </>}
  </AnimatedBottomSheet>;
}
