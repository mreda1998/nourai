import React from 'react';
import { Linking, View } from 'react-native';
import Constants from 'expo-constants';
import { FileText, LifeBuoy, ShieldCheck } from 'lucide-react-native';
import { Palette } from '@/constants/theme';
import { Card, ListGroup, ListRow, Screen, Section, Txt } from '@/components/ui';

const STANDARDS = [
  ['Evidence first', 'Every ingredient is graded on peer-reviewed research, weighted by study quality.'],
  ['Belief vs. reality', 'We show what people think an ingredient does next to what the data supports.'],
  ['No paid placement', 'Brands can’t buy scores, rankings or visibility.'],
];

export default function AboutScreen() {
  const version = Constants.expoConfig?.version ?? '—';
  return (
    <Screen back title="About Elory">
      <Card padding={24} style={{ alignItems: 'center' }}>
        <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: Palette.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Txt variant="largeTitle" tone="inverse" italic>E</Txt>
        </View>
        <Txt variant="title1" style={{ marginTop: 16 }}>Elory</Txt>
        <Txt variant="subhead" tone="secondary" style={{ marginTop: 4 }}>Evidence over opinion.</Txt>
        <Txt variant="caption" tone="tertiary" style={{ marginTop: 8 }}>Version {version}</Txt>
      </Card>

      <Section title="Our standards">
        <Card padding={6}>
          {STANDARDS.map(([t, d], i) => (
            <View key={t} style={{ padding: 14, borderTopWidth: i ? 0.5 : 0, borderTopColor: Palette.hairline }}>
              <Txt variant="headline">{t}</Txt>
              <Txt variant="footnote" tone="secondary" style={{ marginTop: 3 }}>{d}</Txt>
            </View>
          ))}
        </Card>
      </Section>

      <Section title="Legal & support">
        <ListGroup>
          <ListRow icon={FileText} title="Terms of Service" onPress={() => Linking.openURL('https://elory.app/terms')} />
          <ListRow icon={ShieldCheck} title="Privacy Policy" onPress={() => Linking.openURL('https://elory.app/privacy')} />
          <ListRow icon={LifeBuoy} title="Contact support" subtitle="support@elory.app" onPress={() => Linking.openURL('mailto:support@elory.app')} />
        </ListGroup>
      </Section>
    </Screen>
  );
}
