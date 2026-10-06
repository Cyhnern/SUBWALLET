import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '../../src/api/analytics';
import { colors } from '../../src/theme';
import { formatDate, formatMoney, subscriptionName } from '../../src/utils/format';

export default function DashboardScreen() {
  const burnRate = useQuery({ queryKey: ['burn-rate'], queryFn: analyticsApi.burnRate });
  const zombies = useQuery({ queryKey: ['zombie-subscriptions'], queryFn: analyticsApi.zombieSubscriptions });
  const spending = useQuery({ queryKey: ['spending-by-category'], queryFn: analyticsApi.spendingByCategory });
  const renewals = useQuery({ queryKey: ['upcoming-renewals'], queryFn: () => analyticsApi.upcomingRenewals(14) });

  const loading = burnRate.isLoading || zombies.isLoading || spending.isLoading || renewals.isLoading;
  const refreshing = burnRate.isRefetching || zombies.isRefetching || spending.isRefetching || renewals.isRefetching;

  function refetchAll() {
    burnRate.refetch();
    zombies.refetch();
    spending.refetch();
    renewals.refetch();
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
      <Text style={styles.sectionTitle}>Aylık Harcama</Text>
      <View style={styles.burnRateCard}>
        <Text style={styles.burnRateAmount}>
          {formatMoney(burnRate.data?.monthlyTotal ?? 0, burnRate.data?.currency ?? '')}
          <Text style={styles.burnRateUnit}> / ay</Text>
        </Text>
        <Text style={styles.burnRateYearly}>
          Yıllık projeksiyon: {formatMoney(burnRate.data?.yearlyTotal ?? 0, burnRate.data?.currency ?? '')}
        </Text>
        <Text style={styles.burnRateCount}>{burnRate.data?.subscriptionCount ?? 0} aktif abonelik</Text>
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

      <Text style={styles.sectionTitle}>Zombi Abonelikler</Text>
      {zombies.data && zombies.data.length > 0 ? (
        zombies.data.map((z) => (
          <Pressable
            key={z.subscriptionId}
            style={styles.zombieCard}
            onPress={() => router.push({ pathname: '/subscription/[id]', params: { id: z.subscriptionId } })}
          >
            <View style={styles.zombieHeader}>
              <Text style={styles.zombieName}>{z.name}</Text>
              <Text style={styles.zombieScore}>Skor: {z.score}</Text>
            </View>
            {z.reasons.map((reason, i) => (
              <Text key={i} style={styles.zombieReason}>
                • {reason}
              </Text>
            ))}
          </Pressable>
        ))
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>Şu an işaretlenmiş zombi abonelik yok.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
    marginTop: 20,
    textTransform: 'uppercase',
  },
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
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.warning + '55',
  },
  zombieHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 },
  zombieName: { color: colors.text, fontWeight: '700', fontSize: 15, flex: 1 },
  zombieScore: { color: colors.warning, fontWeight: '700', fontSize: 14 },
  zombieReason: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  emptyCard: { backgroundColor: colors.surface, borderRadius: 14, padding: 20, alignItems: 'center' },
  emptyText: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
});
