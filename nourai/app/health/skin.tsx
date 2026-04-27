import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  Colors,
  Fonts,
  Spacing,
  Radius,
  FontSizes,
  Layout,
  scale,
  verticalScale,
} from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { api } from '@/services/api';

const SKIN_TYPES = [
  { id: 'oily',   name: 'Oily / Combination', description: 'Excess sebum in T-zone, prone to congestion.' },
  { id: 'dry',    name: 'Dry & Dehydrated',   description: 'Tightness, flaking, or lack of lipid moisture.' },
  { id: 'normal', name: 'Balanced / Normal',  description: 'Stable hydration levels and minimal sensitivity.' },
];

const SENSITIVITY_TRIGGERS = [
  { id: 'eczema',  name: 'Eczema Prone',       description: 'Triggers inflammation and barrier disruption.' },
  { id: 'rosacea', name: 'Rosacea / Redness',  description: 'Active flushing from heat or actives.' },
  { id: 'acne',    name: 'Acne Prone',         description: 'Comedogenic ingredients cause breakouts.' },
];

const DEFAULT_WATCHLIST = [
  { id: '1', name: 'Octisalate' },
  { id: '2', name: 'Fragrance (Linalool)' },
  { id: '3', name: 'Alcohol Denat.' },
];

const SKIN_PROFILE_KEY = '@elory_skin_profile';

function InsightCard({ title, fact }: { title: string; fact: string }) {
  return (
    <View style={insightStyles.card}>
      <Text style={insightStyles.label}>◆ HIDDEN INSIGHT</Text>
      <Text style={insightStyles.title}>{title}</Text>
      <Text style={insightStyles.fact}>{fact}</Text>
    </View>
  );
}

const insightStyles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(241,237,228,0.06)',
    borderLeftWidth: 2,
    borderLeftColor: Colors.sand,
    borderRadius: Radius.md,
    padding: scale(16),
    marginBottom: Spacing.xl,
  },
  label: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.8,
    color: Colors.sand,
    marginBottom: scale(8),
  },
  title: {
    fontFamily: Fonts.serifItalic,
    fontSize: 16,
    color: Colors.darkInk,
    marginBottom: scale(6),
  },
  fact: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: 'rgba(241,237,228,0.55)',
    lineHeight: FontSizes.caption * 1.6,
  },
});

