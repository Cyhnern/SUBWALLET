import { useState } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { subscriptionsApi } from '../../src/api/subscriptions';
import { SubscriptionCard } from '../../src/components/SubscriptionCard';
import { colors } from '../../src/theme';
import type { SubscriptionStatus } from '../../src/types/api';
import { STATUS_LABELS } from '../../src/utils/format';

const FILTERS: Array<{ value: SubscriptionStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Tümü' },
  { value: 'active', label: STATUS_LABELS.active },
  { value: 'paused', label: STATUS_LABELS.paused },
  { value: 'trial', label: STATUS_LABELS.trial },
  { value: 'cancelled', label: STATUS_LABELS.cancelled },
];

export default function SubscriptionsScreen() {
  const [status, setStatus] = useState<SubscriptionStatus | 'all'>('all');
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['subscriptions', status],
    queryFn: () => subscriptionsApi.list(status === 'all' ? undefined : status),
  });

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Abonelikler yüklenemedi.</Text>
        <Text style={styles.errorDetail}>{(error as Error).message}</Text>
        <Pressable style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryText}>Tekrar Dene</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
        ListHeaderComponent={
          <View style={styles.filterRow}>
            {FILTERS.map((filter) => {
              const active = status === filter.value;
              return (
                <Pressable
                  key={filter.value}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setStatus(filter.value)}
                >
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>{filter.label}</Text>
                </Pressable>
              );
            })}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {status === 'all' ? 'Henüz abonelik eklemedin' : 'Bu durumda abonelik yok'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {status === 'all' ? 'Aşağıdaki + butonuyla ilk aboneliğini ekle.' : 'Filtreyi değiştirerek diğer aboneliklere bak.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <SubscriptionCard
            subscription={item}
            onPress={() =>
              router.push({
                pathname: '/subscription/[id]',
                params: { id: item.id },
              })
            }
          />
        )}
      />

      <Pressable style={styles.fab} onPress={() => router.push('/add-subscription')}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: 16, flexGrow: 1, paddingBottom: 96 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
  filterText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  filterTextActive: { color: '#fff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { color: colors.danger, fontSize: 16, fontWeight: '600', marginBottom: 6 },
  errorDetail: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginBottom: 16 },
  retryButton: { backgroundColor: colors.surfaceAlt, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryText: { color: colors.text, fontWeight: '600' },
  empty: { paddingTop: 48, alignItems: 'center' },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '600', marginBottom: 6 },
  emptySubtitle: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabText: { color: '#fff', fontSize: 28, fontWeight: '400', marginTop: -2 },
});
