import { useState } from 'react';
import { useRouter } from 'expo-router';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

// Skin type options matching moodboard
const SKIN_TYPES = [
  { id: 'oily', name: 'Oily / Combination', description: 'Excess sebum in T-zone, prone to congestion.' },
  { id: 'dry', name: 'Dry & Dehydrated', description: 'Tightness, flaking, or lack of lipid moisture.' },
  { id: 'normal', name: 'Balanced / Normal', description: 'Stable hydration levels and minimal sensitivity.' },
];

// Sensitivity triggers
const SENSITIVITY_TRIGGERS = [
  { id: 'eczema', name: 'Eczema Prone', description: 'Triggers inflammation and barrier disruption.' },
  { id: 'rosacea', name: 'Rosacea / Redness', description: 'Active flushing from heat or actives.' },
  { id: 'acne', name: 'Acne Prone', description: 'Comedogenic ingredients cause breakouts.' },
];

// Default watchlist ingredients
const DEFAULT_WATCHLIST = [
  { id: '1', name: 'Octisalate' },
  { id: '2', name: 'Fragrance (Linalool)' },
  { id: '3', name: 'Alcohol Denat.' },
];

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selectedSkinType, setSelectedSkinType] = useState('dry');
  const [selectedTriggers, setSelectedTriggers] = useState<string[]>(['rosacea']);
  const [watchlist, setWatchlist] = useState(DEFAULT_WATCHLIST);

  const toggleTrigger = (id: string) => {
    setSelectedTriggers((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const removeFromWatchlist = (id: string) => {
    setWatchlist((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <View style={styles.screen}>
      {/* Header - matching moodboard */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnIcon}>‹</Text>
        </Pressable>
        <Text style={styles.pageTitle}>Skin Profile</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Primary Skin Type */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Primary Skin Type</Text>
          <View style={styles.cardList}>
            {SKIN_TYPES.map((type) => (
              <Pressable
                key={type.id}
                style={[
                  styles.selectionCard,
                  selectedSkinType === type.id && styles.selectionCardActive,
                ]}
                onPress={() => setSelectedSkinType(type.id)}
              >
                <View style={styles.cardInfo}>
                  <Text style={[
                    styles.cardTitle,
                    selectedSkinType === type.id && styles.cardTitleActive,
                  ]}>
                    {type.name}
                  </Text>
                  <Text style={[
                    styles.cardDescription,
                    selectedSkinType === type.id && styles.cardDescriptionActive,
                  ]}>
                    {type.description}
                  </Text>
                </View>
                {selectedSkinType === type.id && (
                  <View style={styles.toggleSwitch}>
                    <View style={styles.toggleKnob} />
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        </View>

        {/* Ingredient Watchlist - matching moodboard */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>Ingredient Watchlist</Text>
            <Text style={styles.sectionAction}>Edit</Text>
          </View>
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

        {/* Sensitivity Triggers */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Sensitivity Triggers</Text>
          <View style={styles.cardList}>
            {SENSITIVITY_TRIGGERS.map((trigger) => (
              <Pressable
                key={trigger.id}
                style={[
                  styles.selectionCard,
                  selectedTriggers.includes(trigger.id) && styles.selectionCardActive,
                ]}
                onPress={() => toggleTrigger(trigger.id)}
              >
                <View style={styles.cardInfo}>
                  <Text style={[
                    styles.cardTitle,
                    selectedTriggers.includes(trigger.id) && styles.cardTitleActive,
                  ]}>
                    {trigger.name}
                  </Text>
                  <Text style={[
                    styles.cardDescription,
                    selectedTriggers.includes(trigger.id) && styles.cardDescriptionActive,
                  ]}>
                    {trigger.description}
                  </Text>
                </View>
                {selectedTriggers.includes(trigger.id) && (
                  <View style={styles.toggleSwitch}>
                    <View style={styles.toggleKnob} />
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        </View>

        {/* Analysis Note - matching moodboard */}
        <View style={styles.analysisNote}>
          <Text style={styles.analysisNoteLabel}>Analysis Note</Text>
          <Text style={styles.analysisNoteText}>
            "Your profile is configured to prioritize barrier repair and moisture retention. Scanning will highlight drying alcohols and high-concentration fragrances."
          </Text>
        </View>
      </ScrollView>

      {/* Save Button - matching moodboard */}
      <View style={[styles.saveBar, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <Pressable style={styles.saveButton} onPress={() => router.back()}>
          <Text style={styles.saveButtonText}>Update Profile</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.bone,
  },
  header: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  backBtn: {
    width: scale(40),
    height: scale(40),
    borderRadius: scale(20),
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backBtnIcon: {
    fontSize: FontSizes.heading,
    color: Colors.ink,
    marginTop: -2,
  },
  pageTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.display,
    fontWeight: '500',
    color: Colors.ink,
  },
  container: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: verticalScale(120),
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: Spacing.md,
  },
  sectionLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontWeight: '600',
    color: Colors.inkSecondary,
    marginBottom: Spacing.md,
  },
  sectionAction: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: Colors.inkSecondary,
    textDecorationLine: 'underline',
    marginBottom: Spacing.md,
  },
  cardList: {
    gap: Spacing.sm,
  },
  selectionCard: {
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
    padding: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectionCardActive: {
    backgroundColor: Colors.ink,
    borderColor: Colors.ink,
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.title,
    fontWeight: '500',
    color: Colors.ink,
  },
  cardTitleActive: {
    color: Colors.bone,
  },
  cardDescription: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkSecondary,
    marginTop: 2,
  },
  cardDescriptionActive: {
    color: 'rgba(233, 230, 223, 0.6)',
  },
  toggleSwitch: {
    width: scale(36),
    height: scale(20),
    backgroundColor: '#fff',
    borderRadius: scale(10),
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: 2,
  },
  toggleKnob: {
    width: scale(16),
    height: scale(16),
    backgroundColor: Colors.ink,
    borderRadius: scale(8),
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
    borderColor: '#D28E8E',
    backgroundColor: 'rgba(210, 142, 142, 0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  alertTagText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: '#8E3A3A',
  },
  alertTagClose: {
    fontSize: FontSizes.sm,
    color: '#8E3A3A',
  },
  addTag: {
    paddingVertical: scale(8),
    paddingHorizontal: scale(16),
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderStyle: 'dashed',
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  addTagText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
  },
  analysisNote: {
    marginTop: Spacing.lg,
    padding: scale(20),
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  analysisNoteLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontWeight: '600',
    color: Colors.inkSecondary,
    marginBottom: Spacing.sm,
  },
  analysisNoteText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.subtitle,
    fontStyle: 'italic',
    color: Colors.inkTertiary,
    lineHeight: FontSizes.subtitle * 1.5,
  },
  saveBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: Spacing.lg,
    backgroundColor: Colors.bone,
  },
  saveButton: {
    backgroundColor: Colors.ink,
    paddingVertical: scale(16),
    borderRadius: Radius.pill,
    alignItems: 'center',
  },
  saveButtonText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: Colors.bone,
  },
});
