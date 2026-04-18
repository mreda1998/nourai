import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Constants from 'expo-constants';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSpring,
  withSequence,
  FadeInUp,
  FadeIn,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';

import {
  Colors,
  Fonts,
  Spacing,
  Radius,
  FontSizes,
  scale,
  verticalScale,
} from '@/constants/theme';
import { useAppState } from '@/context/app-state';
import { api, type MealAnalysisResponse, type Product, type ProductListItem } from '@/services/api';

type InputMode = 'scan' | 'photo' | 'type' | 'search';

export default function ScanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { addToStack } = useAppState();

  // Camera
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const lastScannedRef = useRef<string | null>(null);

  // Mode state
  const [mode, setMode] = useState<InputMode>('scan');

  // Scan mode state
  const [isScanning, setIsScanning] = useState(true);
  const [productDetected, setProductDetected] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Type mode state
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);

  // Search mode state
  const [productQuery, setProductQuery] = useState('');
  const [productResults, setProductResults] = useState<ProductListItem[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);

  // Photo mode state
  const [capturedImageUri, setCapturedImageUri] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  // Meal analysis state (photo + type modes)
  const [mealAnalysis, setMealAnalysis] = useState<MealAnalysisResponse | null>(null);

  // Reanimated shared values
  const sweepY = useSharedValue(0);

  // Called by CameraView when a barcode is detected
  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (!isScanning || loading || data === lastScannedRef.current) return;
    lastScannedRef.current = data;
    setTimeout(() => { lastScannedRef.current = null; }, 3000);
    fetchProduct(data);
  };

  // Fetch product from API by barcode
  const fetchProduct = async (barcode: string) => {
    setLoading(true);
    setError(null);

    try {
      const data = await api.getProductByBarcode(barcode);
      setProduct(data);
      setProductDetected(true);
      setIsScanning(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (err) {
      console.error('Error fetching product:', err);
      setError('Failed to load product');
      setIsScanning(false);
    } finally {
      setLoading(false);
    }
  };

  // Type mode: describe your meal → AI analysis
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    Keyboard.dismiss();
    setSearching(true);
    setError(null);

    try {
      const data = await api.analyzeMeal({ description: searchQuery.trim() });
      setMealAnalysis(data);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (err) {
      console.error('Error analyzing meal:', err);
      setError('Analysis failed. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  // Photo mode: take a picture and analyze as meal
  const handleTakePhoto = async () => {
    const permResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permResult.granted) {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        base64: true,
      });
      if (!result.canceled && result.assets.length > 0) {
        processPhoto(result.assets[0].uri, result.assets[0].base64 ?? null);
      }
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets.length > 0) {
      processPhoto(result.assets[0].uri, result.assets[0].base64 ?? null);
    }
  };

  const processPhoto = async (uri: string, base64: string | null) => {
    setCapturedImageUri(uri);
    setAnalyzing(true);
    setError(null);

    try {
      if (!base64) throw new Error('Could not read image data');
      const data = await api.analyzeMeal({ image_base64: base64 });
      setMealAnalysis(data);
      setAnalyzing(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (err) {
      console.error('Error analyzing image:', err);
      setError('Failed to analyze image. Please try again.');
      setAnalyzing(false);
    }
  };

  // Search mode: look up products from DB by name
  const handleProductSearch = async () => {
    if (!productQuery.trim()) return;
    Keyboard.dismiss();
    setSearchingProducts(true);
    setProductResults([]);
    setError(null);
    try {
      const results = await api.searchProducts(productQuery.trim());
      setProductResults(results.products);
    } catch {
      setError('Search failed. Please try again.');
    } finally {
      setSearchingProducts(false);
    }
  };

  // Tap a food item in the meal panel → navigate to its product page
  const handleFoodTap = async (foodName: string) => {
    try {
      const results = await api.searchProducts(foodName, false);
      if (results.products.length > 0) {
        router.push(`/product/${results.products[0].id}`);
      }
    } catch {
      // Food not in DB — silently ignore
    }
  };

  // Sweep animation
  useEffect(() => {
    if (mode === 'scan' && isScanning) {
      if (!cameraPermission?.granted) {
        requestCameraPermission();
      }
      sweepY.value = 0;
      sweepY.value = withRepeat(
        withTiming(340, { duration: 2400, easing: Easing.linear }),
        -1,
        false,
      );
    }
  }, [mode, isScanning, cameraPermission?.granted]);

  // Reset when switching modes
  useEffect(() => {
    setProduct(null);
    setProductDetected(false);
    setMealAnalysis(null);
    setError(null);
    setSearchQuery('');
    setCapturedImageUri(null);
    setAnalyzing(false);
    setProductQuery('');
    setProductResults([]);
    setSearchingProducts(false);
    if (mode === 'scan') setIsScanning(true);
  }, [mode]);

  const handleAddToStack = () => {
    if (!product) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addToStack({
      id: product.id,
      name: product.name,
      brand: product.brand || 'Unknown',
      category: product.category,
      grade: product.grade as 'A' | 'B' | 'C' | 'D',
      ingredients: product.ingredients.map((i) => i.name),
      scannedAt: new Date(),
    });
    router.push(`/product/${product.id}`);
  };

  const handleClose = () => {
    router.back();
  };

  const dismissMealPanel = () => {
    setMealAnalysis(null);
    if (mode === 'photo') setCapturedImageUri(null);
  };

  const isDetected = productDetected && !!product;
  const hasMealResult = !!mealAnalysis;
  const hasSearchResults = mode === 'search' && productResults.length > 0;

  // Sweep animated style
  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sweepY.value }],
    opacity: isScanning ? 1 : 0,
  }));

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Camera fill (scan mode only) */}
      {mode === 'scan' && cameraPermission?.granted && Constants.isDevice && (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          onBarcodeScanned={isScanning ? handleBarcodeScanned : undefined}
          barcodeScannerSettings={{
            barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'qr', 'code128', 'code39'],
          }}
        />
      )}

      {/* Dark bg overlay when not in scan/camera mode */}
      {(mode !== 'scan' || !cameraPermission?.granted || !Constants.isDevice) && (
        <View style={StyleSheet.absoluteFill} />
      )}

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <View style={[styles.topBar, { top: insets.top + scale(12) }]}>
        {/* Close button */}
        <Pressable style={styles.glassCircle} onPress={handleClose}>
          <Text style={styles.glassIcon}>✕</Text>
        </Pressable>

        {/* Status pill */}
        <View style={styles.statusPill}>
          <View style={[
            styles.statusDot,
            { backgroundColor: isDetected || hasMealResult ? Colors.sage : Colors.sand },
          ]} />
          <Text style={styles.statusText}>
            {isDetected || hasMealResult ? 'Ingredients Read' : 'Reading label'}
          </Text>
        </View>

        {/* Expand / placeholder button */}
        <View style={styles.glassCircle} />
      </View>

      {/* ── Scan frame (scan mode only) ─────────────────────────────────── */}
      {mode === 'scan' && (
        <View style={styles.scanFrame}>
          {/* Corner brackets */}
          {([
            { top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2 },
            { top: 0, right: 0, borderTopWidth: 2, borderRightWidth: 2 },
            { bottom: 0, left: 0, borderBottomWidth: 2, borderLeftWidth: 2 },
            { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2 },
          ] as const).map((pos, i) => (
            <View
              key={i}
              style={{
                position: 'absolute',
                width: 32,
                height: 32,
                borderColor: isDetected ? Colors.sage : 'rgba(255,255,255,0.85)',
                ...pos,
              }}
            />
          ))}

          {/* Sweep line */}
          {isScanning && (
            <Animated.View style={[styles.sweepLine, sweepStyle]} />
          )}
        </View>
      )}

      {/* ── Permission / simulator placeholders ─────────────────────────── */}
      {mode === 'scan' && !Constants.isDevice && (
        <Animated.View entering={FadeIn.duration(300)} style={styles.permissionContainer}>
          <Text style={styles.permissionTitle}>Simulator Detected</Text>
          <Text style={styles.permissionSubtitle}>
            Camera scanning requires a real device. Use the "Type" tab to search by product name.
          </Text>
        </Animated.View>
      )}
      {mode === 'scan' && Constants.isDevice && !cameraPermission?.granted && (
        <Animated.View entering={FadeIn.duration(300)} style={styles.permissionContainer}>
          <Text style={styles.permissionTitle}>Camera Required</Text>
          <Text style={styles.permissionSubtitle}>
            Allow camera access to scan product barcodes
          </Text>
          <Pressable style={styles.permissionBtn} onPress={requestCameraPermission}>
            <Text style={styles.permissionBtnText}>Grant Access</Text>
          </Pressable>
        </Animated.View>
      )}

      {/* ── Photo mode ──────────────────────────────────────────────────── */}
      {mode === 'photo' && (
        <Animated.View entering={FadeIn.duration(300)} style={styles.photoContainer}>
          {capturedImageUri ? (
            <Image source={{ uri: capturedImageUri }} style={styles.capturedImage} />
          ) : (
            <>
              <Text style={styles.permissionTitle}>Take a photo of your meal</Text>
              <Text style={styles.permissionSubtitle}>
                Claude AI will identify every ingredient
              </Text>
            </>
          )}
          {!hasMealResult && (
            <Pressable style={styles.shutterButton} onPress={handleTakePhoto}>
              <View style={styles.shutterInner} />
            </Pressable>
          )}
        </Animated.View>
      )}

      {/* ── Type mode ───────────────────────────────────────────────────── */}
      {mode === 'type' && (
        <Animated.View entering={FadeIn.duration(300)} style={styles.typeContainer}>
          <Text style={styles.permissionTitle}>What did you eat?</Text>
          <Text style={styles.permissionSubtitle}>
            Describe your meal and AI will break it down
          </Text>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              placeholder="e.g. Grilled salmon with quinoa..."
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
              multiline
            />
            <Pressable style={styles.searchBtn} onPress={handleSearch}>
              <Text style={styles.searchBtnText}>Analyze</Text>
            </Pressable>
          </View>
        </Animated.View>
      )}

      {/* ── Search mode ─────────────────────────────────────────────────── */}
      {mode === 'search' && (
        <Animated.View entering={FadeIn.duration(300)} style={styles.typeContainer}>
          <Text style={styles.permissionTitle}>Search products</Text>
          <Text style={styles.permissionSubtitle}>
            Find any product already in our database
          </Text>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              placeholder="e.g. Vitamin D, Creatine..."
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={productQuery}
              onChangeText={setProductQuery}
              onSubmitEditing={handleProductSearch}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable style={styles.searchBtn} onPress={handleProductSearch}>
              <Text style={styles.searchBtnText}>Search</Text>
            </Pressable>
          </View>
        </Animated.View>
      )}

      {/* ── Mode toggle ─────────────────────────────────────────────────── */}
      <View style={[styles.modeToggle, { bottom: isDetected || hasMealResult || hasSearchResults ? verticalScale(340) : verticalScale(220) }]}>
        {(['scan', 'photo', 'type', 'search'] as InputMode[]).map((m) => (
          <Pressable
            key={m}
            style={[styles.modeTab, mode === m && styles.modeTabActive]}
            onPress={() => { setMode(m); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <Text style={[styles.modeTabText, mode === m && styles.modeTabTextActive]}>
              {m === 'scan' ? 'Scan' : m === 'photo' ? 'Photo' : m === 'type' ? 'Type' : 'Search'}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ── Loading ─────────────────────────────────────────────────────── */}
      {(loading || searching || analyzing || searchingProducts) && (
        <View style={[styles.loadingOverlay, { bottom: insets.bottom + scale(180) }]}>
          <ActivityIndicator size="large" color="rgba(255,255,255,0.9)" />
          <Text style={styles.loadingText}>
            {searching ? 'Analyzing your meal...' : analyzing ? 'Analyzing photo...' : searchingProducts ? 'Searching products...' : 'Looking up product...'}
          </Text>
        </View>
      )}

      {/* ── Error ───────────────────────────────────────────────────────── */}
      {error && !loading && !searching && !analyzing && !isDetected && !hasMealResult && (
        <Animated.View entering={FadeIn.duration(300)} style={[styles.errorOverlay, { bottom: insets.bottom + scale(180) }]}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            style={styles.retryBtn}
            onPress={() => {
              if (mode === 'scan') setIsScanning(true);
              if (mode === 'photo') setCapturedImageUri(null);
              setError(null);
            }}
          >
            <Text style={styles.retryBtnText}>
              {mode === 'scan' ? 'Retry' : mode === 'photo' ? 'Retake' : 'Try Again'}
            </Text>
          </Pressable>
        </Animated.View>
      )}

      {/* ── Bottom sheet ────────────────────────────────────────────────── */}
      <View style={[styles.bottomSheet, { paddingBottom: insets.bottom + scale(16) }]}>
        {/* Aligning / idle state */}
        {!isDetected && !hasMealResult && !hasSearchResults && (
          <Text style={styles.alignText}>
            {mode === 'search' && !searchingProducts
              ? 'Search for a product above…'
              : 'Hold steady over the ingredients panel…'}
          </Text>
        )}

        {/* Product detected */}
        {isDetected && product && (
          <Animated.View entering={FadeInUp.duration(300)}>
            {/* Product info row */}
            <View style={styles.productRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.productBrand}>{product.brand?.toUpperCase() ?? ''}</Text>
                <Text style={styles.productName}>{product.name}</Text>
              </View>
              <View style={styles.gradeBadge}>
                <Text style={styles.gradeText}>{product.grade}</Text>
              </View>
            </View>

            {/* Ingredient chips */}
            <View style={styles.chipRow}>
              {product.ingredients.slice(0, 5).map((ing, idx) => (
                <Animated.View key={ing.name} entering={FadeInUp.duration(200).delay(idx * 60)}>
                  <View style={styles.chip}>
                    <Text style={styles.chipText}>{ing.name}</Text>
                  </View>
                </Animated.View>
              ))}
            </View>

            {/* CTA */}
            <Pressable style={styles.ctaBtn} onPress={handleAddToStack}>
              <Text style={styles.ctaBtnText}>Analyze →</Text>
            </Pressable>
          </Animated.View>
        )}

        {/* Meal analysis result */}
        {hasMealResult && mealAnalysis && (
          <Animated.View entering={FadeInUp.duration(300)}>
            <View style={styles.productRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.productBrand}>MEAL IDENTIFIED</Text>
                <Text style={styles.productName} numberOfLines={2}>
                  {mealAnalysis.meal_summary}
                </Text>
              </View>
              <View style={styles.gradeBadge}>
                <Text style={styles.gradeText}>{mealAnalysis.foods.length}</Text>
              </View>
            </View>

            <ScrollView style={styles.mealList} showsVerticalScrollIndicator={false} nestedScrollEnabled>
              {mealAnalysis.foods.map((food, idx) => (
                <Pressable
                  key={`${food.name}-${idx}`}
                  style={styles.mealItem}
                  onPress={() => handleFoodTap(food.name)}
                >
                  <Text style={styles.mealItemName}>{food.name}</Text>
                  {food.estimated_amount ? (
                    <Text style={styles.mealItemAmt}>{food.estimated_amount}</Text>
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>

            <Pressable style={styles.ctaBtn} onPress={dismissMealPanel}>
              <Text style={styles.ctaBtnText}>Done →</Text>
            </Pressable>
          </Animated.View>
        )}

        {/* Product search results */}
        {hasSearchResults && (
          <Animated.View entering={FadeInUp.duration(300)}>
            <View style={styles.productRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.productBrand}>Results</Text>
                <Text style={styles.productName}>
                  {productResults.length} product{productResults.length !== 1 ? 's' : ''} found
                </Text>
              </View>
            </View>
            <ScrollView style={styles.mealList} showsVerticalScrollIndicator={false} nestedScrollEnabled>
              {productResults.map((p) => (
                <Pressable
                  key={p.id}
                  style={styles.searchResultRow}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/product/${p.id}`);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    {p.brand ? (
                      <Text style={styles.productBrand}>{p.brand.toUpperCase()}</Text>
                    ) : null}
                    <Text style={styles.searchResultName}>{p.name}</Text>
                  </View>
                  <View style={[styles.chip, { flexShrink: 0 }]}>
                    <Text style={styles.chipText}>{p.category}</Text>
                  </View>
                  <Text style={styles.searchResultArrow}>›</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Animated.View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },

  // Top bar
  topBar: {
    position: 'absolute',
    left: scale(20),
    right: scale(20),
    zIndex: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  glassCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassIcon: {
    color: '#fff',
    fontSize: 14,
    fontFamily: Fonts.sansSemiBold,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingVertical: scale(7),
    paddingHorizontal: scale(14),
    borderRadius: Radius.pill,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.caption,
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // Scan frame
  scanFrame: {
    position: 'absolute',
    width: 280,
    height: 340,
    top: '38%',
    left: '50%',
    marginLeft: -140,
    marginTop: -170,
    zIndex: 10,
  },
  sweepLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: 'rgba(255,255,255,0.7)',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
  },

  // Permission / simulator
  permissionContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: scale(32),
  },
  permissionTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.display,
    color: '#fff',
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  permissionSubtitle: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  permissionBtn: {
    backgroundColor: '#fff',
    paddingHorizontal: scale(32),
    paddingVertical: scale(14),
    borderRadius: Radius.pill,
  },
  permissionBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.body,
    color: Colors.ink,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // Photo mode
  photoContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: scale(24),
  },
  capturedImage: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    resizeMode: 'cover',
  },
  shutterButton: {
    position: 'absolute',
    bottom: verticalScale(200),
    width: scale(64),
    height: scale(64),
    borderRadius: scale(32),
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: scale(52),
    height: scale(52),
    borderRadius: scale(26),
    backgroundColor: 'rgba(255,255,255,0.3)',
  },

  // Type mode
  typeContainer: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: scale(24),
  },
  searchRow: {
    width: '100%',
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'flex-end',
  },
  searchInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: '#fff',
    maxHeight: verticalScale(100),
  },
  searchBtn: {
    backgroundColor: '#fff',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    justifyContent: 'center',
  },
  searchBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.body,
    color: Colors.ink,
  },

  // Mode toggle
  modeToggle: {
    position: 'absolute',
    alignSelf: 'center',
    left: scale(20),
    right: scale(20),
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: Radius.pill,
    padding: scale(4),
    zIndex: 15,
  },
  modeTab: {
    flex: 1,
    paddingVertical: scale(9),
    paddingHorizontal: scale(8),
    borderRadius: Radius.pill,
    alignItems: 'center',
  },
  modeTabActive: {
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  modeTabText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.caption,
    color: 'rgba(255,255,255,0.6)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  modeTabTextActive: {
    color: Colors.ink,
  },

  // Loading
  loadingOverlay: {
    position: 'absolute',
    left: scale(20),
    right: scale(20),
    backgroundColor: 'rgba(28,28,28,0.92)',
    borderRadius: scale(20),
    padding: scale(24),
    alignItems: 'center',
    zIndex: 30,
  },
  loadingText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: '#fff',
    marginTop: Spacing.md,
  },

  // Error
  errorOverlay: {
    position: 'absolute',
    left: scale(20),
    right: scale(20),
    backgroundColor: 'rgba(163,75,75,0.95)',
    borderRadius: scale(20),
    padding: scale(24),
    alignItems: 'center',
    zIndex: 30,
  },
  errorText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: '#fff',
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: '#fff',
    paddingVertical: scale(12),
    paddingHorizontal: scale(24),
    borderRadius: Radius.pill,
  },
  retryBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.body,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: Colors.ink,
  },

  // Bottom sheet
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: scale(24),
    paddingTop: scale(24),
    zIndex: 25,
    minHeight: verticalScale(130),
    justifyContent: 'center',
  },
  alignText: {
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.bodyLarge,
    color: Colors.inkSecondary,
    textAlign: 'center',
    paddingVertical: scale(12),
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: scale(14),
    gap: scale(12),
  },
  productBrand: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.caption,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: Colors.inkSecondary,
    marginBottom: 2,
  },
  productName: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.heading,
    color: Colors.ink,
    lineHeight: FontSizes.heading * 1.1,
  },
  gradeBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  gradeText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.bodyLarge,
    color: Colors.surface,
    lineHeight: FontSizes.bodyLarge * 1.2,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scale(6),
    marginBottom: scale(20),
  },
  chip: {
    paddingVertical: scale(4),
    paddingHorizontal: scale(10),
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.pill,
  },
  chipText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.ink,
  },
  ctaBtn: {
    backgroundColor: Colors.ink,
    borderRadius: Radius.pill,
    paddingVertical: scale(16),
    alignItems: 'center',
  },
  ctaBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.body,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    color: Colors.surface,
  },
  mealList: {
    maxHeight: verticalScale(120),
    marginBottom: scale(16),
  },
  mealItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: scale(8),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderHairline,
  },
  mealItemName: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.body,
    color: Colors.ink,
    flex: 1,
  },
  mealItemAmt: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkSecondary,
    marginLeft: scale(8),
  },

  // Search results
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: scale(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderHairline,
    gap: scale(8),
  },
  searchResultName: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.subtitle,
    color: Colors.ink,
    lineHeight: FontSizes.subtitle * 1.2,
  },
  searchResultArrow: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.heading,
    color: Colors.inkTertiary,
    flexShrink: 0,
  },
});
