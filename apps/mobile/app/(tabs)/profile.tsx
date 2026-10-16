import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ScrollView,
  TextInput,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../../src/context/AuthContext';
import { usersApi } from '../../src/api/users';
import { ApiError } from '../../src/api/client';
import { colors } from '../../src/theme';
import { registerForPushNotificationsAsync } from '../../src/utils/notifications';

const RENEWAL_DAY_OPTIONS = [
  { days: 7, label: '7 Gün Önce' },
  { days: 3, label: '3 Gün Önce' },
  { days: 1, label: '1 Gün Önce' },
];

export default function ProfileScreen() {
  const { user, logout, refreshUser } = useAuth();
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [baseCurrency, setBaseCurrency] = useState(user?.baseCurrency ?? 'USD');
  const [saving, setSaving] = useState(false);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [pushRegistering, setPushRegistering] = useState(false);

  const zombieAlerts = user?.notificationPreference?.zombieAlertsEnabled ?? true;
  const emailEnabled = user?.notificationPreference?.channels?.includes('email') ?? false;
  const currentDays = user?.notificationPreference?.daysBeforeRenewal ?? [3, 1];

  function handleLogout() {
    Alert.alert('Çıkış yap', 'Oturumu kapatmak istediğine emin misin?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Çıkış Yap', style: 'destructive', onPress: () => logout() },
    ]);
  }

  async function handleSaveProfile() {
    if (fullName.trim().length < 2) {
      Alert.alert('Geçersiz isim', 'Ad en az 2 karakter olmalı.');
      return;
    }
    const currency = baseCurrency.trim().toUpperCase();
    if (currency.length !== 3) {
      Alert.alert('Geçersiz para birimi', 'ISO 4217 kodu gir (ör. TRY, USD, EUR).');
      return;
    }

    setSaving(true);
    try {
      await usersApi.updateMe({ fullName: fullName.trim(), baseCurrency: currency });
      await refreshUser();
      Alert.alert('Kaydedildi', 'Profil bilgilerin güncellendi.');
    } catch (err) {
      Alert.alert('Hata', err instanceof ApiError ? err.message : 'Profil güncellenemedi.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleZombieAlerts(value: boolean) {
    setPrefsSaving(true);
    try {
      await usersApi.updateNotificationPreferences({ zombieAlertsEnabled: value });
      await refreshUser();
    } catch (err) {
      Alert.alert('Hata', err instanceof ApiError ? err.message : 'Tercih kaydedilemedi.');
    } finally {
      setPrefsSaving(false);
    }
  }

  async function toggleEmail(value: boolean) {
    setPrefsSaving(true);
    try {
      const channels = value ? (['push', 'email'] as const) : (['push'] as const);
      await usersApi.updateNotificationPreferences({ channels: [...channels] });
      await refreshUser();
    } catch (err) {
      Alert.alert('Hata', err instanceof ApiError ? err.message : 'Tercih kaydedilemedi.');
    } finally {
      setPrefsSaving(false);
    }
  }

  async function toggleRenewalDay(day: number) {
    setPrefsSaving(true);
    try {
      let updatedDays = [...currentDays];
      if (updatedDays.includes(day)) {
        if (updatedDays.length === 1) {
          Alert.alert('Uyarı', 'En az bir hatırlatma günü seçili olmalıdır.');
          setPrefsSaving(false);
          return;
        }
        updatedDays = updatedDays.filter((d) => d !== day);
      } else {
        updatedDays.push(day);
      }
      updatedDays.sort((a, b) => b - a);
      await usersApi.updateNotificationPreferences({ daysBeforeRenewal: updatedDays });
      await refreshUser();
    } catch (err) {
      Alert.alert('Hata', err instanceof ApiError ? err.message : 'Tercih kaydedilemedi.');
    } finally {
      setPrefsSaving(false);
    }
  }

  async function handleEnablePushNotifications() {
    setPushRegistering(true);
    try {
      const token = await registerForPushNotificationsAsync();
      if (token) {
        await refreshUser();
        Alert.alert('Başarılı 🔔', 'Push bildirimleri başarıyla aktif edildi!');
      } else {
        Alert.alert('Bilgi', 'Cihazınızda bildirim izni verilmedi veya desteklenmiyor.');
      }
    } catch (err) {
      Alert.alert('Hata', 'Bildirim izni alınırken hata oluştu.');
    } finally {
      setPushRegistering(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{user?.fullName?.[0]?.toUpperCase() ?? '?'}</Text>
      </View>
      <Text style={styles.email}>{user?.email}</Text>

      <Text style={styles.label}>Ad Soyad</Text>
      <TextInput
        style={styles.input}
        value={fullName}
        onChangeText={setFullName}
        placeholder="Ad Soyad"
        placeholderTextColor={colors.textMuted}
      />

      <Text style={styles.label}>Temel para birimi</Text>
      <TextInput
        style={styles.input}
        value={baseCurrency}
        onChangeText={setBaseCurrency}
        autoCapitalize="characters"
        maxLength={3}
        placeholder="TRY"
        placeholderTextColor={colors.textMuted}
      />

      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>Saat dilimi</Text>
        <Text style={styles.infoValue}>{user?.timezone}</Text>
      </View>

      <Pressable
        style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}
        onPress={handleSaveProfile}
        disabled={saving}
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Profili Kaydet</Text>}
      </Pressable>

      {/* Notifications Section */}
      <Text style={styles.sectionTitle}>🔔 Bildirim & Hatırlatıcı Ayarları</Text>

      <Pressable
        style={styles.pushEnableButton}
        onPress={handleEnablePushNotifications}
        disabled={pushRegistering}
      >
        {pushRegistering ? (
          <ActivityIndicator color={colors.primary} size="small" />
        ) : (
          <Text style={styles.pushEnableText}>
            📲 Cihaz Push Bildirimlerini Etkinleştir
          </Text>
        )}
      </Pressable>

      {/* Renewal Days Selection */}
      <View style={styles.prefSection}>
        <Text style={styles.prefTitle}>Hatırlatma Günleri</Text>
        <Text style={styles.prefHint}>Yenileme tarihinden kaç gün önce bildirim gönderilsin?</Text>
        <View style={styles.daysContainer}>
          {RENEWAL_DAY_OPTIONS.map((option) => {
            const isSelected = currentDays.includes(option.days);
            return (
              <Pressable
                key={option.days}
                style={[styles.dayChip, isSelected && styles.dayChipActive]}
                onPress={() => toggleRenewalDay(option.days)}
                disabled={prefsSaving}
              >
                <Text style={[styles.dayChipText, isSelected && styles.dayChipTextActive]}>
                  {isSelected ? '✓ ' : ''}{option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.prefRow}>
        <View style={styles.prefCopy}>
          <Text style={styles.prefTitle}>Zombi abonelik uyarıları</Text>
          <Text style={styles.prefHint}>Kullanılmayan abonelikler için bildirim al</Text>
        </View>
        <Switch
          value={zombieAlerts}
          onValueChange={toggleZombieAlerts}
          disabled={prefsSaving}
          trackColor={{ true: colors.primaryDark }}
        />
      </View>

      <View style={styles.prefRow}>
        <View style={styles.prefCopy}>
          <Text style={styles.prefTitle}>E-posta hatırlatıcıları</Text>
          <Text style={styles.prefHint}>Yenileme öncesi e-posta da gönderilsin</Text>
        </View>
        <Switch
          value={emailEnabled}
          onValueChange={toggleEmail}
          disabled={prefsSaving}
          trackColor={{ true: colors.primaryDark }}
        />
      </View>

      <Pressable style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Çıkış Yap</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { alignItems: 'center', paddingTop: 32, paddingHorizontal: 24, paddingBottom: 48 },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: { fontSize: 32, fontWeight: '700', color: '#fff' },
  email: { fontSize: 14, color: colors.textMuted, marginBottom: 24 },
  label: { fontSize: 13, color: colors.textMuted, marginBottom: 6, marginTop: 14, alignSelf: 'stretch' },
  input: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: { color: colors.textMuted, fontSize: 14 },
  infoValue: { color: colors.text, fontSize: 14, fontWeight: '600' },
  saveButton: {
    marginTop: 20,
    backgroundColor: colors.primaryDark,
    paddingVertical: 14,
    borderRadius: 12,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  pressed: { opacity: 0.85 },
  saveText: { color: '#fff', fontWeight: '600', fontSize: 15 },

  sectionTitle: {
    alignSelf: 'stretch',
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 32,
    marginBottom: 12,
    textTransform: 'uppercase',
  },

  pushEnableButton: {
    alignSelf: 'stretch',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  pushEnableText: { color: colors.primary, fontSize: 14, fontWeight: '600' },

  prefSection: {
    width: '100%',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  prefCopy: { flex: 1, marginRight: 12 },
  prefTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  prefHint: { color: colors.textMuted, fontSize: 12, marginTop: 2 },

  daysContainer: { flexDirection: 'row', gap: 8, marginTop: 10 },
  dayChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayChipActive: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
  dayChipText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  dayChipTextActive: { color: '#fff' },

  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },

  logoutButton: {
    marginTop: 36,
    backgroundColor: colors.danger + '18',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  logoutText: { color: colors.danger, fontWeight: '600', fontSize: 15 },
});
