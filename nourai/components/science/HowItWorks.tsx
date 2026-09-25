import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Palette } from '@/constants/theme';
import { api, type IngredientMechanism, type MechanismAsset } from '@/services/api';
import { Card, Section, Txt } from '@/components/ui';
import { LadderBadge } from './LadderBadge';
import { EvidenceChain } from './EvidenceChain';
import { DoseBar } from './DoseBar';
import { ViewerPanel } from './ViewerPanel';

function asset(m: IngredientMechanism, kind: MechanismAsset['kind']) {
  return m.assets.find((a) => a.kind === kind);
}

/**
 * The "How it works" tab: how far our knowledge goes, the reviewed route when
 * there is one, then where it acts, how it binds and the bigger pathway.
 * Panels without data don't render.
 */
export function HowItWorks({ ingredientId, unreviewedSummary }: { ingredientId: string; unreviewedSummary?: string | null }) {
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
  const cell = asset(m, 'cell_locations');
  const structure = asset(m, 'structure');
  const pathway = asset(m, 'pathway_illustration');
  const diagram = asset(m, 'pathway_diagram');

  return (
    <View style={{ marginTop: 16 }}>
      <Card padding={18}>
        <LadderBadge level={m.level} />
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
        <Section title={route.title} caption={`Reviewed${route.reviewed_by ? ` by ${route.reviewed_by}` : ''} · version ${route.version}`}>
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

      {cell ? (
        <ViewerPanel
          title="Where it acts"
          caption={`The cell compartments where proteins in its pathway work${cell.payload.names?.length ? `: ${cell.payload.names.slice(0, 3).join(', ').toLowerCase()}` : ''}`}
          viewerPath={cell.viewer_path} fallbackUrl={cell.fallback_url} attribution={cell.attribution}
          height={250}
        />
      ) : null}

      {structure ? (
        <ViewerPanel
          title="See it bind"
          caption={structure.payload.title ? String(structure.payload.title) : 'A measured 3D structure of the molecule bound to a human protein'}
          viewerPath={structure.viewer_path} fallbackUrl={structure.fallback_url} attribution={structure.attribution}
          height={300} interactive
        >
          <Txt variant="caption" tone="tertiary">
            {structure.reviewed ? 'Chosen by a reviewer.' : 'Found automatically — may show a protein other than its main target.'} Drag to rotate.
          </Txt>
        </ViewerPanel>
      ) : null}

      {pathway ? (
        <ViewerPanel
          title="The bigger picture"
          caption={diagram?.payload.name ? `Where ${String(diagram.payload.name).toLowerCase()} sits among related pathways` : 'Where its pathway sits among related pathways'}
          viewerPath={pathway.viewer_path} fallbackUrl={pathway.fallback_url} attribution={pathway.attribution}
          height={260} interactive
        />
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
