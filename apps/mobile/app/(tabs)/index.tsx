import { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { subscriptionsApi } from '../../src/api/subscriptions';
import { SubscriptionCard } from '../../src/components/SubscriptionCard';
import { colors } from '../../src/theme';
import type { SubscriptionStatus } from '../../src/types/api';
import { STATUS_LABELS } from '../../src/utils/format';

type SortOption = 'nextBillingDate' | 'priceAsc' | 'priceDesc' | 'nameAsc';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'nextBillingDate', label: '📅 Yenileme' },
  { value: 'priceDesc', label: '📈 Fiyat (Yüksek)' },
  { value: 'priceAsc', label: '📉 Fiyat (Düşük)' },
  { value: 'nameAsc', label: '🔤 İsim (A-Z)' },
];

const FILTERS: Array<{ value: SubscriptionStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Tümü' },
  { value: 'active', label: STATUS_LABELS.active },
  { value: 'paused', label: STATUS_LABELS.paused },
  { value: 'trial', label: STATUS_LABELS.trial },
  { value: 'cancelled', label: STATUS_LABELS.cancelled },
];

export default function SubscriptionsScreen() {
  const [status, setStatus] = useState<SubscriptionStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('nextBillingDate');

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['subscriptions', status, search, sortBy],
    queryFn: () =>
      subscriptionsApi.list({
        status: status === 'all' ? undefined : status,
        search: search.trim() || undefined,
        sortBy,
      }),
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
          <View style={styles.headerContainer}>
            {/* Search Input Bar */}
            <View style={styles.searchBar}>
              <TextInput
                style={styles.searchInput}
                placeholder="🔍 Aboneliklerde veya notlarda ara..."
                placeholderTextColor={colors.textMuted}
                value={search}
                onChangeText={setSearch}
              />
              {search ? (
                <Pressable onPress={() => setSearch('')} style={styles.clearSearch}>
                  <Text style={styles.clearSearchText}>✕</Text>
                </Pressable>
              ) : null}
            </View>

            {/* Sort Options Bar */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortRow}>
              {SORT_OPTIONS.map((opt) => {
                const active = sortBy === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    style={[styles.sortChip, active && styles.sortChipActive]}
                    onPress={() => setSortBy(opt.value)}
                  >
                    <Text style={[styles.sortText, active && styles.sortTextActive]}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Status Filter Row */}
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
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {search
                ? `"${search}" ile eşleşen abonelik bulunamadı`
                : status === 'all'
                ? 'Henüz abonelik eklemedin'
                : 'Bu durumda abonelik yok'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {search
                ? 'Arama terimini değiştirebilir veya arama çubuğunu temizleyebilirsiniz.'
                : status === 'all'
                ? 'Aşağıdaki + butonuyla ilk aboneliğini ekle.'
                : 'Filtreyi değiştirerek diğer aboneliklere bak.'}
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
  headerContainer: { marginBottom: 16, gap: 12 },

  // Search Bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 14,
  },
  clearSearch: { padding: 6 },
  clearSearchText: { color: colors.textMuted, fontSize: 14, fontWeight: '700' },

  // Sort Row
  sortRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortChipActive: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
  sortText: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  sortTextActive: { color: '#fff' },

  // Filter Row
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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

  empty: { paddingTop: 48, alignItems: 'center', paddingHorizontal: 16 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: 6, textAlign: 'center' },
  emptySubtitle: { color: colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 18 },

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
