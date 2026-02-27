import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera } from 'expo-camera';

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

type PermissionStatus = 'granted' | 'denied' | 'undetermined';

export default function PermissionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [cameraPermission, setCameraPermission] = useState<PermissionStatus>('undetermined');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkPermissions();
  }, []);

  const checkPermissions = async () => {
    try {
      const { status } = await Camera.getCameraPermissionsAsync();
      setCameraPermission(status as PermissionStatus);
    } catch (error) {
      console.error('Error checking permissions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const requestCameraPermission = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    setCameraPermission(status as PermissionStatus);

    if (status === 'denied') {
      Alert.alert(
        'Camera Permission Required',
        'Elory needs camera access to scan product labels. Please enable camera access in your device settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
    }
  };

  const getStatusColor = (status: PermissionStatus) => {
    switch (status) {
      case 'granted':
        return Colors.accentHill;
      case 'denied':
        return Colors.accentAlert;
      default:
        return Colors.inkTertiary;
    }
  };

  const getStatusText = (status: PermissionStatus) => {
    switch (status) {
      case 'granted':
        return 'Enabled';
      case 'denied':
        return 'Denied';
      default:
        return 'Not Set';
    }
  };

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnIcon}>‹</Text>
        </Pressable>
        <Text style={styles.pageTitle}>Permissions</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Text style={styles.infoIcon}>◉</Text>
          <Text style={styles.infoText}>
            Elory uses your camera to scan product labels and barcodes. No images are stored on our servers.
          </Text>
        </View>

        {/* Permissions List */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>App Permissions</Text>

          {/* Camera Permission */}
          <View style={styles.permissionCard}>
            <View style={styles.permissionHeader}>
              <View style={styles.permissionInfo}>
                <Text style={styles.permissionName}>Camera Access</Text>
                <Text style={styles.permissionDescription}>
                  Required for scanning product labels and barcodes
                </Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(cameraPermission) + '20' }]}>
                <Text style={[styles.statusText, { color: getStatusColor(cameraPermission) }]}>
                  {getStatusText(cameraPermission)}
                </Text>
              </View>
            </View>

            {cameraPermission !== 'granted' && (
              <Pressable
                style={styles.enableBtn}
                onPress={requestCameraPermission}
              >
                <Text style={styles.enableBtnText}>
                  {cameraPermission === 'denied' ? 'Open Settings' : 'Enable Camera'}
                </Text>
              </Pressable>
            )}

            {cameraPermission === 'granted' && (
              <View style={styles.enabledIndicator}>
                <Text style={styles.enabledIcon}>✓</Text>
                <Text style={styles.enabledText}>Camera is ready for scanning</Text>
              </View>
            )}
          </View>
        </View>

        {/* Optional Permissions */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Optional Permissions</Text>

          <View style={styles.optionalList}>
            <View style={styles.optionalItem}>
              <View style={styles.optionalInfo}>
                <Text style={styles.optionalName}>Push Notifications</Text>
                <Text style={styles.optionalDescription}>
                  Get alerts about product recalls and health updates
                </Text>
              </View>
              <Switch
                value={false}
                onValueChange={() => {}}
                trackColor={{ false: Colors.boneDark, true: Colors.accentHill }}
                thumbColor={Colors.bone}
                ios_backgroundColor={Colors.boneDark}
              />
            </View>

            <View style={styles.optionalDivider} />

            <View style={styles.optionalItem}>
              <View style={styles.optionalInfo}>
                <Text style={styles.optionalName}>Photo Library</Text>
                <Text style={styles.optionalDescription}>
                  Import product images from your photos
                </Text>
              </View>
              <Switch
                value={false}
                onValueChange={() => {}}
                trackColor={{ false: Colors.boneDark, true: Colors.accentHill }}
                thumbColor={Colors.bone}
                ios_backgroundColor={Colors.boneDark}
              />
            </View>

            <View style={styles.optionalDivider} />

            <View style={styles.optionalItem}>
              <View style={styles.optionalInfo}>
                <Text style={styles.optionalName}>Location</Text>
                <Text style={styles.optionalDescription}>
                  Find nearby stores with recommended products
                </Text>
              </View>
              <Switch
                value={false}
                onValueChange={() => {}}
                trackColor={{ false: Colors.boneDark, true: Colors.accentHill }}
                thumbColor={Colors.bone}
                ios_backgroundColor={Colors.boneDark}
              />
            </View>
          </View>
        </View>

        {/* Privacy Note */}
        <View style={styles.privacyNote}>
          <Text style={styles.privacyTitle}>Your Privacy Matters</Text>
          <Text style={styles.privacyText}>
            All data is processed locally on your device. Camera images are not uploaded or stored. You can revoke permissions at any time in your device settings.
          </Text>
        </View>
      </ScrollView>
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
    paddingBottom: verticalScale(40),
  },
  infoBanner: {
    backgroundColor: 'rgba(92, 110, 92, 0.1)',
    borderRadius: Radius.md,
    padding: Spacing.md,
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  infoIcon: {
    fontSize: FontSizes.subtitle,
    color: Colors.accentMoss,
  },
  infoText: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.accentMoss,
    lineHeight: FontSizes.body * 1.5,
  },
  section: {
    marginBottom: Spacing.xl,
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
  permissionCard: {
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
    padding: Spacing.lg,
  },
  permissionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  permissionInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  permissionName: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.title,
    color: Colors.ink,
    marginBottom: 4,
  },
  permissionDescription: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
    lineHeight: FontSizes.body * 1.4,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  statusText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  enableBtn: {
    backgroundColor: Colors.ink,
    paddingVertical: Spacing.md,
    borderRadius: Radius.pill,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  enableBtnText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    fontWeight: '600',
    color: Colors.bone,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  enabledIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  enabledIcon: {
    fontSize: FontSizes.subtitle,
    color: Colors.accentHill,
  },
  enabledText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.accentHill,
  },
  optionalList: {
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
  },
  optionalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.md,
  },
  optionalDivider: {
    height: 1,
    backgroundColor: Colors.borderHairline,
    marginHorizontal: Spacing.md,
  },
  optionalInfo: {
    flex: 1,
  },
  optionalName: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.subtitle,
    fontWeight: '500',
    color: Colors.ink,
    marginBottom: 2,
  },
  optionalDescription: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkSecondary,
  },
  privacyNote: {
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  privacyTitle: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontWeight: '600',
    color: Colors.inkSecondary,
    marginBottom: Spacing.sm,
  },
  privacyText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
    lineHeight: FontSizes.body * 1.5,
  },
});
