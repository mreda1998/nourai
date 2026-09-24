import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Crown } from 'lucide-react-native';
import type { PurchasesPackage } from 'react-native-purchases';
import { usePurchases } from '@/context/purchases-context';
import { Palette, Radius } from '@/constants/theme';
import { Imagery } from '@/constants/imagery';
import { Button, PressableScale, Screen, Txt } from '@/components/ui';

const FEATURES = [
  ['Ask Elory', 'Answers grounded in your own stack'],
  ['Timing protocol', 'What to take, and when'],
  ['Interaction map', 'Synergies and conflicts at a glance'],
  ['Exposure ledger', 'Cumulative additive load over time'],
  ['Evidence pulse', 'New research, translated weekly'],
  ['Peptides library', 'Mechanisms, evidence and regulation'],
];

const isAnnual = (p: PurchasesPackage) => /annual|year/i.test(p.packageType ?? '') || /year/i.test(p.identifier);
const isMonthly = (p: PurchasesPackage) => /monthly|month/i.test(p.packageType ?? '') || /month/i.test(p.identifier);

export default function SubscriptionScreen() {
  const insets = useSafeAreaInsets();
  const { isLoading, isPremium, offerings, purchasePackage, restorePurchases, presentPaywall, presentCustomerCenter } = usePurchases();
  const packages = offerings?.current?.availablePackages ?? [];
  const annual = packages.find(isAnnual);
  const monthly = packages.find(isMonthly);
  const [choice, setChoice] = useState<'annual' | 'monthly'>(annual ? 'annual' : 'monthly');
  const [busy, setBusy] = useState(false);
  const selected = (choice === 'annual' ? annual : monthly) ?? packages[0];

  const savings = useMemo(() => {
    if (!annual || !monthly) return null;
    const pct = Math.round((1 - annual.product.price / (monthly.product.price * 12)) * 100);
    return pct > 0 ? pct : null;
  }, [annual, monthly]);

  const hasTrial = !!selected?.product.introPrice;

  const buy = async () => {
    setBusy(true);
    try { if (selected) await purchasePackage(selected); else await presentPaywall(); }
    catch (e) { Alert.alert('Purchase didn’t complete', e instanceof Error ? e.message : 'Please try again.'); }
    finally { setBusy(false); }
  };
  const restore = async () => {
    setBusy(true);
    try {
      const found = await restorePurchases();
      Alert.alert(found ? 'Restored' : 'Nothing to restore', found ? 'Your Elory Premium access is active.' : 'No active subscription was found for this account.');
    } finally { setBusy(false); }
  };

  if (isLoading) return <View style={{ flex: 1, backgroundColor: Palette.night, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={Palette.gold} /></View>;

  const hero = (
    <View style={{ height: 300 + insets.top }}>
      <View style={{ position: 'absolute', top: -600, left: 0, right: 0, height: 600, backgroundColor: Palette.night }} />
      <Image source={Imagery.atelier} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient colors={['rgba(10,29,28,0.4)', 'rgba(10,29,28,0.6)', Palette.night]} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
      <View style={{ position: 'absolute', left: 20, right: 20, bottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Crown size={16} color={Palette.gold} />
          <Txt variant="overline" tone="gold">Elory Premium</Txt>
        </View>
        <Txt variant="display" tone="inverse" style={{ marginTop: 10 }}>{isPremium ? 'You’re a member.' : 'See your health with more clarity.'}</Txt>
      </View>
    </View>
  );

  if (isPremium) {
    return (
      <Screen night back hero={hero}>
        <Txt variant="callout" tone="inverse2" style={{ marginTop: 16 }}>Every evidence tool is unlocked. Thank you for supporting independent research.</Txt>
        <Button label="Manage subscription" variant="night" style={{ marginTop: 24 }} onPress={() => presentCustomerCenter()} />
      </Screen>
    );
  }

  return (
    <Screen night back hero={hero}>
      <View style={{ gap: 14, marginTop: 20 }}>
        {FEATURES.map(([t, d]) => (
          <View key={t} style={{ flexDirection: 'row', gap: 12 }}>
            <View style={styles.tick}><Check size={13} color={Palette.night} strokeWidth={3} /></View>
            <View style={{ flex: 1 }}>
              <Txt variant="headline" tone="inverse">{t}</Txt>
              <Txt variant="footnote" tone="inverse2">{d}</Txt>
            </View>
          </View>
        ))}
      </View>

      {packages.length ? (
        <View style={{ gap: 10, marginTop: 28 }}>
          {annual ? <Plan pkg={annual} title="Yearly" selected={choice === 'annual'} onPress={() => setChoice('annual')} badge={savings ? `Save ${savings}%` : undefined} period="year" /> : null}
          {monthly ? <Plan pkg={monthly} title="Monthly" selected={choice === 'monthly'} onPress={() => setChoice('monthly')} period="month" /> : null}
        </View>
      ) : null}

      <Button label={hasTrial ? 'Start free trial' : packages.length ? 'Subscribe' : 'See plans'} variant="night" loading={busy} style={{ marginTop: 20 }} onPress={buy} />
      <Button label="Restore purchases" variant="tertiary" disabled={busy} onPress={restore} style={{ marginTop: 4 }} />
      <Txt variant="caption" tone="inverse3" align="center" style={{ marginTop: 12 }}>
        Renews automatically unless cancelled at least 24 hours before the period ends. Managed by your {Platform.OS === 'ios' ? 'Apple' : 'Google Play'} account.
      </Txt>
    </Screen>
  );
}

function Plan({ pkg, title, selected, onPress, badge, period }: { pkg: PurchasesPackage; title: string; selected: boolean; onPress: () => void; badge?: string; period: 'year' | 'month' }) {
  const perMonth = period === 'year' ? pkg.product.pricePerMonthString : null;
  return (
    <PressableScale haptic="selection" onPress={onPress} accessibilityState={{ selected }} style={[styles.plan, selected && styles.planActive]}>
      <View style={[styles.radio, selected && styles.radioActive]}>{selected ? <View style={styles.radioDot} /> : null}</View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Txt variant="headline" tone="inverse">{title}</Txt>
          {badge ? <View style={styles.badge}><Txt variant="caption" color={Palette.night}>{badge}</Txt></View> : null}
        </View>
        {perMonth ? <Txt variant="footnote" tone="inverse2">{perMonth} / month</Txt> : null}
      </View>
      <Txt variant="headline" tone="inverse">{pkg.product.priceString}<Txt variant="footnote" tone="inverse2"> / {period}</Txt></Txt>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  tick: { width: 22, height: 22, borderRadius: 11, backgroundColor: Palette.gold, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  plan: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: Radius.lg, borderCurve: 'continuous', backgroundColor: Palette.nightRaised, borderWidth: 1.5, borderColor: Palette.nightHairline },
  planActive: { borderColor: Palette.gold },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: Palette.nightInk3, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: Palette.gold },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: Palette.gold },
  badge: { paddingHorizontal: 8, height: 22, borderRadius: 11, backgroundColor: Palette.gold, justifyContent: 'center' },
});
