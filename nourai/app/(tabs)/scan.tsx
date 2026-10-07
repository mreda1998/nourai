import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing, FadeIn, FadeInDown, FadeOutDown, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { Camera, PackagePlus, Search, X, Zap, ZapOff } from 'lucide-react-native';
import { api, isBarcodeIngestionResponse, Product } from '@/services/api';
import { Palette, Radius } from '@/constants/theme';
import { categoryLabel, gradeToScore, scoreQualifier } from '@/utils/grade';
import { Button, IconButton, ProductImage, ScoreBadge, Txt } from '@/components/ui';

const RETICLE_W = 272;
const RETICLE_H = 176;

type Phase = 'ready' | 'looking' | 'found' | 'missing' | 'error';

export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [phase, setPhase] = useState<Phase>('ready');
  const [message, setMessage] = useState('Point at a barcode');
  const [product, setProduct] = useState<Product | null>(null);
  const [missingCode, setMissingCode] = useState<string | null>(null);
  const lastCode = useRef<string | null>(null);
  const cancelled = useRef(false);

  const reset = useCallback(() => {
    setProduct(null);
    setMissingCode(null);
    setPhase('ready');
    setMessage('Point at a barcode');
    lastCode.current = null;
  }, []);

  useFocusEffect(useCallback(() => {
    cancelled.current = false;
    return () => { cancelled.current = true; setTorch(false); };
  }, []));

  const close = () => {
    reset();
    router.navigate('/(tabs)' as never);
  };

  const onScan = async ({ data }: { data: string }) => {
    if (phase === 'looking' || phase === 'found' || phase === 'missing' || lastCode.current === data) return;
    lastCode.current = data;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPhase('looking');
    setMessage('Looking this up…');
    try {
      const initial = await api.getProductByBarcode(data);
      let value: Product | null = null;
      if (isBarcodeIngestionResponse(initial)) {
        // New product: the backend researches it. Poll with its guidance.
        let job = initial;
        const preview = initial.preview;
        const loadingLabel = preview ? `${preview.name}${preview.brand ? ` · ${preview.brand}` : ''} — loading details…` : null;
        for (let attempt = 0; attempt < 45 && !cancelled.current; attempt += 1) {
          setMessage(loadingLabel ?? job.message);
          if (job.status === 'complete' && job.product_id) { value = await api.getProduct(job.product_id); break; }
          if (job.status === 'needs_review' || job.status === 'dead') throw new NotInCatalogue();
          await new Promise((r) => setTimeout(r, job.poll_after_ms));
          job = await api.getIngestionStatus(job.job_id);
        }
      } else value = initial;
      if (cancelled.current) return;
      if (!value) throw new Error('This is taking longer than usual. Try again in a moment.');
      setProduct(value);
      setPhase('found');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (reason) {
      if (cancelled.current) return;
      if (reason instanceof NotInCatalogue || (reason as { status?: number }).status === 404) {
        // Nobody has this product yet — ask the tester to help add it.
        setMissingCode(data);
        setPhase('missing');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }
      setPhase('error');
      setMessage(reason instanceof Error ? reason.message : 'We couldn’t identify this product.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setTimeout(() => { lastCode.current = null; }, 2000);
    }
  };

  const cameraAvailable = Constants.isDevice && permission?.granted;

  return (
    <View style={styles.root}>
      {cameraAvailable && focused ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          onBarcodeScanned={phase === 'found' || phase === 'missing' ? undefined : onScan}
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] }}
        />
      ) : null}

      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Scrim />
      </View>

      {/* Top bar */}
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <IconButton icon={X} label="Close scanner" variant="night" onPress={close} />
        <Txt variant="headline" tone="inverse">Scan</Txt>
        {cameraAvailable ? (
          <IconButton icon={torch ? Zap : ZapOff} label={torch ? 'Turn off flashlight' : 'Turn on flashlight'} variant="night" onPress={() => setTorch((t) => !t)} />
        ) : <View style={{ width: 40 }} />}
      </View>

      {/* Reticle + guidance */}
      <View style={styles.center} pointerEvents="none">
        {cameraAvailable ? <Reticle active={phase === 'looking'} found={phase === 'found'} /> : null}
      </View>

      {!cameraAvailable ? (
        <View style={styles.permission}>
          <View style={styles.permIcon}><Camera size={30} color={Palette.nightInk} strokeWidth={1.5} /></View>
          <Txt variant="title1" tone="inverse" align="center">{Constants.isDevice ? 'Scan with your camera' : 'Camera unavailable'}</Txt>
          <Txt variant="subhead" tone="inverse2" align="center" style={{ marginTop: 8, maxWidth: 290 }}>
            {Constants.isDevice
              ? 'Elory only reads the barcode. Scans help us decide which products to add next.'
              : 'The simulator has no camera. Search for a product instead.'}
          </Txt>
          <View style={{ gap: 10, marginTop: 24, alignSelf: 'stretch' }}>
            {Constants.isDevice ? <Button label="Allow camera access" variant="night" onPress={requestPermission} /> : null}
            <Button label="Search by name" variant="inverse" icon={<Search size={18} color={Palette.nightInk} />} onPress={() => router.navigate('/(tabs)/explore' as never)} />
          </View>
        </View>
      ) : null}

      {/* Bottom: status or result */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
        {phase === 'found' && product ? (
          <ResultCard product={product} onAgain={reset} />
        ) : phase === 'missing' && missingCode ? (
          <MissCard barcode={missingCode} onAgain={reset} />
        ) : cameraAvailable ? (
          <Animated.View entering={FadeIn} style={{ alignItems: 'center', gap: 16 }}>
            <View style={styles.status}>
              {phase === 'looking' ? <ActivityIndicator size="small" color={Palette.nightInk} /> : <View style={[styles.dot, { backgroundColor: phase === 'error' ? '#E3A07F' : Palette.nightInk }]} />}
              <Txt variant="subheadStrong" tone="inverse" numberOfLines={2} style={{ flexShrink: 1 }}>{message}</Txt>
            </View>
            <Button label="Search by name instead" variant="inverse" size="md" fullWidth={false} icon={<Search size={17} color={Palette.nightInk} />} onPress={() => router.navigate('/(tabs)/explore' as never)} />
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

function Scrim() {
  // Dim everything except the reticle window.
  const { width, height } = { width: '100%', height: '100%' } as const;
  return (
    <View style={{ width, height, backgroundColor: 'transparent' }}>
      <View style={{ flex: 1, backgroundColor: 'rgba(5,14,13,0.55)' }} />
      <View style={{ height: RETICLE_H, flexDirection: 'row' }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(5,14,13,0.55)' }} />
        <View style={{ width: RETICLE_W }} />
        <View style={{ flex: 1, backgroundColor: 'rgba(5,14,13,0.55)' }} />
      </View>
      <View style={{ flex: 1, backgroundColor: 'rgba(5,14,13,0.55)' }} />
    </View>
  );
}

function Reticle({ active, found }: { active: boolean; found: boolean }) {
  const line = useSharedValue(0);
  const pulse = useSharedValue(1);
  useEffect(() => {
    line.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, []);
  useEffect(() => {
    pulse.value = found ? withSequence(withTiming(1.06, { duration: 140 }), withTiming(1, { duration: 220 })) : 1;
  }, [found]);
  const lineStyle = useAnimatedStyle(() => ({ transform: [{ translateY: line.value * (RETICLE_H - 24) }], opacity: active ? 1 : 0.55 }));
  const boxStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const color = found ? '#8FD3B5' : '#FFFFFF';
  const c = { position: 'absolute' as const, width: 34, height: 34, borderColor: color };
  return (
    <Animated.View style={[{ width: RETICLE_W, height: RETICLE_H }, boxStyle]}>
      <View style={[c, { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 18 }]} />
      <View style={[c, { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 18 }]} />
      <View style={[c, { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 18 }]} />
      <View style={[c, { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 18 }]} />
      {!found ? <Animated.View style={[{ position: 'absolute', left: 18, right: 18, top: 12, height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.85)' }, lineStyle]} /> : null}
    </Animated.View>
  );
}

function ResultCard({ product, onAgain }: { product: Product; onAgain: () => void }) {
  const score = gradeToScore(product.grade);
  const matched = product.ingredients.filter((i) => !i.is_nutrient).length;
  return (
    <Animated.View entering={FadeInDown.springify().damping(18)} exiting={FadeOutDown} style={styles.result}>
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <ProductImage uri={product.image_url} category={product.category} size={68} />
        <View style={{ flex: 1 }}>
          <Txt variant="caption" tone="secondary" numberOfLines={1}>{product.brand || categoryLabel(product.category)}</Txt>
          <Txt variant="headline" numberOfLines={2} style={{ marginTop: 2 }}>{product.name}</Txt>
          <Txt variant="footnote" tone="secondary" style={{ marginTop: 3 }}>
            {scoreQualifier(score)} · {matched} ingredient{matched === 1 ? '' : 's'}
          </Txt>
        </View>
        <ScoreBadge score={score} size={52} />
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
        <Button label="Scan again" variant="secondary" size="md" style={{ flex: 1 }} onPress={onAgain} />
        <Button label="See analysis" size="md" style={{ flex: 1.4 }} onPress={() => { router.push(`/product/${product.id}?via=scan` as never); setTimeout(onAgain, 400); }} />
      </View>
    </Animated.View>
  );
}

function MissCard({ barcode, onAgain }: { barcode: string; onAgain: () => void }) {
  return (
    <Animated.View entering={FadeInDown.springify().damping(18)} exiting={FadeOutDown} style={styles.result}>
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <View style={styles.missIcon}><PackagePlus size={28} color={Palette.accent} strokeWidth={1.6} /></View>
        <View style={{ flex: 1 }}>
          <Txt variant="headline">We don’t know this one yet</Txt>
          <Txt variant="footnote" tone="secondary" style={{ marginTop: 3 }}>
            Snap the front and the ingredient list and we’ll add it. It takes about 20 seconds.
          </Txt>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
        <Button label="Scan again" variant="secondary" size="md" style={{ flex: 1 }} onPress={onAgain} />
        <Button
          label="Help add it"
          size="md"
          style={{ flex: 1.4 }}
          onPress={() => { router.push({ pathname: '/submit-product', params: { barcode } } as never); setTimeout(onAgain, 400); }}
        />
      </View>
    </Animated.View>
  );
}

/** Ingestion finished without finding the product in any trusted catalogue. */
class NotInCatalogue extends Error {}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050E0D' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  permission: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, backgroundColor: Palette.night },
  permIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(244,241,234,0.08)', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 12, borderRadius: Radius.pill, backgroundColor: 'rgba(244,241,234,0.12)', maxWidth: '92%' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  result: { backgroundColor: Palette.surface, borderRadius: Radius.xxl, borderCurve: 'continuous', padding: 18 },
  missIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: Palette.accentSoft, alignItems: 'center', justifyContent: 'center' },
});
