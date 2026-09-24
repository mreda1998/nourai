import React from 'react';
import { Alert, Linking, View } from 'react-native';
import { router } from 'expo-router';
import { LogOut, Mail, SlidersHorizontal, Trash2, UserRound } from 'lucide-react-native';
import { Palette } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { Button, Card, EmptyState, ListGroup, ListRow, Screen, Section, Txt } from '@/components/ui';

export default function AccountScreen() {
  const { user, isSignedIn, signOut } = useAuth();

  const confirmSignOut = () => Alert.alert('Sign out?', 'Your stack stays saved to your account.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign out', style: 'destructive', onPress: async () => { await signOut(); router.replace('/auth'); } },
  ]);

  const deleteAccount = () => Alert.alert(
    'Delete your account?',
    'This permanently removes your account, scan history, health profile and stack. To confirm it’s you, deletion is handled by our support team.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Email support', style: 'destructive', onPress: () => Linking.openURL('mailto:support@elory.app?subject=Delete%20my%20Elory%20account') },
    ],
  );

  if (!isSignedIn) {
    return (
      <Screen back title="Account">
        <EmptyState icon={UserRound} title="You’re browsing as a guest" message="Sign in to sync your stack and history across devices." />
        <Button label="Sign in or create account" onPress={() => router.push('/auth')} />
      </Screen>
    );
  }

  return (
    <Screen back title="Account">
      <Card padding={20} style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: Palette.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Txt variant="title1" tone="accent">{(user?.name || user?.email || 'E').slice(0, 1).toUpperCase()}</Txt>
        </View>
        <View style={{ flex: 1 }}>
          <Txt variant="headline">{user?.name || 'Elory member'}</Txt>
          <Txt variant="footnote" tone="secondary" style={{ marginTop: 2 }}>{user?.email}</Txt>
        </View>
      </Card>

      <Section title="Profile">
        <ListGroup>
          <ListRow icon={SlidersHorizontal} title="Health profile" subtitle="Goals, concerns and personal context" onPress={() => router.push('/health/edit-profile')} />
          <ListRow icon={Mail} title="Email" value={user?.email} chevron={false} />
        </ListGroup>
        <Txt variant="footnote" tone="tertiary" style={{ marginTop: 8, paddingHorizontal: 4 }}>To change your email, contact support@elory.app.</Txt>
      </Section>

      <Section title="Session">
        <ListGroup>
          <ListRow icon={LogOut} title="Sign out" onPress={confirmSignOut} chevron={false} />
        </ListGroup>
      </Section>

      <Section title="Danger zone">
        <ListGroup>
          <ListRow icon={Trash2} iconTint={Palette.weak} title="Delete account" destructive onPress={deleteAccount} chevron={false} />
        </ListGroup>
        <Txt variant="footnote" tone="tertiary" style={{ marginTop: 8, paddingHorizontal: 4 }}>
          Deleting removes your scan history, health profile and saved stack permanently.
        </Txt>
      </Section>
    </Screen>
  );
}
