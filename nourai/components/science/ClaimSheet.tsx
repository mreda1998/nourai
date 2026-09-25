import React, { forwardRef } from 'react';
import { Linking, View } from 'react-native';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { ExternalLink } from 'lucide-react-native';
import { Palette } from '@/constants/theme';
import type { EvidenceRoute, RouteLink } from '@/services/api';
import { PressableScale, Sheet, Txt } from '@/components/ui';
import { CERTAINTY_LABEL, EVIDENCE_LABEL, citationLabel, citationUrl, doseText } from './labels';
import { EffectFigure } from './EffectFigure';

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={{ flexDirection: 'row', gap: 12, paddingVertical: 7, borderTopWidth: 0.5, borderTopColor: Palette.hairline }}>
      <Txt variant="footnote" tone="tertiary" style={{ width: 96 }}>{label}</Txt>
      <Txt variant="footnote" style={{ flex: 1 }}>{value}</Txt>
    </View>
  );
}

/** Everything behind one arrow: who was studied, against what, the result and its limits. */
export const ClaimSheet = forwardRef<BottomSheetModal, { route: EvidenceRoute; link: RouteLink | null }>(
  function ClaimSheet({ route, link }, ref) {
    return (
      <Sheet ref={ref}>
        {link ? (
          <View>
            <Txt variant="overline" tone="secondary">
              {link.evidence_type ? EVIDENCE_LABEL[link.evidence_type] : 'Evidence'}{link.strength ? ` · ${link.strength}` : ''}
            </Txt>
            {link.relation_text ? <Txt variant="title2" style={{ marginTop: 6 }}>{link.relation_text}</Txt> : null}
            {link.claims.map((c, i) => (
              <View key={i} style={{ marginTop: 18 }}>
                <Txt variant="callout">{c.claim_text}</Txt>
                <EffectFigure claim={c} tone={route.direction} />
                <View style={{ marginTop: 12 }}>
                  <Row label="Who" value={c.population} />
                  <Row label="Compared with" value={c.comparator} />
                  <Row label="How long" value={c.duration} />
                  <Row label="Dose studied" value={doseText(c.dose_low, c.dose_high, c.dose_unit)} />
                  <Row label="Measured" value={c.outcome_measure} />
                  <Row label="Certainty" value={c.certainty ? CERTAINTY_LABEL[c.certainty] : null} />
                  <Row label="Limits" value={c.limitations} />
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  {c.citations.map((cit, j) => {
                    const url = citationUrl(cit);
                    return url ? (
                      <PressableScale key={j} onPress={() => Linking.openURL(url)} accessibilityRole="link"
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 30, borderRadius: 15, backgroundColor: Palette.accentSoft }}>
                        <ExternalLink size={13} color={Palette.accent} />
                        <Txt variant="caption" tone="accent">{citationLabel(cit)}</Txt>
                      </PressableScale>
                    ) : null;
                  })}
                </View>
                {c.drafted_by === 'ai' ? (
                  <Txt variant="caption" tone="tertiary" style={{ marginTop: 8 }}>
                    Drafted with AI from the cited abstract; checked by {route.reviewed_by ?? 'a reviewer'}.
                  </Txt>
                ) : null}
              </View>
            ))}
            <Txt variant="caption" tone="tertiary" style={{ marginTop: 16 }}>
              Group results from studies — not a prediction for you.
            </Txt>
          </View>
        ) : null}
      </Sheet>
    );
  },
);
