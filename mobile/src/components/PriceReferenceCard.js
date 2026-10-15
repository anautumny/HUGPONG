import React from 'react';
import { View, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import { AppText as Text } from './Typography';
import { COLORS } from '../theme';
import { priceText, movementText } from '../utils/pricePresentation';
import { useTranslation } from '../services/i18n';

export default function PriceReferenceCard({ priceRecord, canPost, onPostPricePress }) {
  const { t } = useTranslation();
  const summary = priceRecord?.priceAnalytics?.summary;
  return <View style={styles.card}>
    <View style={styles.header}><Text style={styles.title}>Latest SRA bulletin</Text>
      {canPost && <TouchableOpacity onPress={onPostPricePress} style={styles.button}><Text style={styles.buttonText}>{t('post_official_price', 'Publish Price Reference')}</Text></TouchableOpacity>}
    </View>
    {!priceRecord ? <Text style={styles.note}>No published bulletin available. Reconnect to refresh.</Text> : <>
      <Text style={styles.note}>{priceRecord.weekLabel} · {priceRecord.periodType === 'WEEK_ENDING' ? 'Week ending' : 'Effective'} {priceRecord.effectiveDate}</Text>
      {summary?.isStale && <Text style={styles.warning}>No newer bulletin available as of {priceRecord.priceAnalytics.asOf}. These are historical references.</Text>}
      {[
        { key: 'sugar', label: 'Raw Sugar', field: 'sugarPricePerLkg', unit: 'Lkg (50 kg)' },
        { key: 'molasses', label: 'Molasses', field: 'molassesPricePerMetricTon', unit: 'MT' }
      ].map(product => {
        const status = priceRecord[`${product.key}PriceStatus`] || 'REPORTED';
        const last = summary?.lastReported?.[product.key];
        return <View key={product.key} style={styles.product}>
          <Text style={styles.label}>{product.label}</Text>
          <Text style={styles.value}>{priceText(priceRecord[product.field], status, status === 'REPORTED' ? product.unit : '')}</Text>
          <Text style={styles.note}>{status === 'REPORTED' ? `${movementText(priceRecord[`${product.key}PriceChange`])}${priceRecord[`${product.key}PriceChange`] != null ? ' vs prior week' : ''}` : status === 'MILLING_ENDED' ? 'The source reports milling ended; no price quoted for this week.' : 'No price quoted for this reporting week.'}</Text>
          {last && last.date !== priceRecord.effectiveDate && <Text style={styles.note}>Last reported: {priceText(last.value, 'REPORTED', product.unit)} · {last.date}</Text>}
        </View>;
      })}
      <Text style={styles.note}>{priceRecord.circularNumber}</Text>
      {/^https:\/\//.test(priceRecord.sourceUrl || '') && <TouchableOpacity accessibilityRole="link" onPress={() => Linking.openURL(priceRecord.sourceUrl)}><Text style={styles.link}>View source bulletin</Text></TouchableOpacity>}
    </>}
  </View>;
}
const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1, fontSize: 16, fontWeight: '800', color: COLORS.text },
  button: { padding: 10, borderRadius: 10, backgroundColor: COLORS.primary }, buttonText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  product: { padding: 12, borderRadius: 12, backgroundColor: COLORS.background, gap: 8 },
  label: { fontSize: 12, color: COLORS.textMuted, fontWeight: '800' },
  value: { fontSize: 23, fontWeight: '800', color: COLORS.text },
  note: { fontSize: 12, lineHeight: 18, color: COLORS.textMuted },
  warning: { fontSize: 12, lineHeight: 18, color: COLORS.text, backgroundColor: COLORS.warningBg, borderRadius: 10, padding: 10 },
  link: { fontSize: 12, color: COLORS.primary, paddingVertical: 6, fontWeight: '700' }
});
