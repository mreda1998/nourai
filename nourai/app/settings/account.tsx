import { useState } from 'react';
import { useRouter } from 'expo-router';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
import { useAuth } from '@/context/auth-context';

export default function AccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, isSignedIn, signOut } = useAuth();

  // Form state
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Name is required');
      return;
    }

    setIsSaving(true);

    try {
      // TODO: Call API to update user profile
      await new Promise(resolve => setTimeout(resolve, 1000));

      Alert.alert('Success', 'Your profile has been updated.');
    } catch (error) {
      Alert.alert('Error', 'Failed to update profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/auth');
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all associated data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Confirm Deletion',
              'Type "DELETE" to confirm account deletion.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    // TODO: Call API to delete account
                    await signOut();
                    router.replace('/auth');
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  if (!isSignedIn) {
    return (
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnIcon}>‹</Text>
          </Pressable>
          <Text style={styles.pageTitle}>Account</Text>
        </View>

        <View style={styles.signInPrompt}>
          <Text style={styles.signInTitle}>Sign In Required</Text>
          <Text style={styles.signInDescription}>
            Sign in to manage your account settings and sync your data across devices.
          </Text>
          <Pressable
            style={styles.signInBtn}
            onPress={() => router.push('/auth')}
          >
            <Text style={styles.signInBtnText}>Sign In</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnIcon}>‹</Text>
        </Pressable>
        <Text style={styles.pageTitle}>Account</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Profile Section */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Profile</Text>

            <View style={styles.formCard}>
              {/* Avatar */}
              <View style={styles.avatarSection}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {name ? name.charAt(0).toUpperCase() : 'U'}
                  </Text>
                </View>
                <Pressable style={styles.changeAvatarBtn}>
                  <Text style={styles.changeAvatarBtnText}>Change Photo</Text>
                </Pressable>
              </View>

              {/* Name Field */}
              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Full Name</Text>
                <TextInput
                  style={styles.textInput}
                  value={name}
                  onChangeText={setName}
                  placeholder="Enter your name"
                  placeholderTextColor={Colors.inkTertiary}
                  autoCapitalize="words"
                />
              </View>

              {/* Email Field (read-only) */}
              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Email</Text>
                <View style={styles.readOnlyField}>
                  <Text style={styles.readOnlyText}>{email}</Text>
                  <Text style={styles.readOnlyBadge}>Verified</Text>
                </View>
                <Text style={styles.fieldHint}>
                  Email cannot be changed. Contact support if needed.
                </Text>
              </View>
            </View>

            <Pressable
              style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={isSaving}
            >
              <Text style={styles.saveBtnText}>
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Text>
            </Pressable>
          </View>

          {/* Security Section */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Security</Text>

            <View style={styles.actionList}>
              <Pressable style={styles.actionItem}>
                <Text style={styles.actionIcon}>◉</Text>
                <View style={styles.actionInfo}>
                  <Text style={styles.actionName}>Change Password</Text>
                  <Text style={styles.actionDescription}>
                    Update your account password
                  </Text>
                </View>
                <Text style={styles.actionArrow}>›</Text>
              </Pressable>

              <View style={styles.actionDivider} />

              <Pressable style={styles.actionItem}>
                <Text style={styles.actionIcon}>◈</Text>
                <View style={styles.actionInfo}>
                  <Text style={styles.actionName}>Two-Factor Authentication</Text>
                  <Text style={styles.actionDescription}>
                    Add extra security to your account
                  </Text>
                </View>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusBadgeText}>Off</Text>
                </View>
              </Pressable>

              <View style={styles.actionDivider} />

              <Pressable style={styles.actionItem}>
                <Text style={styles.actionIcon}>○</Text>
                <View style={styles.actionInfo}>
                  <Text style={styles.actionName}>Connected Accounts</Text>
                  <Text style={styles.actionDescription}>
                    Manage linked Google, Apple accounts
                  </Text>
                </View>
                <Text style={styles.actionArrow}>›</Text>
              </Pressable>
            </View>
          </View>

          {/* Account Actions */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Account Actions</Text>

            <Pressable style={styles.signOutBtn} onPress={handleSignOut}>
              <Text style={styles.signOutBtnText}>Sign Out</Text>
            </Pressable>

            <Pressable style={styles.deleteBtn} onPress={handleDeleteAccount}>
              <Text style={styles.deleteBtnText}>Delete Account</Text>
            </Pressable>

            <Text style={styles.warningText}>
              Deleting your account will permanently remove all your data, including
              scan history, health profiles, and saved stacks.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  signInPrompt: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  signInTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.heading,
    color: Colors.ink,
    marginBottom: Spacing.sm,
  },
  signInDescription: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.bodyLarge,
    color: Colors.inkSecondary,
    textAlign: 'center',
    lineHeight: FontSizes.bodyLarge * 1.5,
    marginBottom: Spacing.xl,
    maxWidth: scale(280),
  },
  signInBtn: {
    backgroundColor: Colors.ink,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.pill,
  },
  signInBtnText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    fontWeight: '600',
    color: Colors.bone,
    textTransform: 'uppercase',
    letterSpacing: 1,
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
  formCard: {
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderHairline,
  },
  avatar: {
    width: scale(80),
    height: scale(80),
    borderRadius: scale(40),
    backgroundColor: Colors.ink,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  avatarText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.display,
    color: Colors.bone,
  },
  changeAvatarBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  changeAvatarBtnText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.ink,
    textDecorationLine: 'underline',
  },
  formField: {
    marginBottom: Spacing.lg,
  },
  fieldLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
    color: Colors.inkSecondary,
    marginBottom: Spacing.xs,
  },
  textInput: {
    backgroundColor: Colors.bone,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.subtitle,
    color: Colors.ink,
  },
  readOnlyField: {
    backgroundColor: Colors.boneDark,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  readOnlyText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.subtitle,
    color: Colors.inkSecondary,
  },
  readOnlyBadge: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    fontWeight: '600',
    color: Colors.accentHill,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldHint: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkTertiary,
    marginTop: Spacing.xs,
  },
  saveBtn: {
    backgroundColor: Colors.ink,
    paddingVertical: Spacing.md,
    borderRadius: Radius.pill,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveBtnText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    fontWeight: '600',
    color: Colors.bone,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  actionList: {
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.md,
  },
  actionDivider: {
    height: 1,
    backgroundColor: Colors.borderHairline,
    marginHorizontal: Spacing.md,
  },
  actionIcon: {
    fontSize: FontSizes.subtitle,
    color: Colors.inkSecondary,
    width: scale(24),
    textAlign: 'center',
  },
  actionInfo: {
    flex: 1,
  },
  actionName: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.subtitle,
    fontWeight: '500',
    color: Colors.ink,
    marginBottom: 2,
  },
  actionDescription: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkSecondary,
  },
  actionArrow: {
    fontSize: FontSizes.heading,
    color: Colors.inkTertiary,
  },
  statusBadge: {
    backgroundColor: Colors.boneDark,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  statusBadgeText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    fontWeight: '600',
    color: Colors.inkSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  signOutBtn: {
    borderWidth: 1,
    borderColor: Colors.ink,
    paddingVertical: Spacing.md,
    borderRadius: Radius.pill,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  signOutBtnText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    fontWeight: '600',
    color: Colors.ink,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  deleteBtn: {
    borderWidth: 1,
    borderColor: Colors.accentAlert,
    paddingVertical: Spacing.md,
    borderRadius: Radius.pill,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  deleteBtnText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    fontWeight: '600',
    color: Colors.accentAlert,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  warningText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkTertiary,
    textAlign: 'center',
    lineHeight: FontSizes.caption * 1.5,
  },
});
