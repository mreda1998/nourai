import React, { useState } from 'react';
import { ActionSheetIOS, Alert, Platform, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { AlertCircle, Camera, CheckCircle2, X } from 'lucide-react-native';
import { api, type SubmissionCategory, type SubmissionPhoto } from '@/services/api';
import { Palette, Radius } from '@/constants/theme';
import { Button, ChipRow, IconButton, PressableScale, Screen, Section, TextField, Txt } from '@/components/ui';

type Slot = 'front' | 'ingredients' | 'other';

const SLOTS: { key: Slot; label: string; hint: string }[] = [
  { key: 'front', label: 'Front', hint: 'Name and brand' },
  { key: 'ingredients', label: 'Ingredients', hint: 'The full list' },
  { key: 'other', label: 'Other', hint: 'Optional' },
];

const CATEGORIES: { key: SubmissionCategory; label: string }[] = [
  { key: 'supplement', label: 'Supplement' },
  { key: 'cosmetic', label: 'Skincare' },
  { key: 'food', label: 'Food' },
  { key: 'otc', label: 'Medicine' },
  { key: 'other', label: 'Other' },
];

/**
 * "Help add it": a tester sends a product we couldn't find — label photos plus
 * whatever they know. Reached from a missed scan or an empty search.
 */
export default function SubmitProductScreen() {
  const params = useLocalSearchParams<{ barcode?: string; name?: string }>();
  const [photos, setPhotos] = useState<Partial<Record<Slot, SubmissionPhoto>>>({});
  const [name, setName] = useState(params.name ?? '');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState<SubmissionCategory | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const hasPhotos = Object.values(photos).some(Boolean);
  const canSend = hasPhotos || name.trim().length > 1 || !!params.barcode;

  const capture = async (slot: Slot, source: 'camera' | 'library') => {
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6 };
    let result: ImagePicker.ImagePickerResult;
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera access needed', 'You can still choose a photo from your library.');
        return;
      }
      result = await ImagePicker.launchCameraAsync(options);
    } else {
      result = await ImagePicker.launchImageLibraryAsync(options);
    }
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    Haptics.selectionAsync();
    setPhotos((prev) => ({
      ...prev,
      [slot]: { uri: asset.uri, name: `${slot}.jpg`, type: asset.mimeType ?? 'image/jpeg' },
    }));
  };

  const choose = (slot: Slot) => {
    const options = ['Take photo', 'Choose from library', 'Cancel'];
    const pick = (index: number) => {
      if (index === 0) capture(slot, 'camera');
      if (index === 1) capture(slot, 'library');
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: 2 }, pick);
    } else {
      Alert.alert('Add a photo', undefined, [
        { text: options[0], onPress: () => pick(0) },
        { text: options[1], onPress: () => pick(1) },
        { text: options[2], style: 'cancel' },
      ]);
    }
  };

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      await api.submitProduct({
        barcode: params.barcode,
        name,
        brand,
        category: category ?? undefined,
        note,
        photos: SLOTS.map((s) => photos[s.key]).filter((p): p is SubmissionPhoto => !!p),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSent(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Something went wrong. Please try again.');
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <Screen back>
        <Animated.View entering={FadeIn.duration(400)} style={styles.done}>
          <View style={styles.doneIcon}><CheckCircle2 size={34} color={Palette.strong} strokeWidth={1.6} /></View>
          <Txt variant="title1" align="center" style={{ marginTop: 18 }}>Thank you</Txt>
          <Txt variant="subhead" tone="secondary" align="center" style={{ marginTop: 8, maxWidth: 300 }}>
            We’ll research it and add it to Elory. The products you send shape what we analyse next.
          </Txt>
          <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 28 }}>
            <Button label="Scan another product" onPress={() => router.replace('/(tabs)/scan' as never)} />
            <Button label="Done" variant="secondary" onPress={() => router.back()} />
          </View>
        </Animated.View>
      </Screen>
    );
  }

  return (
    <Screen
      back
      title="Add a product"
      subtitle="Help us cover what you actually use."
      footer={<Button label="Send to Elory" loading={sending} disabled={!canSend || sending} onPress={send} />}
    >
      {params.barcode ? (
        <Txt variant="footnote" tone="secondary">Barcode {params.barcode}</Txt>
      ) : null}

      <Section title="Photos" caption="Clear, well-lit shots of the label work best.">
        <View style={styles.slots}>
          {SLOTS.map((slot, i) => {
            const photo = photos[slot.key];
            return (
              <Animated.View key={slot.key} entering={FadeInDown.duration(350).delay(i * 60)} style={{ flex: 1 }}>
                <PressableScale onPress={() => choose(slot.key)} style={styles.slot} accessibilityLabel={`${slot.label} photo`}>
                  {photo ? (
                    <>
                      <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                      <View style={styles.remove}>
                        <IconButton icon={X} label={`Remove ${slot.label} photo`} size={28} iconSize={14} onPress={() => setPhotos((p) => ({ ...p, [slot.key]: undefined }))} />
                      </View>
                    </>
                  ) : (
                    <>
                      <Camera size={24} color={Palette.accent} strokeWidth={1.6} />
                      <Txt variant="subheadStrong" style={{ marginTop: 10 }}>{slot.label}</Txt>
                      <Txt variant="caption" tone="secondary" style={{ marginTop: 2 }}>{slot.hint}</Txt>
                    </>
                  )}
                </PressableScale>
              </Animated.View>
            );
          })}
        </View>
      </Section>

      <Section title="What is it?">
        <View style={{ gap: 10 }}>
          <TextField label="Product name" value={name} onChangeText={setName} placeholder="e.g. Hydrating Cleanser" autoCapitalize="words" returnKeyType="next" />
          <TextField label="Brand" value={brand} onChangeText={setBrand} placeholder="e.g. CeraVe" autoCapitalize="words" returnKeyType="next" />
        </View>
        <ChipRow
          style={{ marginTop: 14 }}
          options={CATEGORIES}
          value={category ?? ('' as SubmissionCategory)}
          onChange={(key) => setCategory((current) => (current === key ? null : key))}
        />
      </Section>

      <Section title="Anything else?">
        <TextField label="Note (optional)" value={note} onChangeText={setNote} placeholder="Where you bought it, why you use it…" multiline style={{ minHeight: 64 }} />
      </Section>

      {error ? (
        <View style={styles.error}>
          <AlertCircle size={18} color={Palette.weak} />
          <Txt variant="footnote" tone="weak" style={{ flex: 1 }}>{error}</Txt>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  slots: { flexDirection: 'row', gap: 10 },
  slot: {
    aspectRatio: 0.78, borderRadius: Radius.lg, borderCurve: 'continuous', overflow: 'hidden',
    backgroundColor: Palette.surface, alignItems: 'center', justifyContent: 'center', padding: 8,
    borderWidth: 1.5, borderColor: Palette.hairline, borderStyle: 'dashed',
  },
  remove: { position: 'absolute', top: 6, right: 6 },
  error: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20, padding: 14, borderRadius: Radius.md, backgroundColor: Palette.weakSoft },
  done: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 8 },
  doneIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: Palette.accentSoft, alignItems: 'center', justifyContent: 'center' },
});
