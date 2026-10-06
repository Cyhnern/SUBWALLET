import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors } from '../theme';
import type { Subscription } from '../types/api';
import { CYCLE_LABELS, STATUS_LABELS, formatDate, formatMoney, subscriptionName } from '../utils/format';

const STATUS_COLORS: Record<Subscription['status'], string> = {
  active: colors.success,
  paused: colors.warning,
  trial: colors.primary,
  cancelled: colors.textMuted,
  expired: colors.danger,
};

export function SubscriptionCard({
  subscription,
  onPress,
}: {
  subscription: Subscription;
  onPress?: () => void;
}) {
  const name = subscriptionName(subscription);
  const statusColor = STATUS_COLORS[subscription.status];

  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.cardPressed]} onPress={onPress}>
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          {subscription.category ? (
            <Text style={styles.category} numberOfLines={1}>
              {subscription.category.name}
            </Text>
          ) : null}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '22' }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {STATUS_LABELS[subscription.status]}
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.price}>
          {formatMoney(subscription.price, subscription.currency)}
          <Text style={styles.cycle}> / {CYCLE_LABELS[subscription.billingCycle]}</Text>
        </Text>
        <Text style={styles.renewalDate}>Yenileme: {formatDate(subscription.nextBillingDate)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardPressed: { opacity: 0.75 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  titleBlock: { flex: 1, marginRight: 8 },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  category: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '600' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  price: { fontSize: 18, fontWeight: '700', color: colors.text },
  cycle: { fontSize: 13, fontWeight: '400', color: colors.textMuted },
  renewalDate: { fontSize: 12, color: colors.textMuted },
});
