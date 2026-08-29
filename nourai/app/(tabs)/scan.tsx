import React, { useRef, useState } from 'react';
import { ActivityIndicator, ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { api, isBarcodeIngestionResponse, Product } from '@/services/api';
import { useAppState } from '@/context/app-state';
import { Colors, Fonts, Radius } from '@/constants/theme';
import { BrandMark, EloryScreen, ProductThumb } from '@/components/elory';

const hero = require('@/assets/images/elory-architecture-hero.png');

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('Align the barcode inside the frame');
  const [error, setError] = useState<string | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const lastCode = useRef<string | null>(null);
  const { addToStack } = useAppState();

  const scan = async ({ data }: { data: string }) => {
    if (loading || product || lastCode.current === data) return;
    lastCode.current = data;
    setLoading(true); setError(null); setMessage('Looking up this product…');
    try {
      const initial = await api.getProductByBarcode(data);
      let value: Product | null = null;
      if (isBarcodeIngestionResponse(initial)) {
        let job = initial;
        for (let attempt = 0; attempt < 45; attempt += 1) {
          setMessage(job.message);
          if (job.status === 'complete' && job.product_id) { value = await api.getProduct(job.product_id); break; }
          if (job.status === 'needs_review' || job.status === 'dead') throw new Error(job.message);
          await new Promise((resolve) => setTimeout(resolve, job.poll_after_ms));
          job = await api.getIngestionStatus(job.job_id);
        }
      } else value = initial;
      if (!value) throw new Error('Verification is taking longer than expected. Try again shortly.');
      setProduct(value); setMessage('Product identified');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'We could not identify this product.');
      setMessage('Ready to try again');
      setTimeout(() => { lastCode.current = null; }, 2000);
    } finally { setLoading(false); }
  };

  const add = () => {
    if (!product) return;
    addToStack({ id: product.id, name: product.name, brand: product.brand || 'Unknown', category: product.category, grade: ['A','B','C','D'].includes(product.grade) ? product.grade as 'A'|'B'|'C'|'D' : 'C', ingredients: product.ingredients.map((item) => item.name), imageUri: product.image_url, scannedAt: new Date() });
    router.push(`/product/${product.id}` as never);
  };

  return (
    <EloryScreen header={<View style={styles.header}><BrandMark compact /><View style={styles.help}><Text style={styles.helpText}>?</Text></View></View>}>
      <ImageBackground source={hero} style={styles.hero} imageStyle={styles.heroImage}>
        <View style={styles.heroWash} />
        <View style={styles.heroCopy}><Text style={styles.heroTitle}>Scan any product.</Text><Text style={styles.heroSubtitle}>See the science behind every ingredient.</Text></View>
      </ImageBackground>

      <View style={styles.cameraCard}>
        {permission?.granted && Constants.isDevice ? <CameraView style={StyleSheet.absoluteFill} facing="back" onBarcodeScanned={product ? undefined : scan} barcodeScannerSettings={{ barcodeTypes: ['ean13','ean8','upc_a','upc_e','qr','code128'] }} /> : <ImageBackground source={hero} style={StyleSheet.absoluteFill} imageStyle={{ resizeMode: 'cover' }}><View style={styles.cameraPlaceholder} /></ImageBackground>}
        <View style={styles.frame}>
          <View style={[styles.corner, styles.topLeft]} /><View style={[styles.corner, styles.topRight]} /><View style={[styles.corner, styles.bottomLeft]} /><View style={[styles.corner, styles.bottomRight]} />
          <View style={styles.scanLine} />
        </View>
        {!permission?.granted ? <Pressable style={styles.permission} onPress={requestPermission}><Text style={styles.permissionText}>{Constants.isDevice ? 'Enable camera' : 'Camera preview'}</Text></Pressable> : null}
      </View>
      <View style={styles.status}><View style={[styles.statusDot, { backgroundColor: product ? Colors.sage : Colors.sand }]} /><Text style={styles.statusText}>{loading ? message : product ? 'Product identified' : message}</Text>{loading ? <ActivityIndicator size="small" color={Colors.accent} /> : null}</View>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {product ? (
        <View style={styles.result}>
          <ProductThumb size={48} imageUri={product.image_url} letter={product.name.slice(0, 1)} />
          <View style={{ flex: 1 }}><Text style={styles.resultBrand}>{product.brand || product.category}</Text><Text style={styles.resultName}>{product.name}</Text></View>
          <Pressable style={styles.analyze} onPress={add}><Text style={styles.analyzeText}>Analyze →</Text></Pressable>
        </View>
      ) : (
        <>
          <Pressable style={styles.primary} onPress={() => permission?.granted ? null : requestPermission()}><Text style={styles.primaryText}>{loading ? 'Reading label…' : 'Scan barcode'}</Text></Pressable>
          <View style={styles.or}><View style={styles.rule} /><Text style={styles.orText}>or</Text><View style={styles.rule} /></View>
          <Pressable style={styles.secondary} onPress={() => router.push('/(tabs)/explore' as never)}><Text style={styles.secondaryText}>⌕  Search products instead</Text></Pressable>
        </>
      )}
      <Text style={styles.privacy}>Your camera stays private. Images are processed only when you choose to scan.</Text>
    </EloryScreen>
  );
}

