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
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';

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
import { useAppState } from '@/context/app-state';
import { api, type MealAnalysisResponse, type Product } from '@/services/api';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type InputMode = 'scan' | 'photo' | 'type';

const MODE_TAB_WIDTH = scale(44);
const MODE_TAB_PADDING = scale(4);

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

  // Photo mode state
  const [capturedImageUri, setCapturedImageUri] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  // Meal analysis state (photo + type modes)
  const [mealAnalysis, setMealAnalysis] = useState<MealAnalysisResponse | null>(null);

  // Reanimated shared values
  const scanLineProgress = useSharedValue(0);
  const cornerPulse = useSharedValue(1);
  const panelTranslateY = useSharedValue(verticalScale(300));
  const modeToggleX = useSharedValue(0);

  // Called by CameraView when a barcode is detected
  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (!isScanning || loading || data === lastScannedRef.current) return;
    // Debounce — ignore the same barcode for 3s
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
      panelTranslateY.value = withSpring(0, { damping: 15, stiffness: 100 });
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
      panelTranslateY.value = withSpring(0, { damping: 15, stiffness: 100 });
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
      // Fall back to photo library on simulator or if camera denied
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
      if (!base64) {
        throw new Error('Could not read image data');
      }
      const data = await api.analyzeMeal({ image_base64: base64 });
      setMealAnalysis(data);
      setAnalyzing(false);

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      panelTranslateY.value = withSpring(0, { damping: 15, stiffness: 100 });
    } catch (err) {
      console.error('Error analyzing image:', err);
      setError('Failed to analyze image. Please try again.');
      setAnalyzing(false);
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

  // Scanning animations + permission request
  useEffect(() => {
    if (mode === 'scan' && isScanning) {
      // Request camera permission as soon as the user enters scan mode
      if (!cameraPermission?.granted) {
        requestCameraPermission();
      }

      scanLineProgress.value = 0;
      scanLineProgress.value = withRepeat(
        withTiming(1, { duration: 3000, easing: Easing.linear }),
        -1,
        false
      );

      cornerPulse.value = withRepeat(
        withSequence(
          withTiming(1.05, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
    }
  }, [mode, isScanning, cameraPermission?.granted]);

  // Mode toggle animation
  useEffect(() => {
    const modeIndex = mode === 'scan' ? 0 : mode === 'photo' ? 1 : 2;
    modeToggleX.value = withSpring(modeIndex, { damping: 15, stiffness: 120 });
  }, [mode]);

  // Reset when switching modes
  useEffect(() => {
    setProduct(null);
    setProductDetected(false);
    setMealAnalysis(null);
    setError(null);
    setSearchQuery('');
    setCapturedImageUri(null);
    setAnalyzing(false);
    panelTranslateY.value = verticalScale(300);
    if (mode === 'scan') {
      setIsScanning(true);
    }
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
    panelTranslateY.value = verticalScale(300);
    if (mode === 'photo') setCapturedImageUri(null);
  };

  // Status text logic
  const getStatusText = () => {
    if (mealAnalysis) return 'Analysis Complete';
    if (productDetected) return mode === 'photo' ? 'Analysis Complete' : 'Product Detected';
    switch (mode) {
      case 'scan':
        return isScanning ? 'Scanning...' : 'Product Detected';
      case 'photo':
        return analyzing ? 'Analyzing...' : 'Ready';
      case 'type':
        return searching ? 'Analyzing...' : 'Describe Your Meal';
    }
  };

  // Animated styles
  const scanLineStyle = useAnimatedStyle(() => {
    const translateY = interpolate(
      scanLineProgress.value,
      [0, 1],
      [Layout.scannerOverlaySize * 0.1, Layout.scannerOverlaySize * 0.9]
    );
    const opacity = interpolate(
      scanLineProgress.value,
      [0, 0.1, 0.9, 1],
      [0, 1, 1, 0]
    );
    return {
      transform: [{ translateY }],
      opacity,
    };
  });

  const cornerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cornerPulse.value }],
  }));

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: panelTranslateY.value }],
  }));

  const modeTogglePillStyle = useAnimatedStyle(() => {
    const tabFullWidth = MODE_TAB_WIDTH + scale(16);
    const translateX = interpolate(modeToggleX.value, [0, 1, 2], [0, tabFullWidth, tabFullWidth * 2]);
    return { transform: [{ translateX }] };
  });

  // Button press animation
  const confirmScale = useSharedValue(1);
  const confirmAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: confirmScale.value }],
  }));

  const hasMealResult = !!mealAnalysis;
  const hasProductResult = productDetected && !!product;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Background */}
      <View style={styles.viewfinder}>
        {/* Mode Toggle */}
        <View style={[styles.modeToggle, { top: insets.top + verticalScale(70) }]}>
          <Animated.View style={[styles.modeTogglePill, modeTogglePillStyle]} />
          {(['scan', 'photo', 'type'] as InputMode[]).map((m) => (
            <Pressable
              key={m}
              style={styles.modeTab}
              onPress={() => { setMode(m); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Text style={[styles.modeTabText, mode === m && styles.modeTabTextActive]}>
                {m === 'scan' ? 'Scan' : m === 'photo' ? 'Photo' : 'Type'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Scan Mode — live camera + overlay */}
        {mode === 'scan' && (
          <>
            {!Constants.isDevice ? (
              <Animated.View entering={FadeIn.duration(300)} style={styles.permissionContainer}>
                <Text style={styles.permissionTitle}>Simulator Detected</Text>
                <Text style={styles.permissionSubtitle}>
                  Camera scanning requires a real device. Use the "Type" tab to search by product name instead.
                </Text>
              </Animated.View>
            ) : cameraPermission?.granted ? (
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                onBarcodeScanned={isScanning ? handleBarcodeScanned : undefined}
                barcodeScannerSettings={{
                  barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'qr', 'code128', 'code39'],
                }}
              />
            ) : (
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

            {/* Crosshair overlay on top of camera */}
            <View style={styles.scanOverlay}>
              <Animated.View style={[styles.cornerContainer, cornerStyle]}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
              </Animated.View>

              {isScanning && cameraPermission?.granted && Constants.isDevice && (
                <Animated.View style={[styles.scanLine, scanLineStyle]} />
              )}
            </View>
          </>
        )}

        {/* Photo Mode */}
        {mode === 'photo' && (
          <Animated.View entering={FadeIn.duration(300)} style={styles.photoContainer}>
            {capturedImageUri ? (
              <Image source={{ uri: capturedImageUri }} style={styles.capturedImage} />
            ) : (
              <>
                {/* Camera icon placeholder */}
                <View style={styles.cameraIconContainer}>
                  <View style={styles.cameraIcon}>
                    <View style={styles.cameraBody} />
                    <View style={styles.cameraLens} />
                    <View style={styles.cameraFlash} />
                  </View>
                </View>
                <Text style={styles.photoTitle}>Take a photo of your meal</Text>
                <Text style={styles.photoSubtitle}>
                  Claude AI will identify every ingredient
                </Text>
              </>
            )}

            {/* Shutter button */}
            {!hasMealResult && (
              <Pressable
                style={styles.shutterButton}
                onPress={handleTakePhoto}
              >
                <View style={styles.shutterButtonInner} />
              </Pressable>
            )}
          </Animated.View>
        )}

        {/* Type Mode */}
        {mode === 'type' && (
          <Animated.View entering={FadeIn.duration(300)} style={styles.typeContainer}>
            <Text style={styles.typeTitle}>What did you eat?</Text>
            <Text style={styles.typeSubtitle}>
              Describe your meal and AI will break it down
            </Text>

            <View style={styles.searchInputContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder="e.g. Grilled salmon with quinoa and broccoli..."
                placeholderTextColor={Colors.inkTertiary}
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
      </View>

      {/* Top Navigation */}
      <View style={[styles.topNav, { top: insets.top + Spacing.md }]}>
        <Pressable onPress={handleClose} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>✕</Text>
        </Pressable>

        <View style={styles.statusBadge}>
          <View style={[styles.statusDot, (hasProductResult || hasMealResult) && styles.statusDotSuccess]} />
          <Text style={styles.statusText}>{getStatusText()}</Text>
        </View>

        <View style={{ width: scale(24) }} />
      </View>

      {/* Loading Indicator */}
      {(loading || searching || analyzing) && (
        <View style={[styles.loadingOverlay, { bottom: insets.bottom + scale(40) }]}>
          <ActivityIndicator size="large" color={Colors.bone} />
          <Text style={styles.loadingText}>
            {searching ? 'Analyzing your meal...' : analyzing ? 'Analyzing photo...' : 'Looking up product...'}
          </Text>
        </View>
      )}

      {/* Error State */}
      {error && !loading && !searching && !analyzing && !hasProductResult && !hasMealResult && (
        <Animated.View
          entering={FadeIn.duration(300)}
          style={[styles.errorPanel, { bottom: insets.bottom + scale(40) }]}
        >
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

      {/* Product Recognition Panel (scan mode) */}
      {hasProductResult && (
        <Animated.View
          style={[
            styles.recognitionPanelWrapper,
            panelStyle,
            { bottom: insets.bottom + scale(40) },
          ]}
        >
          <BlurView
            intensity={20}
            tint="light"
            style={[
              styles.recognitionPanel,
              product.is_ai_generated && styles.recognitionPanelAI,
            ]}
          >
            {product.is_ai_generated && (
              <View style={styles.aiBadge}>
                <Text style={styles.aiBadgeIcon}>✦</Text>
                <Text style={styles.aiBadgeText}>AI-Generated Analysis</Text>
              </View>
            )}

            <View style={styles.productDetectedRow}>
              <View style={styles.productInfo}>
                <Text style={styles.detectedLabel}>
                  {product.is_ai_generated ? 'Generated' : 'Detected'}
                </Text>
                <Text style={styles.productName}>{product.name}</Text>
                {product.brand && (
                  <Text style={styles.productBrand}>{product.brand}</Text>
                )}
              </View>
              <Text style={styles.gradeDisplay}>{product.grade}</Text>
            </View>

            <View style={styles.ingredientCloud}>
              {product.ingredients.slice(0, 6).map((ingredient, index) => (
                <Animated.View
                  key={ingredient.name}
                  entering={FadeInUp.duration(300).delay(100 + index * 100)}
                >
                  <View style={styles.ingredientTag}>
                    <Text style={styles.ingredientTagText}>{ingredient.name}</Text>
                  </View>
                </Animated.View>
              ))}
            </View>

            <AnimatedPressable
              style={[styles.confirmBtn, confirmAnimStyle]}
              onPress={handleAddToStack}
              onPressIn={() => { confirmScale.value = withSpring(0.96, { damping: 15, stiffness: 200 }); }}
              onPressOut={() => { confirmScale.value = withSpring(1, { damping: 15, stiffness: 200 }); }}
            >
              <Text style={styles.confirmBtnText}>Add to Stack</Text>
            </AnimatedPressable>
          </BlurView>
        </Animated.View>
      )}

      {/* Meal Analysis Panel (photo + type modes) */}
      {hasMealResult && (
        <Animated.View
          style={[
            styles.recognitionPanelWrapper,
            panelStyle,
            { bottom: insets.bottom + scale(40) },
          ]}
        >
          <BlurView intensity={20} tint="light" style={styles.recognitionPanel}>
            {/* Header */}
            <View style={styles.productDetectedRow}>
              <View style={styles.productInfo}>
                <Text style={styles.detectedLabel}>
                  {mealAnalysis.analysis_type === 'image' ? 'Meal Analyzed' : 'Meal Identified'}
                </Text>
                <Text style={styles.productName} numberOfLines={2}>
                  {mealAnalysis.meal_summary}
                </Text>
              </View>
              <View style={styles.mealCountBadge}>
                <Text style={styles.mealCountNumber}>{mealAnalysis.foods.length}</Text>
                <Text style={styles.mealCountLabel}>foods</Text>
              </View>
            </View>

            {/* Food list */}
            <ScrollView
              style={styles.mealFoodList}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              {mealAnalysis.foods.map((food, index) => (
                <Animated.View
                  key={`${food.name}-${index}`}
                  entering={FadeInUp.duration(250).delay(index * 60)}
                >
                  <Pressable
                    style={styles.mealFoodItem}
                    onPress={() => handleFoodTap(food.name)}
                  >
                    <View style={styles.mealFoodRow}>
                      <Text style={styles.mealFoodName}>{food.name}</Text>
                      {food.estimated_amount ? (
                        <Text style={styles.mealFoodAmount}>{food.estimated_amount}</Text>
                      ) : null}
                    </View>
                    <View style={styles.mealConfidenceTrack}>
                      <View
                        style={[
                          styles.mealConfidenceFill,
                          { width: `${Math.round(food.confidence * 100)}%` },
                        ]}
                      />
                    </View>
                  </Pressable>
                </Animated.View>
              ))}
            </ScrollView>

            <AnimatedPressable
              style={[styles.confirmBtn, confirmAnimStyle]}
              onPress={dismissMealPanel}
              onPressIn={() => { confirmScale.value = withSpring(0.96, { damping: 15, stiffness: 200 }); }}
              onPressOut={() => { confirmScale.value = withSpring(1, { damping: 15, stiffness: 200 }); }}
            >
              <Text style={styles.confirmBtnText}>Done</Text>
            </AnimatedPressable>
          </BlurView>
        </Animated.View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.scannerBg,
  },
  viewfinder: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modeToggle: {
    position: 'absolute',
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: Radius.pill,
    padding: MODE_TAB_PADDING,
  },
  modeTogglePill: {
    position: 'absolute',
    top: MODE_TAB_PADDING,
    left: MODE_TAB_PADDING,
    width: MODE_TAB_WIDTH + scale(16),
    height: scale(34),
    backgroundColor: Colors.bone,
    borderRadius: Radius.pill,
  },
  modeTab: {
    width: MODE_TAB_WIDTH + scale(16),
    paddingVertical: scale(10),
    borderRadius: Radius.pill,
    zIndex: 1,
    alignItems: 'center',
  },
  modeTabText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.body,
    color: 'rgba(255,255,255,0.6)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  modeTabTextActive: {
    color: Colors.ink,
  },
  scanOverlay: {
    width: Layout.scannerOverlaySize,
    height: Layout.scannerOverlaySize,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: scale(40),
    position: 'relative',
  },
  cornerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  corner: {
    position: 'absolute',
    width: scale(40),
    height: scale(40),
    borderColor: '#fff',
    borderWidth: 2,
  },
  cornerTL: {
    top: -2,
    left: -2,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: scale(40),
  },
  cornerTR: {
    top: -2,
    right: -2,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: scale(40),
  },
  cornerBL: {
    bottom: -2,
    left: -2,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: scale(40),
  },
  cornerBR: {
    bottom: -2,
    right: -2,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: scale(40),
  },
  scanLine: {
    position: 'absolute',
    top: 0,
    left: '10%',
    width: '80%',
    height: 2,
    backgroundColor: '#fff',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: scale(15),
  },
  // Photo mode
  photoContainer: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: scale(24),
  },
  cameraIconContainer: {
    width: scale(80),
    height: scale(80),
    marginBottom: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraIcon: {
    width: scale(72),
    height: scale(56),
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
    borderRadius: scale(12),
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  cameraBody: {
    position: 'absolute',
    top: -scale(10),
    left: scale(20),
    width: scale(24),
    height: scale(12),
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
    borderTopLeftRadius: scale(4),
    borderTopRightRadius: scale(4),
    borderBottomWidth: 0,
  },
  cameraLens: {
    width: scale(24),
    height: scale(24),
    borderRadius: scale(12),
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  cameraFlash: {
    position: 'absolute',
    top: -scale(6),
    right: scale(10),
    width: scale(6),
    height: scale(6),
    borderRadius: scale(3),
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  photoTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.display,
    color: Colors.bone,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  photoSubtitle: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  capturedImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    resizeMode: 'cover',
  },
  shutterButton: {
    position: 'absolute',
    bottom: verticalScale(60),
    width: scale(64),
    height: scale(64),
    borderRadius: scale(32),
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterButtonInner: {
    width: scale(52),
    height: scale(52),
    borderRadius: scale(26),
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  // Type mode
  typeContainer: {
    width: '100%',
    paddingHorizontal: scale(24),
    alignItems: 'center',
  },
  typeTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.display,
    color: Colors.bone,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  typeSubtitle: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  searchInputContainer: {
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
    color: Colors.bone,
    maxHeight: verticalScale(100),
  },
  searchBtn: {
    backgroundColor: Colors.bone,
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
  // Navigation & overlays
  topNav: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  closeBtn: {
    width: scale(40),
    height: scale(40),
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#fff',
    fontSize: FontSizes.heading,
  },
  statusBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingVertical: scale(6),
    paddingHorizontal: scale(16),
    borderRadius: Radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
    overflow: 'hidden',
  },
  statusDot: {
    width: scale(6),
    height: scale(6),
    borderRadius: scale(3),
    backgroundColor: Colors.scannerGreen,
  },
  statusDotSuccess: {
    backgroundColor: Colors.scannerGreen,
    shadowColor: Colors.scannerGreen,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: scale(8),
  },
  statusText: {
    color: '#fff',
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.caption,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  loadingOverlay: {
    position: 'absolute',
    left: scale(20),
    right: scale(20),
    backgroundColor: 'rgba(28, 28, 28, 0.9)',
    borderRadius: scale(24),
    padding: scale(24),
    alignItems: 'center',
  },
  loadingText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.bone,
    marginTop: Spacing.md,
  },
  errorPanel: {
    position: 'absolute',
    left: scale(20),
    right: scale(20),
    backgroundColor: 'rgba(163, 75, 75, 0.95)',
    borderRadius: scale(24),
    padding: scale(24),
    alignItems: 'center',
  },
  errorText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.bone,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: Colors.bone,
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
  // Shared panel wrapper
  recognitionPanelWrapper: {
    position: 'absolute',
    left: scale(20),
    right: scale(20),
  },
  recognitionPanel: {
    borderRadius: scale(24),
    padding: scale(24),
    overflow: 'hidden',
    backgroundColor: 'rgba(233, 230, 223, 0.9)',
  },
  recognitionPanelAI: {
    borderWidth: 2,
    borderColor: 'rgba(163, 75, 75, 0.5)',
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(163, 75, 75, 0.1)',
    paddingVertical: scale(6),
    paddingHorizontal: scale(12),
    borderRadius: Radius.pill,
    alignSelf: 'flex-start',
    marginBottom: Spacing.md,
  },
  aiBadgeIcon: {
    fontSize: FontSizes.body,
    color: Colors.accentAlert,
  },
  aiBadgeText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: Colors.accentAlert,
  },
  productDetectedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: scale(20),
  },
  productInfo: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  detectedLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    textTransform: 'uppercase',
    color: Colors.inkSecondary,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  productName: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.heading,
    color: Colors.ink,
  },
  productBrand: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkSecondary,
    marginTop: 2,
  },
  gradeDisplay: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.display,
    color: Colors.ink,
  },
  ingredientCloud: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scale(8),
    marginBottom: scale(24),
  },
  ingredientTag: {
    paddingVertical: scale(4),
    paddingHorizontal: scale(10),
    backgroundColor: 'rgba(28, 28, 28, 0.05)',
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.pill,
  },
  ingredientTagText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.ink,
  },
  confirmBtn: {
    backgroundColor: Colors.ink,
    paddingVertical: scale(18),
    borderRadius: Radius.pill,
    alignItems: 'center',
  },
  confirmBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.body,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: Colors.bone,
  },
  // Camera permission prompt
  permissionContainer: {
    alignItems: 'center',
    paddingHorizontal: scale(32),
  },
  permissionTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.display,
    color: Colors.bone,
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
    backgroundColor: Colors.bone,
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
  // Meal analysis panel
  mealCountBadge: {
    alignItems: 'center',
    minWidth: scale(48),
  },
  mealCountNumber: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.display,
    color: Colors.ink,
    lineHeight: FontSizes.display * 1.1,
  },
  mealCountLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  mealFoodList: {
    maxHeight: verticalScale(180),
    marginBottom: scale(16),
  },
  mealFoodItem: {
    paddingVertical: scale(10),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderHairline,
  },
  mealFoodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: scale(5),
  },
  mealFoodName: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.body,
    color: Colors.ink,
    flex: 1,
  },
  mealFoodAmount: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkSecondary,
    marginLeft: scale(8),
  },
  mealConfidenceTrack: {
    height: 2,
    backgroundColor: 'rgba(28, 28, 28, 0.08)',
    borderRadius: 1,
  },
  mealConfidenceFill: {
    height: 2,
    backgroundColor: Colors.accentHill,
    borderRadius: 1,
  },
});
