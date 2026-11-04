import React, { useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { ExternalLink, Scale } from 'lucide-react-native';
import { Palette, Radius } from '@/constants/theme';
import type { ExpertView, PlaceRow, PlaceRule, RulesBlock } from '@/services/api';
import { Card, ListGroup, ListRow, Pill, Section, Sheet, Txt } from '@/components/ui';
import { toneColor } from '@/utils/grade';
import { effectiveText, formatDay, RULES_FOOTER, statusTone } from '@/utils/rules';

const SCOPE: Record<string, string> = {
  food_additive: 'Food additive', food: 'Food', supplement: 'Supplements', cosmetic: 'Cosmetics',
  medicine: 'Medicine', sport: 'Sport',
};
const SEVERITY = ['banned', 'not_authorised', 'prescription_only', 'warning_label', 'approval_required', 'listed', 'allowed_with_limits', 'allowed'];

const mostSevere = (rules: PlaceRule[]) =>
  [...rules].sort((a, b) => SEVERITY.indexOf(a.status) - SEVERITY.indexOf(b.status))[0];

function rowSubtitle(row: PlaceRow): string {
  if (row.checked_no_rule) return 'No specific rule';
  const parts = row.rules.map((r) => [r.status_label, r.applies_to ? SCOPE[r.applies_to] : null, effectiveText(r.effective_from, r.effective_until)]
    .filter(Boolean).join(' · '));
  return [...new Set(parts)].join('\n') + (row.via_place === 'EU' ? '\nEU rule' : '');
}

function Dot({ row }: { row: PlaceRow }) {
  const rule = mostSevere(row.rules);
  return <View style={[styles.dot, { backgroundColor: rule ? toneColor(statusTone(rule.status)) : Palette.ink4 }]} />;
}

/** Rules: what the law says about this ingredient, the person's own country first, expert views apart. */
export function RulesSection({ rules }: { rules?: RulesBlock | null }) {
  const sheet = useRef<BottomSheetModal>(null);
  const [selected, setSelected] = useState<PlaceRow | null>(null);
  const substances = (rules?.substances ?? []).filter((s) => s.places.length || s.expert_views.length);
  if (!rules || !substances.length) return null;

  const open = (row: PlaceRow) => {
    if (row.checked_no_rule) return;
    setSelected(row);
    sheet.current?.present();
  };

  return (
    <Section title="Rules" caption="What the law says, where">
      {substances.map((s) => {
        const yours = s.places.find((p) => p.is_yours);
        const others = s.places.filter((p) => !p.is_yours);
        return (
          <View key={s.substance_id} style={{ gap: 12, marginBottom: 20 }}>
            {substances.length > 1 && s.scope_label ? <Txt variant="overline" tone="secondary">{s.scope_label}</Txt> : null}
            {s.summary ? <Txt variant="body">{s.summary}</Txt> : null}
            {yours ? (
              <Card variant="flat" padding={16} style={styles.yours} onPress={yours.checked_no_rule ? undefined : () => open(yours)}
                accessibilityLabel={`Where you live: ${yours.place_name}`}>
                <Txt variant="overline" tone="accent">Where you live</Txt>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 }}>
                  <Dot row={yours} />
                  <Txt variant="headline" style={{ flex: 1 }}>{yours.place_name}</Txt>
                </View>
                <Txt variant="footnote" tone="secondary" style={{ marginTop: 4 }}>{rowSubtitle(yours)}</Txt>
              </Card>
            ) : null}
            {others.length ? (
              <ListGroup>
                {others.map((row) => (
                  <ListRow key={row.place} leading={<Dot row={row} />} title={row.place_name} subtitle={rowSubtitle(row)}
                    onPress={row.checked_no_rule ? undefined : () => open(row)} />
                ))}
              </ListGroup>
            ) : null}
            {s.expert_views.length ? <ExpertViews views={s.expert_views} /> : null}
          </View>
        );
      })}
      {rules.last_checked_at ? <Txt variant="footnote" tone="tertiary">{RULES_FOOTER(formatDay(rules.last_checked_at))}</Txt> : null}
      <Sheet ref={sheet} onDismiss={() => setSelected(null)}>
        {selected ? <RuleDetail row={selected} /> : null}
      </Sheet>
    </Section>
  );
}

function ExpertViews({ views }: { views: ExpertView[] }) {
  return (
    <Card variant="sunken" padding={16} radius={Radius.lg}>
      <Txt variant="overline" tone="secondary">Expert views</Txt>
      {views.map((v) => (
        <Pressable key={v.id} onPress={() => Linking.openURL(v.source.url)} accessibilityRole="link" style={{ marginTop: 10 }}>
          <Txt variant="callout">{v.body_name}{v.classification ? `: ${v.classification}` : ''}</Txt>
          {v.explainer ? <Txt variant="footnote" tone="secondary" style={{ marginTop: 2 }}>{v.explainer}</Txt> : null}
        </Pressable>
      ))}
    </Card>
  );
}

function RuleDetail({ row }: { row: PlaceRow }) {
  return (
    <View style={{ gap: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Scale size={18} color={Palette.ink2} strokeWidth={2} />
        <Txt variant="title2">{row.place_name}</Txt>
      </View>
      {row.via_place === 'EU' ? <Txt variant="footnote" tone="secondary">No national rule: the European Union's rule applies.</Txt> : null}
      {row.rules.map((r) => (
        <View key={r.id} style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <Pill label={r.status_label} tone={statusTone(r.status)} />
            {r.applies_to ? <Txt variant="footnote" tone="secondary">{SCOPE[r.applies_to]}{r.sub_scope ? ` · ${r.sub_scope}` : ''}</Txt> : null}
          </View>
          {effectiveText(r.effective_from, r.effective_until) ? <Txt variant="footnote">{effectiveText(r.effective_from, r.effective_until)}</Txt> : null}
          {r.condition ? <Txt variant="body" tone="secondary">{r.condition}</Txt> : null}
          {r.why ? <Txt variant="footnote" tone="secondary">{r.why}</Txt> : null}
          <Txt variant="caption" tone="tertiary">
            {[r.source.authority, r.source.legal_reference, `Last checked ${formatDay(r.source.last_checked_at)}`].filter(Boolean).join(' · ')}
          </Txt>
          <Pressable onPress={() => Linking.openURL(r.source.url)} accessibilityRole="link" style={styles.link}>
            <ExternalLink size={14} color={Palette.accent} strokeWidth={2} />
            <Txt variant="footnote" tone="accent">Official source</Txt>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { width: 10, height: 10, borderRadius: 5 },
  yours: { borderColor: Palette.accent, borderWidth: 1.5 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 },
});