const styles = StyleSheet.create({
  header: { height: 54, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, help: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: Colors.borderHairline, alignItems: 'center', justifyContent: 'center' }, helpText: { fontFamily: Fonts.serifMedium, color: Colors.ink, fontSize: 14 },
  hero: { height: 188, marginHorizontal: -20, marginTop: -12, marginBottom: -30, justifyContent: 'flex-start' }, heroImage: { resizeMode: 'cover' }, heroWash: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(247,244,238,.25)' }, heroCopy: { paddingHorizontal: 20, paddingTop: 16 }, heroTitle: { fontFamily: Fonts.serif, color: Colors.ink, fontSize: 31 }, heroSubtitle: { fontFamily: Fonts.sans, color: Colors.inkSecondary, fontSize: 10.5, marginTop: 3 },
  cameraCard: { height: 294, borderRadius: Radius.lg, overflow: 'hidden', backgroundColor: '#CBB79E', borderWidth: 4, borderColor: Colors.surfaceCard }, cameraPlaceholder: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(18,51,50,.2)' }, frame: { position: 'absolute', top: 52, left: 43, right: 43, bottom: 52 }, corner: { position: 'absolute', width: 35, height: 35, borderColor: '#fff' }, topLeft: { left: 0, top: 0, borderLeftWidth: 2, borderTopWidth: 2 }, topRight: { right: 0, top: 0, borderRightWidth: 2, borderTopWidth: 2 }, bottomLeft: { left: 0, bottom: 0, borderLeftWidth: 2, borderBottomWidth: 2 }, bottomRight: { right: 0, bottom: 0, borderRightWidth: 2, borderBottomWidth: 2 }, scanLine: { position: 'absolute', top: '50%', left: 12, right: 12, height: 1, backgroundColor: 'rgba(255,255,255,.8)' }, permission: { position: 'absolute', alignSelf: 'center', top: '44%', backgroundColor: 'rgba(255,255,255,.88)', borderRadius: Radius.pill, paddingVertical: 9, paddingHorizontal: 15 }, permissionText: { fontFamily: Fonts.sansMedium, color: Colors.ink, fontSize: 10 },
  status: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginVertical: 13 }, statusDot: { width: 6, height: 6, borderRadius: 3 }, statusText: { fontFamily: Fonts.sans, color: Colors.inkSecondary, fontSize: 9.5 }, error: { fontFamily: Fonts.sans, color: Colors.alert, textAlign: 'center', fontSize: 9.5, marginBottom: 9 },
  result: { minHeight: 80, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 11, borderRadius: Radius.md, backgroundColor: Colors.surfaceCard, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.borderHairline }, resultBrand: { fontFamily: Fonts.sansSemiBold, textTransform: 'uppercase', color: Colors.inkSecondary, fontSize: 7.5, letterSpacing: .7 }, resultName: { fontFamily: Fonts.serifMedium, color: Colors.ink, fontSize: 16, marginTop: 2 }, analyze: { backgroundColor: Colors.accent, borderRadius: Radius.pill, paddingVertical: 10, paddingHorizontal: 12 }, analyzeText: { color: Colors.accentInk, fontFamily: Fonts.sansMedium, fontSize: 9.5 },
  primary: { height: 48, borderRadius: Radius.pill, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' }, primaryText: { fontFamily: Fonts.sansMedium, color: Colors.accentInk, fontSize: 11 }, or: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 10 }, rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: Colors.borderHairline }, orText: { fontFamily: Fonts.serifItalic, color: Colors.inkSecondary, fontSize: 12 }, secondary: { height: 45, borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.borderHairline, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surfaceCard }, secondaryText: { fontFamily: Fonts.sansMedium, color: Colors.ink, fontSize: 10.5 }, privacy: { fontFamily: Fonts.sans, color: Colors.inkTertiary, textAlign: 'center', fontSize: 8, lineHeight: 12, paddingHorizontal: 35, marginTop: 13 },
});
