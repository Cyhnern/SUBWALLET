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
import { serviceProvidersApi } from '../src/api/service-providers';
import { ApiError } from '../src/api/client';
import { useAuth } from '../src/context/AuthContext';
import { colors } from '../src/theme';
import type { BillingCycle } from '../src/types/api';

const POPULAR_SERVICES = [
  { name: 'Netflix', logo: '🎬', price: '199.99', currency: 'TRY', cycle: 'monthly' as const },
  { name: 'Spotify', logo: '🎵', price: '59.99', currency: 'TRY', cycle: 'monthly' as const },
  { name: 'YouTube Premium', logo: '📹', price: '57.99', currency: 'TRY', cycle: 'monthly' as const },
  { name: 'Disney+', logo: '🍿', price: '134.99', currency: 'TRY', cycle: 'monthly' as const },
  { name: 'ChatGPT Plus', logo: '🤖', price: '20.00', currency: 'USD', cycle: 'monthly' as const },
  { name: 'Amazon Prime', logo: '📦', price: '39.00', currency: 'TRY', cycle: 'monthly' as const },
  { name: 'Apple Music / One', logo: '🍎', price: '39.99', currency: 'TRY', cycle: 'monthly' as const },
  { name: 'iCloud+', logo: '☁️', price: '39.99', currency: 'TRY', cycle: 'monthly' as const },
  { name: 'Exxen', logo: '⚽', price: '160.00', currency: 'TRY', cycle: 'monthly' as const },
  { name: 'BluTV', logo: '🍿', price: '99.90', currency: 'TRY', cycle: 'monthly' as const },
  { name: 'Midjourney', logo: '🎨', price: '10.00', currency: 'USD', cycle: 'monthly' as const },
  { name: 'Xbox Game Pass', logo: '💚', price: '209.00', currency: 'TRY', cycle: 'monthly' as const },
  { name: 'Spor / Fitness', logo: '🏋️‍♂️', price: '1000.00', currency: 'TRY', cycle: 'monthly' as const },
];

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
  const [currency, setCurrency] = useState(user?.baseCurrency ?? 'TRY');
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [invoiceUrl, setInvoiceUrl] = useState('');

  const categories = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list });
  const serviceProviders = useQuery({ queryKey: ['service-providers'], queryFn: serviceProvidersApi.list });

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

  function selectPopularService(preset: typeof POPULAR_SERVICES[0]) {
    setSelectedPreset(preset.name);
    setName(preset.name);
    setPrice(preset.price);
    setCurrency(preset.currency);
    setCycle(preset.cycle);
  }

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
      currency: currency.trim().toUpperCase() || 'TRY',
      billingCycle: cycle,
      startDate: todayIso(),
      categoryId,
      notes: notes.trim() || undefined,
      invoiceUrl: invoiceUrl.trim() || undefined,
    });
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Popular Presets Selector */}
      <Text style={styles.sectionHeader}>⭐ Hızlı Seçim (Popüler Servisler)</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetScroll}>
        {POPULAR_SERVICES.map((preset) => {
          const isSelected = selectedPreset === preset.name;
          return (
            <Pressable
              key={preset.name}
              style={[styles.presetCard, isSelected && styles.presetCardActive]}
              onPress={() => selectPopularService(preset)}
            >
              <Text style={styles.presetLogo}>{preset.logo}</Text>
              <Text style={[styles.presetName, isSelected && styles.presetTextActive]}>{preset.name}</Text>
              <Text style={styles.presetPrice}>{preset.price} {preset.currency}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text style={styles.label}>Servis Adı</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={(text) => {
          setName(text);
          setSelectedPreset(null);
        }}
        placeholder="Netflix, Spotify, ChatGPT Plus..."
        placeholderTextColor={colors.textMuted}
      />

      <Text style={styles.label}>Fiyat</Text>
      <TextInput
        style={styles.input}
        value={price}
        onChangeText={setPrice}
        keyboardType="decimal-pad"
        placeholder="199.99"
        placeholderTextColor={colors.textMuted}
      />

      <Text style={styles.label}>Para Birimi</Text>
      <TextInput
        style={styles.input}
        value={currency}
        onChangeText={setCurrency}
        autoCapitalize="characters"
        maxLength={3}
        placeholder="TRY"
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

      <Text style={styles.label}>Fatura / Makbuz Bağlantısı (isteğe bağlı)</Text>
      <TextInput
        style={styles.input}
        value={invoiceUrl}
        onChangeText={setInvoiceUrl}
        placeholder="https://örnek.com/fatura.pdf veya https://.../fatura.png"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        keyboardType="url"
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

  sectionHeader: { fontSize: 13, fontWeight: '700', color: colors.primary, marginBottom: 12, textTransform: 'uppercase' },
  presetScroll: { flexDirection: 'row', gap: 10, paddingBottom: 16 },
  presetCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 100,
  },
  presetCardActive: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
  presetLogo: { fontSize: 24, marginBottom: 4 },
  presetName: { color: colors.text, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  presetPrice: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  presetTextActive: { color: '#fff' },

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
