import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { subscriptionsApi } from '../src/api/subscriptions';
import { categoriesApi } from '../src/api/categories';
import { ApiError } from '../src/api/client';
import { useAuth } from '../src/context/AuthContext';
import { colors } from '../src/theme';
import type { BillingCycle } from '../src/types/api';

const CYCLES: { value: BillingCycle; label: string }[] = [
  { value: 'weekly', label: 'Haftalık' },
  { value: 'monthly', label: 'Aylık' },
  { value: 'quarterly', label: '3 Aylık' },
  { value: 'yearly', label: 'Yıllık' },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function AddSubscriptionScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState(user?.baseCurrency ?? 'USD');
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [notes, setNotes] = useState('');

  const categories = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list });

  const mutation = useMutation({
    mutationFn: subscriptionsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['burn-rate'] });
      queryClient.invalidateQueries({ queryKey: ['spending-by-category'] });
      queryClient.invalidateQueries({ queryKey: ['upcoming-renewals'] });
      router.back();
    },
    onError: (err) => {
      const message = err instanceof ApiError ? err.message : 'Abonelik eklenemedi.';
      Alert.alert('Hata', message);
    },
  });

  function handleSubmit() {
    const priceNumber = Number(price.replace(',', '.'));
    if (!name.trim()) {
      Alert.alert('Eksik bilgi', 'Servis adını gir.');
      return;
    }
    if (!priceNumber || priceNumber <= 0) {
      Alert.alert('Geçersiz fiyat', 'Geçerli bir fiyat gir.');
      return;
    }

    mutation.mutate({
      customName: name.trim(),
      price: priceNumber,
      currency: currency.trim().toUpperCase() || 'USD',
      billingCycle: cycle,
      startDate: todayIso(),
      categoryId,
      notes: notes.trim() || undefined,
    });
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Servis Adı</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Netflix, Spotify, ChatGPT Plus..."
        placeholderTextColor={colors.textMuted}
      />

      <Text style={styles.label}>Fiyat</Text>
      <TextInput
        style={styles.input}
        value={price}
        onChangeText={setPrice}
        keyboardType="decimal-pad"
        placeholder="15.99"
        placeholderTextColor={colors.textMuted}
      />

      <Text style={styles.label}>Para Birimi</Text>
      <TextInput
        style={styles.input}
        value={currency}
        onChangeText={setCurrency}
        autoCapitalize="characters"
        maxLength={3}
        placeholder="USD"
        placeholderTextColor={colors.textMuted}
      />

      <Text style={styles.label}>Fatura Döngüsü</Text>
      <View style={styles.cycleRow}>
        {CYCLES.map((c) => (
          <Pressable
            key={c.value}
            style={[styles.cyclePill, cycle === c.value && styles.cyclePillActive]}
            onPress={() => setCycle(c.value)}
          >
            <Text style={[styles.cycleText, cycle === c.value && styles.cycleTextActive]}>{c.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Kategori</Text>
      <View style={styles.cycleRow}>
        {categories.data?.map((category) => (
          <Pressable
            key={category.id}
            style={[styles.cyclePill, categoryId === category.id && styles.cyclePillActive]}
            onPress={() => setCategoryId((current) => (current === category.id ? undefined : category.id))}
          >
            <Text style={[styles.cycleText, categoryId === category.id && styles.cycleTextActive]}>
              {category.name}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Not (isteğe bağlı)</Text>
      <TextInput
        style={[styles.input, styles.notes]}
        value={notes}
        onChangeText={setNotes}
        placeholder="Aile planı, 4 kişi..."
        placeholderTextColor={colors.textMuted}
        multiline
      />

      <Pressable
        style={({ pressed }) => [styles.submitButton, pressed && styles.submitPressed]}
        onPress={handleSubmit}
        disabled={mutation.isPending}
      >
        {mutation.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitText}>Aboneliği Ekle</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48 },
  label: { fontSize: 13, color: colors.textMuted, marginBottom: 6, marginTop: 18 },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  notes: { minHeight: 80, textAlignVertical: 'top' },
  cycleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cyclePill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cyclePillActive: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
  cycleText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  cycleTextActive: { color: '#fff' },
  submitButton: {
    backgroundColor: colors.primaryDark,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 32,
  },
  submitPressed: { opacity: 0.85 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
