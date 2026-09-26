import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { Check, SlidersHorizontal } from 'lucide-react-native';
import { api, HealthDomainResponse } from '@/services/api';
import { APP_DOMAIN_TO_BIODOMAIN } from '@/constants/biodomains';
import { useAppState } from '@/context/app-state';
import { isCatalogueId } from '@/lib/insights';
import { Palette } from '@/constants/theme';
import { scoreQualifier } from '@/utils/grade';
import { Button, Card, EvidenceMeter, IconButton, ListGroup, ListRow, ScoreGauge, Screen, Section, Txt } from '@/components/ui';

export interface HealthDomainConfig {
  key: 'skin' | 'sleep' | 'gut' | 'hormonal' | 'hair' | 'fitness';
  title: string;
  /** @deprecated placeholder values — no longer displayed. */
  score?: number;
  /** @deprecated */
  qualifier?: string;
  /** @deprecated */
  metrics?: { label: string; value: number }[];
  /** General, non-personal factors known to matter for this domain. */
  factors: { name: string; note: string; strength: number; status: string }[];
  recommendations: string[];
}

/**
 * Health domain detail. Shows the user's real domain score from the API, or
 * an honest empty state — never placeholder numbers.
 */
export function HealthDomainScreen({ config }: { config: HealthDomainConfig }) {
  const { stack } = useAppState();
  const [remote, setRemote] = useState<HealthDomainResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const biodomain = APP_DOMAIN_TO_BIODOMAIN[config.key];
  const stackIds = stack.map((p) => p.id).filter(isCatalogueId).join(',');

  useEffect(() => {
    if (!biodomain || !stackIds) { setRemote(null); setLoading(false); return; }
    setLoading(true);
    api.getStackDomain(biodomain, stackIds.split(','))
      // Zero with no contributing ingredients means "nothing in the stack affects this yet".
      .then((r) => setRemote(r.score || r.factors.length ? r : null))
      .catch(() => setRemote(null))
      .finally(() => setLoading(false));
  }, [biodomain, stackIds]);

  const personal = remote?.factors?.length ? remote.factors : null;
  const name = config.title.replace(/ health$/i, '').toLowerCase();

  return (
    <Screen back title={config.title} right={<IconButton icon={SlidersHorizontal} label="Edit health profile" onPress={() => router.push('/health/edit-profile' as never)} />}>
      <Card padding={20} style={{ alignItems: 'center' }}>
        {loading ? <View style={{ height: 180, justifyContent: 'center' }}><ActivityIndicator color={Palette.accent} /></View> : remote ? (
          <>
            <ScoreGauge score={remote.score} size={220} label={`${config.title} score`} qualifier={remote.qualifier || scoreQualifier(remote.score)} />
            <Txt variant="subhead" tone="secondary" align="center" style={{ marginTop: -6 }}>
              Based on your profile, your stack and the evidence behind each ingredient.
            </Txt>
          </>
        ) : (
          <View style={{ paddingVertical: 12, alignItems: 'center' }}>
            <Txt variant="title2" align="center">{biodomain ? 'Not enough data yet' : 'Scoring coming soon'}</Txt>
            <Txt variant="subhead" tone="secondary" align="center" style={{ marginTop: 8 }}>
              {biodomain
                ? `Add products that affect ${name} to your stack and Elory will score this area for you.`
                : `We’re still building the evidence base for ${name}. Below is what the research says in general.`}
            </Txt>
            {biodomain ? <Button label="Add products" size="md" fullWidth={false} style={{ marginTop: 16 }} onPress={() => router.push('/(tabs)/explore' as never)} /> : null}
          </View>
        )}
      </Card>

      {personal ? (
        <Section title="From your stack" caption={`Ingredients affecting your ${name}`}>
          <ListGroup>
            {personal.map((f, i) => (
              <ListRow
                key={`${f.ingredient_name}-${i}`}
                title={f.ingredient_name}
                subtitle={f.direction === 'benefit' ? 'Supports this area' : f.direction === 'harm' ? 'Worth monitoring' : 'Mixed signal'}
                trailing={<EvidenceMeter strength={f.strength === 'Strong' ? 5 : f.strength === 'Moderate' ? 3 : 2} showLabel={false} width={48} />}
              />
            ))}
          </ListGroup>
        </Section>
      ) : null}

      <Section title={`What matters for ${name}`} caption="General evidence, not personal results">
        <ListGroup>
          {config.factors.map((f) => (
            <ListRow key={f.name} title={f.name} subtitle={f.note} trailing={<EvidenceMeter strength={f.strength} showLabel={false} width={48} />} />
          ))}
        </ListGroup>
      </Section>

      <Section title="Evidence-based habits">
        <Card padding={6}>
          {config.recommendations.map((r, i) => (
            <View key={r} style={{ flexDirection: 'row', gap: 12, padding: 14, borderTopWidth: i ? 0.5 : 0, borderTopColor: Palette.hairline }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: Palette.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Check size={14} color={Palette.accent} strokeWidth={2.6} />
              </View>
              <Txt variant="callout" style={{ flex: 1 }}>{r}</Txt>
            </View>
          ))}
        </Card>
      </Section>
    </Screen>
  );
}
