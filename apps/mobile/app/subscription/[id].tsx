import { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { subscriptionsApi } from '../../src/api/subscriptions';
import { ApiError } from '../../src/api/client';
import { colors } from '../../src/theme';
import {
  CYCLE_LABELS,
  STATUS_LABELS,
  formatDate,
  formatMoney,
  subscriptionName,
} from '../../src/utils/format';

const HISTORY_LABELS: Record<string, string> = {
  status: 'Durum',
  price: 'Fiyat',
  billing_cycle: 'Fatura döngüsü',
};

function invalidateSubscriptionQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
  queryClient.invalidateQueries({ queryKey: ['burn-rate'] });
  queryClient.invalidateQueries({ queryKey: ['zombie-subscriptions'] });
  queryClient.invalidateQueries({ queryKey: ['spending-by-category'] });
  queryClient.invalidateQueries({ queryKey: ['upcoming-renewals'] });
}

export default function SubscriptionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const queryClient = useQueryClient();

  const detail = useQuery({
    queryKey: ['subscription', id],
    queryFn: () => subscriptionsApi.get(id),
    enabled: Boolean(id),
  });

  const history = useQuery({
    queryKey: ['subscription-history', id],
    queryFn: () => subscriptionsApi.history(id),
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (detail.data) {
      navigation.setOptions({ title: subscriptionName(detail.data) });
    }
  }, [detail.data, navigation]);

  const onActionSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['subscription', id] });
    queryClient.invalidateQueries({ queryKey: ['subscription-history', id] });
    invalidateSubscriptionQueries(queryClient);
  };

  const onActionError = (err: unknown) => {
    Alert.alert('İşlem başarısız', err instanceof ApiError ? err.message : 'Bir hata oluştu.');
  };

  const markUsed = useMutation({
    mutationFn: () => subscriptionsApi.markUsed(id),
    onSuccess: onActionSuccess,
    onError: onActionError,
  });
  const pause = useMutation({
    mutationFn: () => subscriptionsApi.pause(id),
    onSuccess: onActionSuccess,
    onError: onActionError,
  });
  const resume = useMutation({
    mutationFn: () => subscriptionsApi.resume(id),
    onSuccess: onActionSuccess,
    onError: onActionError,
  });
  const cancel = useMutation({
    mutationFn: () => subscriptionsApi.cancel(id),
    onSuccess: onActionSuccess,
    onError: onActionError,
  });
  const remove = useMutation({
    mutationFn: () => subscriptionsApi.remove(id),
    onSuccess: () => {
      invalidateSubscriptionQueries(queryClient);
      router.back();
    },
    onError: onActionError,
  });

  const busy =
    markUsed.isPending || pause.isPending || resume.isPending || cancel.isPending || remove.isPending;

  if (detail.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Abonelik yüklenemedi.</Text>
        <Text style={styles.muted}>{(detail.error as Error | undefined)?.message}</Text>
      </View>
    );
  }

  const sub = detail.data;

  function confirmCancel() {
    Alert.alert('Aboneliği iptal et', 'Bu abonelik iptal edilecek. Devam edilsin mi?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'İptal Et', style: 'destructive', onPress: () => cancel.mutate() },
    ]);
  }

  function confirmDelete() {
    Alert.alert('Aboneliği sil', 'Kayıt gizlenecek (soft delete). Bu işlem geri alınamaz.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => remove.mutate() },
    ]);
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={detail.isRefetching}
          onRefresh={() => {
            detail.refetch();
            history.refetch();
          }}
          tintColor={colors.primary}
        />
      }
    >
      <View style={styles.hero}>
        <Text style={styles.price}>{formatMoney(sub.price, sub.currency)}</Text>
        <Text style={styles.cycle}>/ {CYCLE_LABELS[sub.billingCycle]}</Text>
        <View style={styles.statusPill}>
          <Text style={styles.statusText}>{STATUS_LABELS[sub.status]}</Text>
        </View>
      </View>

      {sub.category ? <Text style={styles.meta}>Kategori: {sub.category.name}</Text> : null}
      <Text style={styles.meta}>Başlangıç: {formatDate(sub.startDate)}</Text>
      <Text style={styles.meta}>Sonraki yenileme: {formatDate(sub.nextBillingDate)}</Text>
      <Text style={styles.meta}>
        Son kullanım: {sub.lastUsedAt ? formatDate(sub.lastUsedAt) : 'Henüz işaretlenmedi'}
      </Text>
      {sub.notes ? <Text style={styles.notes}>{sub.notes}</Text> : null}

      <View style={styles.actions}>
        {(sub.status === 'active' || sub.status === 'trial') && (
          <Pressable style={[styles.actionBtn, styles.secondary]} disabled={busy} onPress={() => markUsed.mutate()}>
            <Text style={styles.actionText}>Bugün kullandım</Text>
          </Pressable>
        )}
        {sub.status === 'active' && (
          <Pressable style={[styles.actionBtn, styles.secondary]} disabled={busy} onPress={() => pause.mutate()}>
            <Text style={styles.actionText}>Duraklat</Text>
          </Pressable>
        )}
        {sub.status === 'paused' && (
          <Pressable style={[styles.actionBtn, styles.primary]} disabled={busy} onPress={() => resume.mutate()}>
            <Text style={styles.actionTextOnPrimary}>Devam Ettir</Text>
          </Pressable>
        )}
        {(sub.status === 'active' || sub.status === 'paused' || sub.status === 'trial') && (
          <Pressable style={[styles.actionBtn, styles.dangerOutline]} disabled={busy} onPress={confirmCancel}>
            <Text style={styles.dangerText}>İptal Et</Text>
          </Pressable>
        )}
        <Pressable style={[styles.actionBtn, styles.dangerFill]} disabled={busy} onPress={confirmDelete}>
          <Text style={styles.actionTextOnPrimary}>Sil</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Geçmiş</Text>
      {history.data && history.data.length > 0 ? (
        history.data.map((entry) => (
          <View key={entry.id} style={styles.historyRow}>
            <Text style={styles.historyField}>{HISTORY_LABELS[entry.changedField] ?? entry.changedField}</Text>
            <Text style={styles.historyValue}>
              {entry.oldValue ?? '—'} → {entry.newValue ?? '—'}
            </Text>
            <Text style={styles.historyDate}>{formatDate(entry.changedAt)}</Text>
          </View>
        ))
      ) : (
        <Text style={styles.muted}>Henüz değişiklik kaydı yok.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, padding: 24 },
  hero: { marginBottom: 16 },
  price: { fontSize: 32, fontWeight: '700', color: colors.text },
  cycle: { fontSize: 16, color: colors.textMuted, marginTop: 4 },
  statusPill: {
    alignSelf: 'flex-start',
    marginTop: 12,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusText: { color: colors.text, fontWeight: '600', fontSize: 12 },
  meta: { color: colors.textMuted, fontSize: 14, marginTop: 6 },
  notes: {
    marginTop: 14,
    color: colors.text,
    fontSize: 14,
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actions: { marginTop: 24, gap: 10 },
  actionBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primary: { backgroundColor: colors.primaryDark },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  dangerOutline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.danger },
  dangerFill: { backgroundColor: colors.danger },
  actionText: { color: colors.text, fontWeight: '600', fontSize: 15 },
  actionTextOnPrimary: { color: '#fff', fontWeight: '600', fontSize: 15 },
  dangerText: { color: colors.danger, fontWeight: '600', fontSize: 15 },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 32,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  historyRow: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  historyField: { color: colors.text, fontWeight: '600', fontSize: 14 },
  historyValue: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  historyDate: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  errorText: { color: colors.danger, fontSize: 16, fontWeight: '600', marginBottom: 8 },
  muted: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
});
