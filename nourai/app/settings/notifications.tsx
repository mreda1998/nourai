import React, { useEffect, useState } from 'react';
import { Linking, Switch } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AlertOctagon, Bell, FlaskConical, Lightbulb, Settings, Sparkles, Timer } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Palette } from '@/constants/theme';
import { ListGroup, ListRow, Screen, Section, Txt } from '@/components/ui';

const KEY = '@elory_notification_prefs';

const TYPES: { id: string; title: string; subtitle: string; Icon: LucideIcon; default: boolean }[] = [
  { id: 'product_recalls', title: 'Product recalls', subtitle: 'When something in your stack is recalled', Icon: AlertOctagon, default: true },
  { id: 'ingredient_updates', title: 'New research', subtitle: 'Findings about ingredients you use', Icon: FlaskConical, default: true },
  { id: 'stack_reminders', title: 'Stack reminders', subtitle: 'A nudge at the times you take things', Icon: Timer, default: false },
  { id: 'health_tips', title: 'Tips for you', subtitle: 'Based on your health profile', Icon: Lightbulb, default: true },
  { id: 'new_features', title: 'What’s new', subtitle: 'App updates and features', Icon: Sparkles, default: false },
];

type Prefs = { master: boolean } & Record<string, boolean>;
const DEFAULTS: Prefs = { master: true, ...Object.fromEntries(TYPES.map((t) => [t.id, t.default])) } as Prefs;

export default function NotificationsScreen() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((raw) => { if (raw) setPrefs({ ...DEFAULTS, ...JSON.parse(raw) }); }).catch(() => {});
  }, []);

  const update = (patch: Partial<Prefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch } as Prefs;
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const toggle = (value: boolean, onChange: (v: boolean) => void, disabled = false) => (
    <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ false: Palette.sunken, true: Palette.accent }} ios_backgroundColor={Palette.sunken} />
  );

  return (
    <Screen back title="Notifications">
      <ListGroup>
        <ListRow icon={Bell} title="Allow notifications" subtitle="Turn everything on or off" trailing={toggle(prefs.master, (v) => update({ master: v }))} />
      </ListGroup>

      <Section title="What to notify me about">
        <ListGroup>
          {TYPES.map((t) => (
            <ListRow
              key={t.id}
              icon={t.Icon}
              title={t.title}
              subtitle={t.subtitle}
              trailing={toggle(prefs.master && prefs[t.id], (v) => update({ [t.id]: v }), !prefs.master)}
            />
          ))}
        </ListGroup>
        <Txt variant="footnote" tone="tertiary" style={{ marginTop: 8, paddingHorizontal: 4 }}>Preferences are saved on this device.</Txt>
      </Section>

      <Section>
        <ListGroup>
          <ListRow icon={Settings} title="Open system settings" subtitle="Manage permission for Elory in iOS Settings" onPress={() => Linking.openSettings()} />
        </ListGroup>
      </Section>
    </Screen>
  );
}
