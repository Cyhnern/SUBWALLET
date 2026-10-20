import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Image,
  Modal,
  TextInput,
  Linking,
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
  invoice_url: 'Fatura eklentisi',
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

  const [invoiceModalVisible, setInvoiceModalVisible] = useState(false);
  const [invoiceUrlInput, setInvoiceUrlInput] = useState('');

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
      setInvoiceUrlInput(detail.data.invoiceUrl || '');
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
  const updateInvoice = useMutation({
    mutationFn: (url: string | null) => subscriptionsApi.update(id, { invoiceUrl: url }),
    onSuccess: () => {
      onActionSuccess();
      setInvoiceModalVisible(false);
      Alert.alert('Başarılı', 'Fatura eklentisi güncellendi.');
    },
    onError: onActionError,
  });

  const busy =
    markUsed.isPending ||
    pause.isPending ||
    resume.isPending ||
    cancel.isPending ||
    remove.isPending ||
    updateInvoice.isPending;

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

      {/* Invoice Attachment Card */}
      <Text style={styles.sectionTitle}>📄 Fatura & Makbuz Görseli</Text>
      <View style={styles.card}>
        {sub.invoiceUrl ? (
          <View style={{ gap: 12 }}>
            {sub.invoiceUrl.match(/\.(jpeg|jpg|gif|png|webp)$/i) ? (
              <Image source={{ uri: sub.invoiceUrl }} style={styles.invoicePreview} resizeMode="cover" />
            ) : (
              <View style={styles.invoiceDocBox}>
                <Text style={styles.invoiceDocText}>📎 Fatura Belgesi Ekte Var</Text>
                <Text style={styles.invoiceDocUrl} numberOfLines={1}>
                  {sub.invoiceUrl}
                </Text>
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                style={[styles.smallBtn, styles.secondary]}
                onPress={() => Linking.openURL(sub.invoiceUrl!)}
              >
                <Text style={styles.actionText}>🔍 Faturayı Aç / İndir</Text>
              </Pressable>
              <Pressable
                style={[styles.smallBtn, styles.secondary]}
                onPress={() => setInvoiceModalVisible(true)}
              >
                <Text style={styles.actionText}>✏️ Değiştir</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={{ alignItems: 'center', paddingVertical: 8 }}>
            <Text style={styles.muted}>Henüz eklenmiş fatura veya makbuz yok.</Text>
            <Pressable
              style={[styles.smallBtn, styles.primary, { marginTop: 12 }]}
              onPress={() => setInvoiceModalVisible(true)}
            >
              <Text style={styles.actionTextOnPrimary}>+ Fatura / Makbuz Yükle</Text>
            </Pressable>
          </View>
        )}
      </View>

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

      {/* Invoice URL Modal */}
      <Modal visible={invoiceModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Fatura / Makbuz Bağlantısı</Text>
            <Text style={styles.inputLabel}>Görsel Veya Belge URL'si</Text>
            <TextInput
              style={styles.input}
              placeholder="https://örnek.com/fatura.pdf veya https://.../fatura.png"
              placeholderTextColor={colors.textMuted}
              value={invoiceUrlInput}
              onChangeText={setInvoiceUrlInput}
              autoCapitalize="none"
              keyboardType="url"
            />

            <View style={styles.modalActions}>
              {sub.invoiceUrl ? (
                <Pressable
                  style={styles.modalRemove}
                  onPress={() => updateInvoice.mutate(null)}
                  disabled={updateInvoice.isPending}
                >
                  <Text style={styles.modalRemoveText}>Sil</Text>
                </Pressable>
              ) : null}
              <Pressable style={styles.modalCancel} onPress={() => setInvoiceModalVisible(false)}>
                <Text style={styles.modalCancelText}>İptal</Text>
              </Pressable>
              <Pressable
                style={[styles.modalSubmit, !invoiceUrlInput.trim() && styles.disabledButton]}
                disabled={!invoiceUrlInput.trim() || updateInvoice.isPending}
                onPress={() => updateInvoice.mutate(invoiceUrlInput.trim())}
              >
                <Text style={styles.modalSubmitText}>Kaydet</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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

  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  invoicePreview: { width: '100%', height: 180, borderRadius: 12 },
  invoiceDocBox: {
    backgroundColor: colors.surfaceAlt,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  invoiceDocText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  invoiceDocUrl: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  smallBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  actions: { marginTop: 24, gap: 10 },
  actionBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primary: { backgroundColor: colors.primaryDark },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  dangerOutline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.danger },
  dangerFill: { backgroundColor: colors.danger },
  actionText: { color: colors.text, fontWeight: '600', fontSize: 14 },
  actionTextOnPrimary: { color: '#fff', fontWeight: '600', fontSize: 14 },
  dangerText: { color: colors.danger, fontWeight: '600', fontSize: 15 },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 28,
    marginBottom: 8,
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
  muted: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  modalContent: { backgroundColor: colors.surface, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: colors.border },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 16 },
  inputLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 6 },
  input: {
    backgroundColor: colors.background,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 20,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, alignItems: 'center' },
  modalCancel: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  modalCancelText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  modalRemove: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, marginRight: 'auto' },
  modalRemoveText: { color: colors.danger, fontSize: 14, fontWeight: '600' },
  modalSubmit: { backgroundColor: colors.primaryDark, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  modalSubmitText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  disabledButton: { opacity: 0.5 },
});
