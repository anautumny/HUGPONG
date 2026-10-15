import React, { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING } from '../theme';
import { AppText as Text } from './Typography';
import { SearchableSelect, ScreenHeader } from './ui';
import { getNetworkStatus, subscribeToNetwork } from '../services/networkService';
import { fetchCropYearOptions, previewCropYear, fetchCropYearCompilations, compileCropYear, exportCropYearCompilation } from '../services/cropYearCompilationService';

const money = value => `PHP ${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function CropYearCompilationScreen({ onClose }) {
  const [options, setOptions] = useState(null);
  const [cropYearCycle, setYear] = useState('');
  const [blockFarmId, setFarm] = useState('');
  const [preview, setPreview] = useState(null);
  const [current, setCurrent] = useState(null);
  const [history, setHistory] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [optionsBusy, setOptionsBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [online, setOnline] = useState(getNetworkStatus());
  useEffect(() => subscribeToNetwork(setOnline), []);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { if (!saving) onClose(); return true; });
    return () => subscription.remove();
  }, [onClose, saving]);
  useEffect(() => {
    if (!online) { setOptionsBusy(false); return undefined; }
    let active = true;
    setOptionsBusy(true); setError('');
    fetchCropYearOptions().then(response => {
      if (!active) return;
      setOptions(response.data); setYear(year => year || response.data.cropYearCycles[0] || '');
    }).catch(reason => { if (active) setError(reason.message); })
      .finally(() => { if (active) setOptionsBusy(false); });
    return () => { active = false; };
  }, [online, reload]);
  useEffect(() => {
    if (!cropYearCycle || !online) { setBusy(false); return undefined; }
    let active = true;
    setBusy(true); setError(''); setPreview(null); setCurrent(null); setHistory([]); setCursor(null);
    Promise.all([previewCropYear({ cropYearCycle, blockFarmId }), fetchCropYearCompilations({ cropYearCycle, blockFarmId })])
      .then(([nextPreview, saved]) => {
        if (!active) return;
        setPreview(nextPreview.data); setHistory(saved.data); setCursor(saved.nextCursor);
      }).catch(reason => { if (active) setError(reason.message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [cropYearCycle, blockFarmId, online, reload]);
  const save = async () => {
    setSaving(true); setError('');
    try {
      const response = await compileCropYear({ cropYearCycle, blockFarmId });
      setCurrent(response.data); setPreview(response.data);
      setHistory(rows => [response.data, ...rows.filter(row => row.id !== response.data.id)]);
    } catch (reason) { setError(reason.message); }
    finally { setSaving(false); }
  };
  const more = async () => {
    setSaving(true); setError('');
    try {
      const response = await fetchCropYearCompilations({ cropYearCycle, blockFarmId, cursor });
      setHistory(rows => [...rows, ...response.data.filter(row => !rows.some(existing => existing.id === row.id))]); setCursor(response.nextCursor);
    } catch (reason) { setError(reason.message); }
    finally { setSaving(false); }
  };
  const share = async () => {
    setSaving(true); setError('');
    try { await exportCropYearCompilation(current.id); }
    catch (reason) { setError(reason.message); }
    finally { setSaving(false); }
  };
  const report = current || preview;
  const loading = busy || optionsBusy;
  const disabled = saving || loading || !online;
  const button = (label, action, inactive = disabled, primary = false) => <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: inactive }} disabled={inactive} onPress={action} style={[s.button, primary && s.primary, inactive && { opacity: 0.45 }]}><Text style={[s.buttonText, primary && { color: '#fff' }]}>{label}</Text></TouchableOpacity>;

  return <SafeAreaView style={s.safe} edges={['top']}>
    <ScreenHeader title="Crop Year Compilations" subtitle="Certified monthly reports combined by crop year" onBackPress={saving ? undefined : onClose} />
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.copy}>Monthly certification continues as usual. Only certified operations from the selected crop year are included. Each operation and field is counted once.</Text>
      {!online && <Text style={s.error}>Connect to the internet to compile or retrieve Crop Year reports.</Text>}
      {!!error && <View accessibilityRole="alert" style={s.card}><Text style={s.error}>{error}</Text>{button('Retry', () => setReload(value => value + 1), saving || !online)}</View>}
      <View pointerEvents={disabled ? 'none' : 'auto'} style={disabled ? { opacity: 0.65 } : undefined}>
        <SearchableSelect label="Crop Year Cycle" options={(options?.cropYearCycles || []).map(year => ({ id: year, label: year }))} selectedValue={cropYearCycle} onSelect={item => setYear(item.id)} modalTitle="Select Crop Year" searchPlaceholder="Search crop year..." />
        <SearchableSelect label="Block Farm" options={[{ id: 'ALL', label: 'All Block Farms' }, ...(options?.blockFarms || []).map(farm => ({ id: farm.id, label: farm.name }))]} selectedValue={blockFarmId || 'ALL'} onSelect={item => setFarm(item.id === 'ALL' ? '' : item.id)} modalTitle="Select Block Farm" searchPlaceholder="Search Block Farm..." />
      </View>
      {loading && <ActivityIndicator color={COLORS.primary} accessibilityLabel="Loading certified reports" />}
      {!loading && options && !cropYearCycle && <Text style={s.copy}>No certified monthly reports with Crop Year data are available yet.</Text>}
      {!loading && report && <>
        <View style={s.card}>
          <Text style={s.title}>{current ? 'Saved compilation' : 'Current preview'} · {report.cropYearCycle}</Text>
          <Text style={s.copy}>{report.sourceReportCount} certified reports · {report.monthCount} reporting months · {report.blockFarmCount} Block Farms</Text>
          <Text style={s.copy}>{report.operationCount} operations · {report.fieldCount} fields · {report.memberCount} members · {report.hectaresAudited} ha</Text>
          <Text style={s.total}>{money(report.totalCost)}</Text>
          <Text style={s.note}>Certified reports to date. This does not declare that the crop year is complete. Area uses each field’s latest included monthly snapshot.</Text>
          {current && <Text style={s.note}>{current.id}{'\n'}Compiled {new Date(current.compiledAt).toLocaleString()} by {current.compiledByName}</Text>}
        </View>
        {button(saving ? 'Please wait…' : 'Compile Crop Year', save, disabled || !preview?.operationCount, true)}
        {button('Refresh certified reports', () => setReload(value => value + 1))}
        {current && button('Export / Share PDF', share)}
        {!report.operationCount && <Text style={s.copy}>No certified monthly operations match this selection.</Text>}
        {!!report.monthlySummaries.length && <View style={s.card}><Text style={s.title}>Included monthly totals</Text>{report.monthlySummaries.map(month => <View key={month.periodKey} style={s.row}><Text style={s.copy}>{month.periodKey} · {month.operationCount} operations · {month.blockFarmCount} farms</Text><Text style={s.value}>{money(month.totalCost)}</Text></View>)}</View>}
        {!!report.farmSummaries.length && <View style={s.card}><Text style={s.title}>Block Farm totals</Text>{report.farmSummaries.map(farm => <View key={farm.blockFarmId} style={s.row}><Text style={s.copy}>{farm.blockFarmName} · {farm.fieldCount} fields · {farm.hectaresAudited} ha</Text><Text style={s.value}>{money(farm.totalCost)}</Text></View>)}</View>}
        {current && <View style={s.card}><Text style={s.title}>Certified source reports ({current.sourceReportCount})</Text>{current.sourceReports.map(source => <View key={source.reportId} style={s.row}><Text style={s.copy}>{source.reportId}</Text><Text style={s.note}>{source.periodKey} · Certified by {source.certifiedByUserId}</Text></View>)}</View>}
      </>}
      {!!history.length && <View style={s.card}><Text style={s.title}>Saved compilations</Text><Text style={s.note}>Saving the same certified sources reopens the existing compilation. Later certifications create a new snapshot.</Text>{history.map(item => <TouchableOpacity key={item.id} onPress={() => setCurrent(item)} disabled={disabled} style={[s.row, current?.id === item.id && { backgroundColor: COLORS.primaryBg }]}><Text style={s.value}>{item.cropYearCycle} · {money(item.totalCost)}</Text><Text style={s.note}>{item.sourceReportCount} reports · {new Date(item.compiledAt).toLocaleString()}</Text></TouchableOpacity>)}{cursor && button('Load more compilations', more)}</View>}
      <Ionicons name="shield-checkmark-outline" color={COLORS.primary} size={22} style={{ alignSelf: 'center' }} />
    </ScrollView>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background || '#F7F9F4' }, content: { padding: SPACING.md, gap: 14, paddingBottom: 40 },
  card: { padding: 16, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, gap: 8 },
  title: { fontSize: 15, fontWeight: '800', color: COLORS.text }, copy: { fontSize: 13, lineHeight: 20, color: COLORS.textSecondary },
  note: { fontSize: 11, lineHeight: 17, color: COLORS.textMuted }, error: { fontSize: 13, lineHeight: 20, color: '#B91C1C' },
  total: { fontSize: 24, fontWeight: '900', color: COLORS.primary }, value: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  row: { paddingVertical: 12, borderTopWidth: 1, borderColor: COLORS.border, gap: 4 },
  button: { minHeight: 46, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', padding: 12 },
  primary: { backgroundColor: COLORS.primary }, buttonText: { fontSize: 13, fontWeight: '800', color: COLORS.primary }
});
