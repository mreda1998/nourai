import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Palette } from '@/constants/theme';
import { api, type IngredientMechanism } from '@/services/api';
import { Card, Section, Txt } from '@/components/ui';
import { LadderBadge } from './LadderBadge';
import { EvidenceChain } from './EvidenceChain';
import { DoseBar } from './DoseBar';
import { MoleculeCard, type Molecule } from './MoleculeCard';
import { isPendingReview } from './labels';

/**
 * The "How it works" tab: how far our knowledge goes, the reviewed route when
 * there is one, the dose studied, and the molecule itself.
 * Panels without data don't render.
 */
export function HowItWorks({ ingredientId, unreviewedSummary, molecule, classLabel }: {
  ingredientId: string;
  unreviewedSummary?: string | null;
  molecule?: Molecule | null;
  classLabel?: string | null;
}) {
  const [m, setM] = useState<IngredientMechanism | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.getIngredientMechanism(ingredientId)
      .then((r) => alive && setM(r))
      .catch(() => alive && setM(null))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [ingredientId]);

  if (loading) return <View style={{ paddingVertical: 32 }}><ActivityIndicator color={Palette.accent} /></View>;
  if (!m) return null;

  const route = m.route;
  const doseClaim = route?.links.flatMap((l) => l.claims).find((c) => c.dose_low != null && c.dose_unit);

  return (
    <View style={{ marginTop: 16 }}>
      <Card padding={18}>
        <LadderBadge level={m.level} pending={!!route && isPendingReview(route)} />
        {m.via_moiety ? (
          <Txt variant="footnote" tone="secondary" style={{ marginTop: 10 }}>
            Shown for {m.via_moiety}, the active compound in this form.{m.form_note ? ` ${m.form_note}` : ''}
          </Txt>
        ) : null}
        {m.function_summary && m.level === 'function' ? (
          <Txt variant="callout" style={{ marginTop: 10 }}>{m.function_summary}</Txt>
        ) : null}
      </Card>

      {route ? (
        <Section
          title={route.title}
          caption={isPendingReview(route) ? `Draft — awaiting expert review · version ${route.version}` : `Reviewed by ${route.reviewed_by} · version ${route.version}`}
        >
          <Txt variant="callout" tone="secondary" style={{ marginBottom: 18 }}>{route.takeaway}</Txt>
          <EvidenceChain route={route} />
        </Section>
      ) : null}

      {doseClaim ? (
        <Section title="The dose studied" caption="Being in this range means the amount studied — not that it will work for you">
          <Card padding={16}>
            <DoseBar bar={{
              compound: m.name, route_slug: route!.slug,
              studied_low: doseClaim.dose_low!, studied_high: doseClaim.dose_high ?? doseClaim.dose_low!,
              unit_label: doseClaim.dose_unit!,
            }} />
          </Card>
        </Section>
      ) : null}

      {molecule ? (
        <Section title="The molecule">
          <MoleculeCard molecule={molecule} name={m.via_moiety ?? m.name} classLabel={classLabel} />
        </Section>
      ) : null}

      {!route && unreviewedSummary ? (
        <Section title="Summary" caption="Written with AI from research abstracts · not yet reviewed">
          <Card variant="sunken" padding={16}>
            <Txt variant="callout" tone="secondary">{unreviewedSummary}</Txt>
          </Card>
        </Section>
      ) : null}

      {m.level !== 'reviewed' ? (
        <Txt variant="caption" tone="tertiary" style={{ marginTop: 20 }}>
          Mechanisms explain how an effect could happen. Only a reviewed route says whether it was measured in people.
        </Txt>
      ) : null}
    </View>
  );
}
