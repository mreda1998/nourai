import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/context/auth-context';
import { Colors, Fonts, Radius } from '@/constants/theme';
import { BrandMark, EloryScreen, ScoreRing } from '@/components/elory';

const menu = [
  { title: 'Longevity domains', note: 'Skin, sleep, gut, hormonal, hair and fitness', route: '/domains' },
  { title: 'Edit health profile', note: 'Goals, concerns and personal context', route: '/health/edit-profile' },
  { title: 'Subscription', note: 'Elory Premium and billing', route: '/settings/subscription' },
  { title: 'Notifications', note: 'Evidence alerts and reminders', route: '/settings/notifications' },
  { title: 'Privacy & data', note: 'Permissions and account controls', route: '/settings/privacy' },
  { title: 'About Elory', note: 'Our evidence standards', route: '/settings/about' },
];

export default function ProfileHubScreen() {
  const { user, onboardingProfile, isSignedIn } = useAuth();
  const name = user?.name || 'Your profile';
  return (
    <EloryScreen header={<View style={styles.header}><BrandMark compact /><Pressable onPress={() => router.push('/settings/account' as never)}><Text style={styles.settings}>⚙</Text></Pressable></View>}>
      <View style={styles.identity}><View style={styles.avatar}><Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text></View><View><Text style={styles.name}>{name}</Text><Text style={styles.email}>{user?.email || (isSignedIn ? 'Elory member' : 'Guest profile')}</Text></View></View>
      <Pressable style={styles.healthCard} onPress={() => router.push('/domains' as never)}><ScoreRing score={78} qualifier="Good" size={92} /><View style={{ flex: 1 }}><Text style={styles.healthTitle}>Your health profile</Text><Text style={styles.healthCopy}>{onboardingProfile?.goals?.length || 3} goals selected · 6 longevity domains</Text><Text style={styles.healthLink}>Open full profile  →</Text></View></Pressable>
      <Text style={styles.section}>Profile & settings</Text>
      <View style={styles.menu}>{menu.map((item, index) => <Pressable key={item.title} style={[styles.row, index > 0 && styles.rowBorder]} onPress={() => router.push(item.route as never)}><View style={styles.rowIcon}><Text style={styles.rowIconText}>{index + 1}</Text></View><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{item.title}</Text><Text style={styles.rowNote}>{item.note}</Text></View><Text style={styles.arrow}>›</Text></Pressable>)}</View>
      {!isSignedIn ? <Pressable style={styles.signIn} onPress={() => router.push('/auth' as never)}><Text style={styles.signInText}>Sign in to sync your profile</Text></Pressable> : null}
    </EloryScreen>
  );
}

const styles = StyleSheet.create({ header: { height: 54, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, settings: { color: Colors.ink, fontSize: 17 }, identity: { flexDirection: 'row', alignItems: 'center', gap: 13, marginTop: 8, marginBottom: 20 }, avatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#D7C3A7', alignItems: 'center', justifyContent: 'center' }, avatarText: { fontFamily: Fonts.serifMedium, color: Colors.ink, fontSize: 25 }, name: { fontFamily: Fonts.serifMedium, color: Colors.ink, fontSize: 25 }, email: { fontFamily: Fonts.sans, color: Colors.inkSecondary, fontSize: 9.5, marginTop: 2 }, healthCard: { minHeight: 125, flexDirection: 'row', alignItems: 'center', gap: 15, backgroundColor: Colors.surfaceCard, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.borderHairline, borderRadius: Radius.lg, padding: 15, marginBottom: 25 }, healthTitle: { fontFamily: Fonts.serifMedium, color: Colors.ink, fontSize: 19 }, healthCopy: { fontFamily: Fonts.sans, color: Colors.inkSecondary, fontSize: 9, lineHeight: 13, marginTop: 4 }, healthLink: { fontFamily: Fonts.sansMedium, color: Colors.accent, fontSize: 9, marginTop: 8 }, section: { fontFamily: Fonts.serifMedium, color: Colors.ink, fontSize: 21, marginBottom: 8 }, menu: { backgroundColor: Colors.surfaceCard, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.borderHairline, borderRadius: Radius.md, paddingHorizontal: 13 }, row: { minHeight: 63, flexDirection: 'row', alignItems: 'center', gap: 10 }, rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.borderHairline }, rowIcon: { width: 31, height: 31, borderRadius: 16, backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }, rowIconText: { fontFamily: Fonts.serifItalic, color: Colors.accent, fontSize: 11 }, rowTitle: { fontFamily: Fonts.sansMedium, color: Colors.ink, fontSize: 10.5 }, rowNote: { fontFamily: Fonts.sans, color: Colors.inkSecondary, fontSize: 8, marginTop: 2 }, arrow: { color: Colors.inkSecondary, fontSize: 20 }, signIn: { height: 46, marginTop: 16, borderRadius: Radius.pill, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' }, signInText: { fontFamily: Fonts.sansMedium, color: Colors.accentInk, fontSize: 10 }, });
