import { useState } from 'react';
import { useRouter } from 'expo-router';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
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

interface NotificationSetting {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [notifications, setNotifications] = useState<NotificationSetting[]>([
    {
      id: 'product_recalls',
      name: 'Product Recalls',
      description: 'Get notified when products in your stack are recalled',
      enabled: true,
    },
    {
      id: 'ingredient_updates',
      name: 'Ingredient Updates',
      description: 'New research findings about ingredients you consume',
      enabled: true,
    },
    {
      id: 'stack_reminders',
      name: 'Stack Reminders',
      description: 'Daily reminders to log your supplement intake',
      enabled: false,
    },
    {
      id: 'health_tips',
      name: 'Health Tips',
      description: 'Personalized tips based on your health profile',
      enabled: true,
    },
    {
      id: 'new_features',
      name: 'New Features',
      description: 'Be the first to know about app updates',
      enabled: false,
    },
  ]);

  const [masterEnabled, setMasterEnabled] = useState(true);

  const toggleNotification = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, enabled: !n.enabled } : n))
    );
  };

  const toggleMaster = (value: boolean) => {
    setMasterEnabled(value);
    if (!value) {
      // Disable all when master is off
      setNotifications((prev) => prev.map((n) => ({ ...n, enabled: false })));
    }
  };

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnIcon}>‹</Text>
        </Pressable>
        <Text style={styles.pageTitle}>Notifications</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Master Toggle */}
        <View style={styles.masterCard}>
          <View style={styles.masterInfo}>
            <Text style={styles.masterName}>Push Notifications</Text>
            <Text style={styles.masterDescription}>
              Enable or disable all notifications
            </Text>
          </View>
          <Switch
            value={masterEnabled}
            onValueChange={toggleMaster}
            trackColor={{ false: Colors.boneDark, true: Colors.accentHill }}
            thumbColor={Colors.bone}
            ios_backgroundColor={Colors.boneDark}
          />
        </View>

        {/* Notification Types */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Notification Types</Text>

          <View style={styles.notificationList}>
            {notifications.map((notification, index) => (
              <View key={notification.id}>
                <View style={styles.notificationItem}>
                  <View style={styles.notificationInfo}>
                    <Text style={[
                      styles.notificationName,
                      !masterEnabled && styles.notificationNameDisabled,
                    ]}>
                      {notification.name}
                    </Text>
                    <Text style={[
                      styles.notificationDescription,
                      !masterEnabled && styles.notificationDescriptionDisabled,
                    ]}>
                      {notification.description}
                    </Text>
                  </View>
                  <Switch
                    value={notification.enabled && masterEnabled}
                    onValueChange={() => toggleNotification(notification.id)}
                    disabled={!masterEnabled}
                    trackColor={{ false: Colors.boneDark, true: Colors.accentHill }}
                    thumbColor={Colors.bone}
                    ios_backgroundColor={Colors.boneDark}
                  />
                </View>
                {index < notifications.length - 1 && (
                  <View style={styles.notificationDivider} />
                )}
              </View>
            ))}
          </View>
        </View>

        {/* Email Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Email Preferences</Text>

          <View style={styles.emailList}>
            <View style={styles.emailItem}>
              <View style={styles.emailInfo}>
                <Text style={styles.emailName}>Weekly Digest</Text>
                <Text style={styles.emailDescription}>
                  Summary of your weekly health insights
                </Text>
              </View>
              <Switch
                value={true}
                onValueChange={() => {}}
                trackColor={{ false: Colors.boneDark, true: Colors.accentHill }}
                thumbColor={Colors.bone}
                ios_backgroundColor={Colors.boneDark}
              />
            </View>

            <View style={styles.emailDivider} />

            <View style={styles.emailItem}>
              <View style={styles.emailInfo}>
                <Text style={styles.emailName}>Product Updates</Text>
                <Text style={styles.emailDescription}>
                  News about products and ingredients
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

            <View style={styles.emailDivider} />

            <View style={styles.emailItem}>
              <View style={styles.emailInfo}>
                <Text style={styles.emailName}>Marketing</Text>
                <Text style={styles.emailDescription}>
                  Special offers and promotions
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

        {/* Info Note */}
        <View style={styles.infoNote}>
          <Text style={styles.infoNoteText}>
            You can also manage notification permissions in your device settings.
            Some notifications may be required for critical safety alerts.
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
  masterCard: {
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  masterInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  masterName: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.title,
    color: Colors.ink,
    marginBottom: 4,
  },
  masterDescription: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
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
  notificationList: {
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.md,
  },
  notificationDivider: {
    height: 1,
    backgroundColor: Colors.borderHairline,
    marginHorizontal: Spacing.md,
  },
  notificationInfo: {
    flex: 1,
  },
  notificationName: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.subtitle,
    fontWeight: '500',
    color: Colors.ink,
    marginBottom: 2,
  },
  notificationNameDisabled: {
    color: Colors.inkTertiary,
  },
  notificationDescription: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkSecondary,
  },
  notificationDescriptionDisabled: {
    color: Colors.inkTertiary,
  },
  emailList: {
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
  },
  emailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.md,
  },
  emailDivider: {
    height: 1,
    backgroundColor: Colors.borderHairline,
    marginHorizontal: Spacing.md,
  },
  emailInfo: {
    flex: 1,
  },
  emailName: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.subtitle,
    fontWeight: '500',
    color: Colors.ink,
    marginBottom: 2,
  },
  emailDescription: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkSecondary,
  },
  infoNote: {
    padding: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.02)',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
  },
  infoNoteText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkTertiary,
    lineHeight: FontSizes.caption * 1.5,
    textAlign: 'center',
  },
});
