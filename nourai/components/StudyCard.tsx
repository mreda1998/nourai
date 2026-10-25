import React from 'react';
import { Linking, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ExternalLink } from 'lucide-react-native';
import type { IngredientEvidenceRecord } from '@/services/api';
import { Palette } from '@/constants/theme';
import { studyMeta, studyStrength } from '@/utils/evidence';
import { Card, Pill, Txt } from '@/components/ui';

const STANCE: Record<string, string> = {
  supports: 'Supports the claim',
  refutes: 'Goes against the claim',
  inconclusive: 'Inconclusive',
};

/** One study: how it was done, what it found, and the caveats that limit how much it counts. */
export function StudyCard({ study, index = 0, stance }: {
  study: IngredientEvidenceRecord;
  index?: number;
  /** Set when shown under a claim. */
  stance?: string;
}) {
  const strength = studyStrength(study);
  const flags = study.quality_flags ?? [];
  const pubmed = study.pmid ? () => Linking.openURL(`https://pubmed.ncbi.nlm.nih.gov/${study.pmid}/`) : undefined;
  return (
    <Animated.View entering={FadeInDown.duration(350).delay(Math.min(index, 8) * 50)}>
      <Card padding={18} onPress={pubmed} accessibilityLabel={study.method_summary || study.finding}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <Txt variant="caption" tone="secondary" style={{ flex: 1, marginTop: 4 }}>{studyMeta(study)}</Txt>
          <Pill label={strength.label} tone={strength.tone} />
        </View>

        {study.method_summary ? (
          <>
            <Txt variant="overline" tone="tertiary" style={{ marginTop: 14 }}>What they did</Txt>
            <Txt variant="subhead" tone="secondary" style={{ marginTop: 4 }}>{study.method_summary}</Txt>
            <Txt variant="overline" tone="tertiary" style={{ marginTop: 12 }}>What they found</Txt>
            <Txt variant="callout" style={{ marginTop: 4 }}>{study.finding}</Txt>
          </>
        ) : (
          <Txt variant="callout" style={{ marginTop: 12 }}>{study.finding}</Txt>
        )}

        {flags.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
            {flags.slice(0, 4).map((flag) => <Pill key={flag.code} label={flag.label} tone="neutral" />)}
          </View>
        ) : null}
        {study.caveat ? <Txt variant="footnote" tone="secondary" style={{ marginTop: 10 }}>{study.caveat}</Txt> : null}

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <Txt variant="caption" tone="tertiary" numberOfLines={1} style={{ flex: 1 }}>
            {stance ? STANCE[stance] ?? stance : study.journal || ''}
          </Txt>
          {study.pmid ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Txt variant="caption" tone="accent">PubMed</Txt>
              <ExternalLink size={12} color={Palette.accent} />
            </View>
          ) : null}
        </View>
      </Card>
    </Animated.View>
  );
}
