import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { PurchasesPackage } from 'react-native-purchases';
import { usePurchases } from '@/context/purchases-context';
import { Colors, Fonts, Radius } from '@/constants/theme';
import { EloryScreen, ScreenHeader } from '@/components/elory';

const features = [
  ['Ask Elory', 'Personal answers grounded in your stack'],
  ['Circadian protocols', 'Know what to take and when'],
  ['Conflict map', 'See competing ingredients at a glance'],
  ['Exposure ledger', 'Track cumulative load over time'],
  ['Evidence Pulse', 'New research, translated clearly'],
  ['Peptides library', 'Mechanisms, evidence and safety'],
];

export default function SubscriptionScreen() {
  const { isLoading, isPremium, offerings, purchasePackage, restorePurchases, presentPaywall, presentCustomerCenter } = usePurchases();
  const packages = offerings?.current?.availablePackages ?? [];
  const [period, setPeriod] = useState<'annual' | 'monthly'>('annual');
  const [busy, setBusy] = useState(false);
  const selected = useMemo(() => packages.find((item) => item.packageType?.toLowerCase().includes(period === 'annual' ? 'annual' : 'monthly')) ?? packages[0], [packages, period]);

  const buy = async () => {
    setBusy(true);
    try {
      if (selected) await purchasePackage(selected);
      else await presentPaywall();
    } catch (reason) { Alert.alert('Purchase failed', reason instanceof Error ? reason.message : 'Please try again.'); }
    finally { setBusy(false); }
  };
  const restore = async () => { setBusy(true); try { const found = await restorePurchases(); Alert.alert(found ? 'Restored' : 'Nothing to restore', found ? 'Your Elory Premium access is active.' : 'No active subscription was found.'); } finally { setBusy(false); } };

  if (isLoading) return <View style={styles.loading}><ActivityIndicator color={Colors.accent} /></View>;
  if (isPremium) return <EloryScreen header={<ScreenHeader back title="Subscription" />}><View style={styles.active}><Text style={styles.activeKicker}>ELORY PREMIUM</Text><Text style={styles.activeTitle}>Your membership is active.</Text><Text style={styles.activeCopy}>Every evidence tool and unlimited stack intelligence is available.</Text></View><Pressable style={styles.primary} onPress={() => presentCustomerCenter()}><Text style={styles.primaryText}>Manage subscription</Text></Pressable></EloryScreen>;

  return (
    <EloryScreen header={<ScreenHeader back title="Elory Premium" />}>
      <View style={styles.mark}><Text style={styles.markText}>E</Text></View>
      <Text style={styles.title}>See your health{`\n`}with greater clarity.</Text>
      <Text style={styles.subtitle}>Deeper intelligence for your products, routine and longevity plan.</Text>
      <View style={styles.featureCard}>{features.map(([title, copy], index) => <View key={title} style={[styles.feature, index > 0 && styles.featureBorder]}><View style={styles.check}><Text style={styles.checkText}>✓</Text></View><View style={{ flex: 1 }}><Text style={styles.featureTitle}>{title}</Text><Text style={styles.featureCopy}>{copy}</Text></View></View>)}</View>
      <View style={styles.toggle}><Pressable style={[styles.toggleItem, period === 'annual' && styles.toggleActive]} onPress={() => setPeriod('annual')}><Text style={[styles.toggleText, period === 'annual' && styles.toggleTextActive]}>Yearly</Text><Text style={styles.save}>SAVE 35%</Text></Pressable><Pressable style={[styles.toggleItem, period === 'monthly' && styles.toggleActive]} onPress={() => setPeriod('monthly')}><Text style={[styles.toggleText, period === 'monthly' && styles.toggleTextActive]}>Monthly</Text></Pressable></View>
      <Text style={styles.price}>{selected?.product.priceString || (period === 'annual' ? '$7.99' : '$11.99')}<Text style={styles.pricePeriod}> / month</Text></Text>
      <Text style={styles.billing}>{period === 'annual' ? 'Billed yearly after your free trial.' : 'Billed monthly. Cancel anytime.'}</Text>
      <Pressable style={styles.primary} onPress={buy} disabled={busy}>{busy ? <ActivityIndicator color={Colors.accentInk} /> : <Text style={styles.primaryText}>Start 7-day free trial</Text>}</Pressable>
      <Pressable style={styles.restore} onPress={restore} disabled={busy}><Text style={styles.restoreText}>Restore purchases</Text></Pressable>
      <Text style={styles.legal}>Subscriptions renew automatically unless cancelled at least 24 hours before renewal. Payment is managed by your {Platform.OS === 'ios' ? 'Apple' : 'Google Play'} account.</Text>
    </EloryScreen>
  );
}

