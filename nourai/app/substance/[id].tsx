import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CircleSlash } from 'lucide-react-native';
import { api, type SubstanceDetail } from '@/services/api';
import { Button, EmptyState, Pill, Screen, SkeletonCard, Txt } from '@/components/ui';
import { RulesSection } from '@/components/rules/RulesSection';
import { deviceRegion } from '@/lib/region';
import { userCountry } from '@/utils/rules';

/** Rules for a label ingredient we haven't researched: what the law says, and a way to the research. */
export default function SubstanceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<SubstanceDetail | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  const load = () => {
    if (!id) return;
    setState('loading');
    api.getSubstance(id, userCountry(deviceRegion()))
      .then((d) => { setData(d); setState('ready'); })
      .catch(() => setState('error'));
  };
  useEffect(load, [id]);

  if (state === 'loading') return <Screen back><SkeletonCard lines={2} /><SkeletonCard lines={4} /></Screen>;
  if (state === 'error' || !data) {
    return (
      <Screen back>
        <EmptyState icon={CircleSlash} title="Couldn’t load the rules" message="Check your connection and try again." action="Try again" onAction={load} />
      </Screen>
    );
  }

  const hasRules = data.rules.substances.some((s) => s.places.length || s.expert_views.length);
  return (
    <Screen back title={data.name}>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: -6 }}>
        <Pill label="Not researched yet" />
        {data.e_number ? <Pill label={data.e_number} /> : null}
      </View>
      {hasRules ? <RulesSection rules={data.rules} /> : (
        <Txt variant="body" tone="secondary" style={{ marginTop: 24 }}>We haven’t found a specific rule for this ingredient in the places we cover.</Txt>
      )}
      {data.ingredient_ids[0] ? (
        <Button label="See the research" style={{ marginTop: 24 }} onPress={() => router.push(`/ingredient/${data.ingredient_ids[0]}` as never)} />
      ) : null}
    </Screen>
  );
}