export default function SkinHealthScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selectedSkinType, setSelectedSkinType] = useState('dry');
  const [selectedTriggers, setSelectedTriggers] = useState<string[]>(['rosacea']);
  const [watchlist, setWatchlist] = useState(DEFAULT_WATCHLIST);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(SKIN_PROFILE_KEY).then((raw) => {
      if (!raw) return;
      try {
        const saved = JSON.parse(raw);
        if (saved.skinType)  setSelectedSkinType(saved.skinType);
        if (saved.triggers)  setSelectedTriggers(saved.triggers);
        if (saved.watchlist) setWatchlist(saved.watchlist);
      } catch {
        // corrupt data — keep defaults
      }
    });
  }, []);

  const toggleTrigger = (id: string) => {
    setSelectedTriggers((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const removeFromWatchlist = (id: string) => {
    setWatchlist((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const localData = { skinType: selectedSkinType, triggers: selectedTriggers, watchlist };
      await AsyncStorage.setItem(SKIN_PROFILE_KEY, JSON.stringify(localData));

      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await api.updateHealthProfile(session.access_token, {
          conditions: [
            `skin:${selectedSkinType}`,
            ...selectedTriggers.map((t) => `trigger:${t}`),
          ],
          medications: watchlist.map((w) => w.name),
        });
      }

      router.back();
    } catch {
      router.back();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.eyebrow}>◆ HEALTH PROFILE</Text>
        <Text style={styles.pageTitle}>Skin Health</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <InsightCard
          title="The truth about your skin barrier."
          fact="Most sensitivity reactions are not allergies — they're barrier dysfunction. The epidermis loses ceramides with age and detergent exposure; restoration outperforms avoidance in long-term outcomes."
        />

        {/* Primary Skin Type */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Primary Skin Type</Text>
          <View style={styles.cardList}>
            {SKIN_TYPES.map((type) => {
              const active = selectedSkinType === type.id;
              return (
                <Pressable
                  key={type.id}
                  style={[styles.selectionCard, active && styles.selectionCardActive]}
                  onPress={() => setSelectedSkinType(type.id)}
                >
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardTitle}>{type.name}</Text>
                    <Text style={styles.cardDescription}>{type.description}</Text>
                  </View>
                  <View style={[styles.toggleTrack, active && styles.toggleTrackActive]}>
                    <View style={[styles.toggleThumb, active && styles.toggleThumbActive]} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Sensitivity Triggers */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Sensitivity Triggers</Text>
          <View style={styles.cardList}>
            {SENSITIVITY_TRIGGERS.map((trigger) => {
              const active = selectedTriggers.includes(trigger.id);
              return (
                <Pressable
                  key={trigger.id}
                  style={[styles.selectionCard, active && styles.selectionCardActive]}
                  onPress={() => toggleTrigger(trigger.id)}
                >
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardTitle}>{trigger.name}</Text>
                    <Text style={styles.cardDescription}>{trigger.description}</Text>
                  </View>
                  <View style={[styles.toggleTrack, active && styles.toggleTrackActive]}>
                    <View style={[styles.toggleThumb, active && styles.toggleThumbActive]} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Ingredient Watchlist */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Ingredient Watchlist</Text>
          <View style={styles.tagCloud}>
            {watchlist.map((item) => (
              <Pressable
                key={item.id}
                style={styles.alertTag}
                onPress={() => removeFromWatchlist(item.id)}
              >
                <Text style={styles.alertTagText}>{item.name}</Text>
                <Text style={styles.alertTagClose}>✕</Text>
              </Pressable>
            ))}
            <Pressable style={styles.addTag}>
              <Text style={styles.addTagText}>+ Add Ingredient</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.saveBar, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <Pressable
          style={[styles.saveButton, isSaving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={isSaving}
        >
          {isSaving
            ? <ActivityIndicator color={Colors.darkSurface} />
            : <Text style={styles.saveButtonText}>Save Profile</Text>
          }
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.darkSurface,
  },
  header: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: Spacing.lg,
  },
  backText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: 'rgba(241,237,228,0.55)',
    alignSelf: 'flex-start',
    marginBottom: scale(12),
  },
  eyebrow: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.8,
    color: Colors.sand,
    marginBottom: scale(6),
  },
  pageTitle: {
    fontFamily: Fonts.serifItalic,
    fontSize: scale(32),
    color: Colors.darkInk,
  },
  container: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: Spacing.lg,
    paddingBottom: verticalScale(120),
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.8,
    color: 'rgba(241,237,228,0.45)',
    marginBottom: scale(12),
  },
  cardList: {
    gap: Spacing.sm,
  },
  selectionCard: {
    backgroundColor: 'rgba(241,237,228,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(241,237,228,0.1)',
    borderRadius: Radius.md,
    padding: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectionCardActive: {
    backgroundColor: 'rgba(241,237,228,0.14)',
    borderColor: Colors.sand,
  },
  cardInfo: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  cardTitle: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.subtitle,
    color: Colors.darkInk,
    marginBottom: 3,
  },
  cardDescription: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: 'rgba(241,237,228,0.55)',
  },
  toggleTrack: {
    width: scale(36),
    height: scale(20),
    backgroundColor: 'rgba(241,237,228,0.15)',
    borderRadius: scale(10),
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleTrackActive: {
    backgroundColor: Colors.sand,
  },
  toggleThumb: {
    width: scale(16),
    height: scale(16),
    backgroundColor: Colors.darkSurface,
    borderRadius: scale(8),
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  tagCloud: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  alertTag: {
    paddingVertical: scale(8),
    paddingHorizontal: scale(16),
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(232,213,176,0.3)',
    backgroundColor: 'rgba(232,213,176,0.15)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  alertTagText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.sand,
  },
  alertTagClose: {
    fontSize: FontSizes.xs,
    color: 'rgba(241,237,228,0.4)',
  },
  addTag: {
    paddingVertical: scale(8),
    paddingHorizontal: scale(16),
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(241,237,228,0.25)',
  },
  addTagText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: 'rgba(241,237,228,0.4)',
  },
  saveBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: Spacing.lg,
    backgroundColor: Colors.darkSurface,
  },
  saveButton: {
    backgroundColor: Colors.darkInk,
    borderRadius: Radius.pill,
    paddingVertical: verticalScale(16),
    alignItems: 'center',
  },
  saveButtonText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.body,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: Colors.darkSurface,
  },
});
