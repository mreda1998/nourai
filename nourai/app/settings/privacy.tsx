import React from 'react';
import { Linking, View } from 'react-native';
import { BarChart3, Heart, Layers, Mail, ScanLine, ShieldCheck } from 'lucide-react-native';
import { Palette } from '@/constants/theme';
import { Button, Card, ListGroup, ListRow, Screen, Section, Txt } from '@/components/ui';

export default function PrivacyScreen() {
  return (
    <Screen back title="Privacy & data">
      <Card padding={20}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <ShieldCheck size={22} color={Palette.accent} />
          <Txt variant="headline">Your data, your control</Txt>
        </View>
        <Txt variant="callout" tone="secondary" style={{ marginTop: 10 }}>
          Elory never sells your personal data. Your scans, health profile and stack are stored securely and used only to personalise the app for you.
        </Txt>
      </Card>

      <Section title="What we collect">
        <ListGroup>
          <ListRow icon={ScanLine} title="Products you scan and search" />
          <ListRow icon={Heart} title="Goals and health context you share" />
          <ListRow icon={Layers} title="Your supplement, skincare and food stack" />
          <ListRow icon={BarChart3} title="Anonymous usage analytics" subtitle="No personally identifiable information" />
        </ListGroup>
      </Section>

      <Section title="Delete your data">
        <Txt variant="subhead" tone="secondary">Request full deletion and we’ll process it within 30 days.</Txt>
        <ListGroup style={{ marginTop: 12 }}>
          <ListRow icon={Mail} title="Email privacy@elory.app" onPress={() => Linking.openURL('mailto:privacy@elory.app')} />
        </ListGroup>
      </Section>

      <Button label="Read the full privacy policy" variant="secondary" style={{ marginTop: 28 }} onPress={() => Linking.openURL('https://elory.app/privacy')} />
    </Screen>
  );
}
