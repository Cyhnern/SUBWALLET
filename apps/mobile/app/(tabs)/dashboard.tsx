import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Pressable, Alert } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { analyticsApi } from '../../src/api/analytics';
import { subscriptionsApi } from '../../src/api/subscriptions';
import { colors } from '../../src/theme';
import { formatDate, formatMoney, subscriptionName } from '../../src/utils/format';
import { downloadOrShareCsv } from '../../src/utils/export';

export default function DashboardScreen() {
  const queryClient = useQueryClient();

  const burnRate = useQuery({ queryKey: ['burn-rate'], queryFn: analyticsApi.burnRate });
  const zombies = useQuery({ queryKey: ['zombie-subscriptions'], queryFn: analyticsApi.zombieSubscriptions });
  const spending = useQuery({ queryKey: ['spending-by-category'], queryFn: analyticsApi.spendingByCategory });
  const renewals = useQuery({ queryKey: ['upcoming-renewals'], queryFn: () => analyticsApi.upcomingRenewals(14) });
  const exchangeRates = useQuery({
    queryKey: ['exchange-rates', burnRate.data?.currency],
    queryFn: () => analyticsApi.exchangeRates(burnRate.data?.currency ?? 'TRY'),
    enabled: !!burnRate.data?.currency,
  });

  const loading = burnRate.isLoading || zombies.isLoading || spending.isLoading || renewals.isLoading;
  const refreshing = burnRate.isRefetching || zombies.isRefetching || spending.isRefetching || renewals.isRefetching;

  const markUsedMutation = useMutation({
    mutationFn: (id: string) => subscriptionsApi.markUsed(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zombie-subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['burn-rate'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: (id: string) => subscriptionsApi.pause(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zombie-subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['burn-rate'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => subscriptionsApi.cancel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zombie-subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['burn-rate'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
    },
  });

  const exportCsvMutation = useMutation({
    mutationFn: analyticsApi.exportCsvReport,
    onSuccess: (csvText) => {
      downloadOrShareCsv(csvText, 'SubWallet_Harcama_Raporu.csv');
      Alert.alert('Başarılı 📊', 'Bütçe ve harcama raporunuz indirildi!');
    },
    onError: () => {
      Alert.alert('Hata', 'Rapor indirilirken bir sorun oluştu.');
    },
  });

  function refetchAll() {
    burnRate.refetch();
    zombies.refetch();
    spending.refetch();
    renewals.refetch();
    exchangeRates.refetch();
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const maxCategory = Math.max(1, ...(spending.data ?? []).map((row) => row.monthlyTotal));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetchAll} tintColor={colors.primary} />}
    >
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Aylık Harcama</Text>
        <Pressable
          style={styles.exportButton}
          onPress={() => exportCsvMutation.mutate()}
          disabled={exportCsvMutation.isPending}
        >
          {exportCsvMutation.isPending ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            <Text style={styles.exportButtonText}>📊 Raporu İndir (CSV)</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.burnRateCard}>
        <Text style={styles.burnRateAmount}>
          {formatMoney(burnRate.data?.monthlyTotal ?? 0, burnRate.data?.currency ?? '')}
          <Text style={styles.burnRateUnit}> / ay</Text>
        </Text>
        <Text style={styles.burnRateYearly}>
          Yıllık projeksiyon: {formatMoney(burnRate.data?.yearlyTotal ?? 0, burnRate.data?.currency ?? '')}
        </Text>
        <Text style={styles.burnRateCount}>{burnRate.data?.subscriptionCount ?? 0} aktif abonelik</Text>

        <View style={styles.currencyNote}>
          <Text style={styles.currencyNoteText}>
            💱 Tüm dövizli harcamalar anlık kurla {burnRate.data?.currency ?? 'TRY'} cinsine çevrilmiştir.
          </Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Kategori Dağılımı</Text>
      {spending.data && spending.data.length > 0 ? (
        spending.data.map((row) => (
          <View key={row.categoryName} style={styles.categoryRow}>
            <View style={styles.categoryHeader}>
              <Text style={styles.categoryName}>{row.categoryName}</Text>
              <Text style={styles.categoryAmount}>
                {formatMoney(row.monthlyTotal, burnRate.data?.currency ?? '')} · %{row.sharePercent}
              </Text>
            </View>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${Math.max(6, (row.monthlyTotal / maxCategory) * 100)}%`,
                    backgroundColor: row.colorHex ?? colors.primaryDark,
                  },
                ]}
              />
            </View>
          </View>
        ))
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>Kategori dağılımı için aktif abonelik gerekir.</Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>Yaklaşan Yenilemeler (14 gün)</Text>
      {renewals.data && renewals.data.length > 0 ? (
        renewals.data.map((sub) => (
          <Pressable
            key={sub.id}
            style={styles.renewalCard}
            onPress={() => router.push({ pathname: '/subscription/[id]', params: { id: sub.id } })}
          >
            <Text style={styles.renewalName}>{subscriptionName(sub)}</Text>
            <Text style={styles.renewalMeta}>
              {formatDate(sub.nextBillingDate)} · {formatMoney(sub.price, sub.currency)}
            </Text>
          </Pressable>
        ))
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>Önümüzdeki 14 günde yenileme yok.</Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>⚠️ Zombi Abonelikler & Risk Uyarıları</Text>
      {zombies.data && zombies.data.length > 0 ? (
        zombies.data.map((z) => (
          <View key={z.subscriptionId} style={styles.zombieCard}>
            <Pressable
              onPress={() => router.push({ pathname: '/subscription/[id]', params: { id: z.subscriptionId } })}
            >
              <View style={styles.zombieHeader}>
                <Text style={styles.zombieName}>{z.name}</Text>
                <View style={styles.scoreBadge}>
                  <Text style={styles.zombieScore}>Risk: %{z.score}</Text>
                </View>
              </View>
              {z.reasons.map((reason, i) => (
                <Text key={i} style={styles.zombieReason}>
                  • {reason}
                </Text>
              ))}
            </Pressable>

            <View style={styles.zombieActions}>
              <Pressable
                style={[styles.zombieActionButton, styles.usedButton]}
                onPress={() => markUsedMutation.mutate(z.subscriptionId)}
                disabled={markUsedMutation.isPending}
              >
                <Text style={styles.usedButtonText}>✓ Kullandım</Text>
              </Pressable>
              <Pressable
                style={[styles.zombieActionButton, styles.pauseButton]}
                onPress={() => pauseMutation.mutate(z.subscriptionId)}
                disabled={pauseMutation.isPending}
              >
                <Text style={styles.actionButtonText}>⏸️ Duraklat</Text>
              </Pressable>
              <Pressable
                style={[styles.zombieActionButton, styles.cancelButton]}
                onPress={() => cancelMutation.mutate(z.subscriptionId)}
                disabled={cancelMutation.isPending}
              >
                <Text style={styles.cancelButtonText}>✕ İptal</Text>
              </Pressable>
            </View>
          </View>
        ))
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>✨ Harika! Şu an zombi olarak işaretlenmiş bir aboneliğin yok.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 10,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  exportButton: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  exportButtonText: { color: colors.primary, fontSize: 12, fontWeight: '700' },

  burnRateCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  burnRateAmount: { fontSize: 32, fontWeight: '700', color: colors.text },
  burnRateUnit: { fontSize: 16, fontWeight: '400', color: colors.textMuted },
  burnRateYearly: { fontSize: 13, color: colors.textMuted, marginTop: 6 },
  burnRateCount: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  currencyNote: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  currencyNoteText: { color: colors.primary, fontSize: 11, fontWeight: '600' },

  categoryRow: { marginBottom: 12 },
  categoryHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  categoryName: { color: colors.text, fontSize: 14, fontWeight: '600', flex: 1, marginRight: 8 },
  categoryAmount: { color: colors.textMuted, fontSize: 12 },
  barTrack: { height: 8, backgroundColor: colors.surfaceAlt, borderRadius: 8, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 8 },
  renewalCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  renewalName: { color: colors.text, fontWeight: '600', fontSize: 15 },
  renewalMeta: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  zombieCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  zombieHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 },
  zombieName: { color: colors.text, fontWeight: '700', fontSize: 15, flex: 1 },
  scoreBadge: { backgroundColor: 'rgba(239, 68, 68, 0.15)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  zombieScore: { color: colors.danger, fontWeight: '700', fontSize: 12 },
  zombieReason: { color: colors.textMuted, fontSize: 13, marginTop: 2 },

  // Zombie Actions
  zombieActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  zombieActionButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  usedButton: { backgroundColor: 'rgba(34, 197, 94, 0.15)', borderWidth: 1, borderColor: '#22c55e' },
  usedButtonText: { color: '#22c55e', fontSize: 12, fontWeight: '700' },
  pauseButton: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  actionButtonText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  cancelButton: { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderWidth: 1, borderColor: colors.danger },
  cancelButtonText: { color: colors.danger, fontSize: 12, fontWeight: '700' },

  emptyCard: { backgroundColor: colors.surface, borderRadius: 14, padding: 20, alignItems: 'center' },
  emptyText: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
});
