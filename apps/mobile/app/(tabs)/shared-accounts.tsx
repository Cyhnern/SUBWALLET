import { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  ScrollView,
  Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sharedAccountsApi } from '../../src/api/shared-accounts';
import { colors } from '../../src/theme';
import type { SharedAccount, CostSplit } from '../../src/types/api';
import { formatMoney } from '../../src/utils/format';

export default function SharedAccountsScreen() {
  const queryClient = useQueryClient();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  // Modals
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');

  // 1. Fetch all shared accounts
  const {
    data: accounts,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['shared-accounts'],
    queryFn: () => sharedAccountsApi.list(),
  });

  // Automatically select first account if available and none selected
  const activeAccount = accounts?.find((a) => a.id === selectedAccountId) || accounts?.[0];

  // 2. Fetch Cost Splits for selected account
  const {
    data: costSplits,
    isLoading: isSplitsLoading,
    refetch: refetchSplits,
  } = useQuery({
    queryKey: ['cost-splits', activeAccount?.id],
    queryFn: () => sharedAccountsApi.listCostSplits(activeAccount!.id),
    enabled: !!activeAccount?.id,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (name: string) => sharedAccountsApi.create({ name }),
    onSuccess: (newAccount) => {
      queryClient.invalidateQueries({ queryKey: ['shared-accounts'] });
      setSelectedAccountId(newAccount.id);
      setCreateModalVisible(false);
      setNewAccountName('');
    },
    onError: (err: Error) => {
      Alert.alert('Hata', err.message || 'Ortak hesap oluşturulamadı.');
    },
  });

  const inviteMutation = useMutation({
    mutationFn: ({ accountId, email }: { accountId: string; email: string }) =>
      sharedAccountsApi.inviteMember(accountId, { email, role: 'member' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shared-accounts'] });
      setInviteModalVisible(false);
      setInviteEmail('');
      Alert.alert('Başarılı', 'Üye hesaba eklendi.');
    },
    onError: (err: Error) => {
      Alert.alert('Hata', err.message || 'Üye eklenemedi.');
    },
  });

  const settleMutation = useMutation({
    mutationFn: ({ accountId, splitId }: { accountId: string; splitId: string }) =>
      sharedAccountsApi.settleCostSplit(accountId, splitId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cost-splits'] });
    },
    onError: (err: Error) => {
      Alert.alert('Hata', err.message || 'Ödeme durumu güncellenemedi.');
    },
  });

  const recomputeMutation = useMutation({
    mutationFn: (accountId: string) => sharedAccountsApi.recomputeCostSplits(accountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cost-splits'] });
      Alert.alert('Başarılı', 'Maliyet paylaşımı yeniden hesaplandı.');
    },
    onError: (err: Error) => {
      Alert.alert('Hata', err.message || 'Hesaplama başarısız oldu.');
    },
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
        <Text style={styles.errorText}>Ortak hesaplar yüklenemedi.</Text>
        <Text style={styles.errorDetail}>{(error as Error).message}</Text>
        <Pressable style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryText}>Tekrar Dene</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Group Selector Bar */}
      <View style={styles.selectorBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectorScroll}>
          {accounts?.map((acc) => {
            const isSelected = activeAccount?.id === acc.id;
            return (
              <Pressable
                key={acc.id}
                style={[styles.accountChip, isSelected && styles.accountChipActive]}
                onPress={() => setSelectedAccountId(acc.id)}
              >
                <Text style={[styles.accountChipText, isSelected && styles.accountChipTextActive]}>
                  👥 {acc.name}
                </Text>
              </Pressable>
            );
          })}
          <Pressable style={styles.addChip} onPress={() => setCreateModalVisible(true)}>
            <Text style={styles.addChipText}>+ Yeni Grup</Text>
          </Pressable>
        </ScrollView>
      </View>

      {!activeAccount ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>Henüz bir ortak hesabın yok</Text>
          <Text style={styles.emptySubtitle}>
            Abonelik masraflarını arkadaşların veya ailenle bölüşmek için bir grup oluştur.
          </Text>
          <Pressable style={styles.primaryButton} onPress={() => setCreateModalVisible(true)}>
            <Text style={styles.primaryButtonText}>+ Ortak Hesap Oluştur</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          style={styles.contentScroll}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
        >
          {/* Header Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardTitle}>{activeAccount.name}</Text>
                <Text style={styles.cardSubtitle}>{activeAccount.members?.length || 0} Üye</Text>
              </View>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => setInviteModalVisible(true)}
              >
                <Text style={styles.secondaryButtonText}>+ Üye Ekle</Text>
              </Pressable>
            </View>

            {/* Members list */}
            <View style={styles.divider} />
            <Text style={styles.sectionLabel}>Grup Üyeleri</Text>
            <View style={styles.membersContainer}>
              {activeAccount.members?.map((m) => (
                <View key={m.id} style={styles.memberBadge}>
                  <Text style={styles.memberName}>{m.user?.fullName || m.user?.email || 'Üye'}</Text>
                  <Text style={styles.memberRole}>
                    {m.role === 'owner' ? '👑 Kurucu' : m.role === 'admin' ? '🛡️ Admin' : '👤 Üye'}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Subscriptions in Group */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Gruba Bağlı Abonelikler</Text>
            {activeAccount.subscriptions && activeAccount.subscriptions.length > 0 ? (
              activeAccount.subscriptions.map((sub) => (
                <View key={sub.id} style={styles.subItem}>
                  <Text style={styles.subName}>{sub.customName || 'Abonelik'}</Text>
                  <Text style={styles.subPrice}>
                    {formatMoney(Number(sub.price), sub.currency)} / {sub.billingCycle}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.mutedText}>Bu gruba tanımlı abonelik bulunmuyor.</Text>
            )}
          </View>

          {/* Cost Splits Section */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>💰 Maliyet Paylaşımı (Cost Splits)</Text>
              <Pressable
                style={styles.textButton}
                onPress={() => recomputeMutation.mutate(activeAccount.id)}
              >
                <Text style={styles.textButtonText}>🔄 Yeniden Hesapla</Text>
              </Pressable>
            </View>

            {isSplitsLoading ? (
              <ActivityIndicator color={colors.primary} size="small" style={{ marginVertical: 12 }} />
            ) : costSplits && costSplits.length > 0 ? (
              costSplits.map((split: CostSplit) => (
                <View key={split.id} style={styles.splitRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.splitUser}>
                      {split.user?.fullName || split.user?.email || 'Kullanıcı'}
                    </Text>
                    <Text style={styles.splitSub}>
                      {split.subscription?.customName || 'Abonelik payı'}
                    </Text>
                  </View>

                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.splitAmount}>
                      {formatMoney(Number(split.computedAmount), split.subscription?.currency || 'TRY')}
                    </Text>
                    {split.isSettled ? (
                      <View style={[styles.statusBadge, styles.statusSettled]}>
                        <Text style={styles.statusTextSettled}>✓ Ödendi</Text>
                      </View>
                    ) : (
                      <Pressable
                        style={[styles.statusBadge, styles.statusPending]}
                        onPress={() =>
                          settleMutation.mutate({
                            accountId: activeAccount.id,
                            splitId: split.id,
                          })
                        }
                      >
                        <Text style={styles.statusTextPending}>⏳ Öde / İşaretle</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.mutedText}>
                Henüz hesaplanmış maliyet paylaşımı yok. "Yeniden Hesapla" butonuna basabilirsiniz.
              </Text>
            )}
          </View>
        </ScrollView>
      )}

      {/* Create Shared Account Modal */}
      <Modal visible={createModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Yeni Ortak Hesap</Text>
            <Text style={styles.inputLabel}>Grup Adı</Text>
            <TextInput
              style={styles.input}
              placeholder="ör. Ev Ailesi, Netflix Havuzu"
              placeholderTextColor={colors.textMuted}
              value={newAccountName}
              onChangeText={setNewAccountName}
            />

            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setCreateModalVisible(false)}>
                <Text style={styles.modalCancelText}>İptal</Text>
              </Pressable>
              <Pressable
                style={[styles.modalSubmit, !newAccountName.trim() && styles.disabledButton]}
                disabled={!newAccountName.trim() || createMutation.isPending}
                onPress={() => createMutation.mutate(newAccountName.trim())}
              >
                <Text style={styles.modalSubmitText}>Oluştur</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Invite Member Modal */}
      <Modal visible={inviteModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Gruba Üye Ekle</Text>
            <Text style={styles.inputLabel}>Kullanıcı E-postası</Text>
            <TextInput
              style={styles.input}
              placeholder="ornek@email.com"
              placeholderTextColor={colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              value={inviteEmail}
              onChangeText={setInviteEmail}
            />

            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setInviteModalVisible(false)}>
                <Text style={styles.modalCancelText}>İptal</Text>
              </Pressable>
              <Pressable
                style={[styles.modalSubmit, !inviteEmail.trim() && styles.disabledButton]}
                disabled={!inviteEmail.trim() || inviteMutation.isPending}
                onPress={() =>
                  activeAccount &&
                  inviteMutation.mutate({
                    accountId: activeAccount.id,
                    email: inviteEmail.trim(),
                  })
                }
              >
                <Text style={styles.modalSubmitText}>Ekle</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { color: colors.danger, fontSize: 16, fontWeight: '600', marginBottom: 6 },
  errorDetail: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginBottom: 16 },
  retryButton: { backgroundColor: colors.surfaceAlt, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryText: { color: colors.text, fontWeight: '600' },

  // Selector Bar
  selectorBar: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  selectorScroll: { paddingHorizontal: 16, paddingVertical: 12, gap: 8, flexDirection: 'row' },
  accountChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  accountChipActive: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
  accountChipText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  accountChipTextActive: { color: '#fff' },
  addChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  addChipText: { color: colors.primary, fontSize: 13, fontWeight: '600' },

  // Empty State
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { color: colors.textMuted, fontSize: 14, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  primaryButton: { backgroundColor: colors.primaryDark, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  // Cards
  contentScroll: { padding: 16 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  cardSubtitle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },

  secondaryButton: { backgroundColor: colors.surfaceAlt, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  secondaryButtonText: { color: colors.text, fontSize: 12, fontWeight: '600' },

  divider: { height: 1, backgroundColor: colors.border, marginVertical: 12 },
  sectionLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 8 },

  membersContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  memberBadge: {
    backgroundColor: colors.background,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  memberName: { color: colors.text, fontSize: 12, fontWeight: '600' },
  memberRole: { color: colors.textMuted, fontSize: 10, marginTop: 2 },

  subItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  subName: { color: colors.text, fontSize: 14, fontWeight: '500' },
  subPrice: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  mutedText: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic', marginTop: 4 },

  textButton: { padding: 4 },
  textButtonText: { color: colors.primary, fontSize: 12, fontWeight: '600' },

  // Splits
  splitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  splitUser: { color: colors.text, fontSize: 14, fontWeight: '600' },
  splitSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  splitAmount: { color: colors.text, fontSize: 15, fontWeight: '700', marginBottom: 4 },

  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusSettled: { backgroundColor: 'rgba(34, 197, 94, 0.15)' },
  statusPending: { backgroundColor: 'rgba(234, 179, 8, 0.15)' },
  statusTextSettled: { color: '#22c55e', fontSize: 11, fontWeight: '700' },
  statusTextPending: { color: '#eab308', fontSize: 11, fontWeight: '700' },

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
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  modalCancel: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  modalCancelText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  modalSubmit: { backgroundColor: colors.primaryDark, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  modalSubmitText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  disabledButton: { opacity: 0.5 },
});