const styles = StyleSheet.create({ loading: { flex: 1, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' }, mark: { width: 54, height: 54, borderRadius: 27, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: 7, marginBottom: 14 }, markText: { fontFamily: Fonts.serifItalic, color: Colors.accentInk, fontSize: 25 }, title: { fontFamily: Fonts.serif, fontSize: 31, lineHeight: 33, color: Colors.ink, textAlign: 'center' }, subtitle: { fontFamily: Fonts.sans, color: Colors.inkSecondary, fontSize: 10, lineHeight: 15, textAlign: 'center', paddingHorizontal: 30, marginTop: 7, marginBottom: 18 }, featureCard: { backgroundColor: Colors.surfaceCard, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.borderHairline, paddingHorizontal: 14 }, feature: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10 }, featureBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.borderHairline }, check: { width: 25, height: 25, borderRadius: 13, backgroundColor: '#DDE8E1', alignItems: 'center', justifyContent: 'center' }, checkText: { color: Colors.accent, fontSize: 11 }, featureTitle: { fontFamily: Fonts.sansMedium, color: Colors.ink, fontSize: 10.5 }, featureCopy: { fontFamily: Fonts.sans, color: Colors.inkSecondary, fontSize: 8.5, marginTop: 2 }, toggle: { height: 48, borderRadius: Radius.pill, backgroundColor: Colors.surfaceAlt, padding: 4, flexDirection: 'row', marginTop: 16 }, toggleItem: { flex: 1, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' }, toggleActive: { backgroundColor: Colors.surfaceCard }, toggleText: { fontFamily: Fonts.sansMedium, color: Colors.inkSecondary, fontSize: 10 }, toggleTextActive: { color: Colors.ink }, save: { position: 'absolute', right: 7, top: 4, fontFamily: Fonts.sansSemiBold, color: Colors.accent, fontSize: 5.8, letterSpacing: .4 }, price: { fontFamily: Fonts.serifMedium, color: Colors.ink, fontSize: 29, textAlign: 'center', marginTop: 15 }, pricePeriod: { fontFamily: Fonts.sans, fontSize: 9, color: Colors.inkSecondary }, billing: { fontFamily: Fonts.sans, color: Colors.inkSecondary, textAlign: 'center', fontSize: 8.5, marginTop: 2, marginBottom: 12 }, primary: { height: 48, borderRadius: Radius.pill, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' }, primaryText: { fontFamily: Fonts.sansMedium, color: Colors.accentInk, fontSize: 10.5 }, restore: { padding: 12, alignItems: 'center' }, restoreText: { fontFamily: Fonts.sansMedium, color: Colors.accent, fontSize: 9.5 }, legal: { fontFamily: Fonts.sans, color: Colors.inkTertiary, fontSize: 7, lineHeight: 10.5, textAlign: 'center', paddingHorizontal: 22 }, active: { backgroundColor: Colors.surfaceCard, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.borderHairline, padding: 24, alignItems: 'center', marginVertical: 30 }, activeKicker: { fontFamily: Fonts.sansSemiBold, color: Colors.accent, letterSpacing: 1.3, fontSize: 8 }, activeTitle: { fontFamily: Fonts.serifMedium, color: Colors.ink, fontSize: 25, marginTop: 8 }, activeCopy: { fontFamily: Fonts.sans, color: Colors.inkSecondary, fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 6 } });
