import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, Linking, ScrollView, Platform, Alert, Share, Modal } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { Colors, FontSize, Radius, Spacing, TELEGRAM_URL, WEBSITE_URL, STORE_URL } from '@/constants/theme';
import { Bell, Send, Globe, Share2, Shield, Info, LogOut, ChevronRight, ExternalLink, Sparkles, Trash2, X } from 'lucide-react-native';
import { requestAndRegisterPushToken } from '@/utils/notifications';
import CategoryPicker, { loadPreferredCategories } from '@/components/CategoryPicker';

export default function SettingsScreen() {
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [interests, setInterests] = useState<string[]>([]);
  const [showInterests, setShowInterests] = useState(false);
  const { user, token, logout } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Reload on focus so the row's count stays in sync with onboarding edits.
  useFocusEffect(
    useCallback(() => {
      loadPreferredCategories().then(setInterests);
    }, [])
  );

  const handleInterestsSaved = (selected: string[]) => {
    setInterests(selected);
    setShowInterests(false);
    Alert.alert('Interests Updated', 'Your feed will prioritise these topics.');
  };

  const handleLogout = () => {
    logout();
    router.replace('/(tabs)');
  };

  const handleToggleNotifications = async (val: boolean) => {
    console.log('[SETTINGS-PUSH] toggle pressed', val);
    setNotifEnabled(val);

    if (val) {
      if (!token) return;
      setIsRegistering(true);
      console.log('[SETTINGS-PUSH] register start');
      try {
        const success = await requestAndRegisterPushToken(token, '[SETTINGS-PUSH]');
        console.log(`[SETTINGS-PUSH] register ${success ? 'success' : 'failure'}`);

        if (success) {
          Alert.alert('Success', 'Notifications enabled');
        } else {
          Alert.alert('Error', 'Failed to enable notifications');
          setNotifEnabled(false);
        }
      } catch (e) {
        console.log('[SETTINGS-PUSH] register error', e);
        Alert.alert('Error', 'Failed to enable notifications');
        setNotifEnabled(false);
      } finally {
        setIsRegistering(false);
      }
    } else {
      console.log('[SETTINGS-PUSH] notifications disabled locally');
    }
  };

  const handleShareApp = async () => {
    try {
      await Share.share({
        message: `Get AIBrief24 — AI news in seconds:\n${STORE_URL}`,
      });
    } catch (e) {
      console.log('[SHARE-APP] error', e);
    }
  };

  const SettingRow = ({ icon: Icon, label, value, onPress, color = Colors.textPrimary, rightElement, labelColor }: any) => (
    <TouchableOpacity testID={`setting-${label.toLowerCase().replace(/\s/g, '-')}`} style={styles.row} onPress={onPress} activeOpacity={onPress ? 0.7 : 1} disabled={!onPress}>
      <View style={styles.rowLeft}>
        <View style={[styles.rowIcon, { backgroundColor: (color || Colors.primary) + '15' }]}>
          <Icon size={18} color={color || Colors.primary} strokeWidth={1.5} />
        </View>
        <Text style={[styles.rowLabel, labelColor ? { color: labelColor } : null]}>{label}</Text>
      </View>
      {rightElement || (value ? <Text style={styles.rowValue}>{value}</Text> : <ChevronRight size={18} color={Colors.textTertiary} />)}
    </TouchableOpacity>
  );

  return (
    <>
    <ScrollView testID="settings-screen" style={[styles.container, { paddingTop: insets.top }]} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.pageTitle}>Settings</Text>

      {/* User info */}
      {user && (
        <View style={styles.userCard}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{(user.name || user.email)[0].toUpperCase()}</Text></View>
          <View>
            <Text style={styles.userName}>{user.name}</Text>
            <Text style={styles.userEmail}>{user.email}</Text>
          </View>
        </View>
      )}

      {/* Notifications */}
      <Text style={styles.sectionTitle}>Notifications</Text>
      <View style={styles.section}>
        <SettingRow
          icon={Bell}
          label="Push Notifications"
          color={Colors.primary}
          rightElement={<Switch disabled={isRegistering} value={notifEnabled} onValueChange={handleToggleNotifications} trackColor={{ false: Colors.surfaceHighlight, true: Colors.primary + '60' }} thumbColor={notifEnabled ? Colors.primary : Colors.textTertiary} />}
        />
      </View>

      {/* Personalization */}
      <Text style={styles.sectionTitle}>Personalization</Text>
      <View style={styles.section}>
        <SettingRow
          icon={Sparkles}
          label="Edit Interests"
          color={Colors.secondary}
          value={interests.length > 0 ? `${interests.length} topics` : 'Not set'}
          onPress={() => setShowInterests(true)}
        />
      </View>

      {/* Connect */}
      <Text style={styles.sectionTitle}>Connect</Text>
      <View style={styles.section}>
        <SettingRow icon={Send} label="Join Telegram" color={Colors.primary} onPress={() => Linking.openURL(TELEGRAM_URL)} />
        <View style={styles.divider} />
        <SettingRow icon={Globe} label="Visit Website" color={Colors.secondary} onPress={() => Linking.openURL(WEBSITE_URL)} />
        <View style={styles.divider} />
        <SettingRow icon={Share2} label="Share App" color={Colors.success} onPress={handleShareApp} />
      </View>

      {/* About */}
      <Text style={styles.sectionTitle}>About</Text>
      <View style={styles.section}>
        <SettingRow icon={Info} label="App Version" value="1.0.0" color={Colors.textTertiary} />
        <View style={styles.divider} />
        <SettingRow icon={Shield} label="Privacy Policy" color={Colors.textTertiary} onPress={() => router.push('/privacy' as any)} />
      </View>

      {/* Account — deletion entry point (App Store guideline 5.1.1(v)) */}
      {token && (
        <>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.section}>
            <SettingRow
              icon={Trash2}
              label="Delete Account"
              color={Colors.error}
              labelColor={Colors.error}
              onPress={() => router.push('/delete-account' as any)}
            />
          </View>
        </>
      )}

      {/* Logout */}
      <TouchableOpacity testID="logout-btn" style={styles.logoutBtn} onPress={token ? handleLogout : () => router.push('/login')} activeOpacity={0.8}>
        <LogOut size={18} color={Colors.accent} />
        <Text style={styles.logoutText}>{token ? 'Sign Out' : 'Sign In'}</Text>
      </TouchableOpacity>

      {/* CTA */}
      <View style={styles.ctaBox}>
        <Text style={styles.ctaTitle}>Want more AI updates?</Text>
        <Text style={styles.ctaDesc}>Join our Telegram channel and visit our website for the latest AI news.</Text>
        <View style={styles.ctaBtns}>
          <TouchableOpacity testID="settings-telegram-btn" style={[styles.ctaBtn, { backgroundColor: Colors.primary + '20' }]} onPress={() => Linking.openURL(TELEGRAM_URL)}>
            <Send size={16} color={Colors.primary} />
            <Text style={[styles.ctaBtnText, { color: Colors.primary }]}>Telegram</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="settings-website-btn" style={[styles.ctaBtn, { backgroundColor: Colors.secondary + '20' }]} onPress={() => Linking.openURL(WEBSITE_URL)}>
            <Globe size={16} color={Colors.secondary} />
            <Text style={[styles.ctaBtnText, { color: Colors.secondary }]}>Website</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.footer}>AIBrief24 — AI News in 60 Seconds</Text>
    </ScrollView>

    <Modal
      visible={showInterests}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => setShowInterests(false)}
    >
      <View style={[styles.modalRoot, { paddingTop: insets.top }]}>
        <View style={styles.modalHeader}>
          <TouchableOpacity
            testID="close-interests-btn"
            style={styles.modalCloseBtn}
            onPress={() => setShowInterests(false)}
          >
            <X size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Your Interests</Text>
        </View>
        <CategoryPicker
          initialSelected={interests}
          title="What do you care about?"
          subtitle="Pick at least 3 topics. These are prioritised at the top of your feed."
          confirmLabel="Save Interests"
          onConfirm={handleInterestsSaved}
        />
      </View>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { paddingBottom: 120 },
  pageTitle: { fontSize: 32, fontWeight: '800', color: Colors.textPrimary, paddingHorizontal: 20, marginTop: 24, letterSpacing: -1, marginBottom: 24 },
  userCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, padding: 20, backgroundColor: 'rgba(11,18,33,0.8)', borderRadius: 20, gap: 16, marginBottom: 32, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  avatar: { width: 56, height: 56, borderRadius: 18, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 4 },
  avatarText: { fontSize: 24, fontWeight: '800', color: '#fff' },
  userName: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.3 },
  userEmail: { fontSize: 13, color: Colors.textSecondary, marginTop: 4, fontWeight: '500' },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: Colors.textTertiary, paddingHorizontal: 20, marginBottom: 12, letterSpacing: 1.5, textTransform: 'uppercase' },
  section: { marginHorizontal: 20, backgroundColor: 'rgba(11,18,33,0.8)', borderRadius: 20, marginBottom: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  rowIcon: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  rowLabel: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  rowValue: { fontSize: 14, color: Colors.textTertiary, fontWeight: '600' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.03)', marginLeft: 68 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginHorizontal: 20, paddingVertical: 16, backgroundColor: Colors.accent + '15', borderRadius: Radius.full, marginBottom: 32, borderWidth: 1, borderColor: Colors.accent + '30' },
  logoutText: { fontSize: 15, fontWeight: '800', color: Colors.accent, letterSpacing: 0.5 },
  ctaBox: { marginHorizontal: 20, padding: 24, backgroundColor: 'rgba(11,18,33,0.8)', borderRadius: 20, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', marginBottom: 24 },
  ctaTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, marginBottom: 8, letterSpacing: -0.5 },
  ctaDesc: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  ctaBtns: { flexDirection: 'row', gap: 12, width: '100%' },
  ctaBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12 },
  ctaBtnText: { fontSize: 14, fontWeight: '700', letterSpacing: 0.5 },
  footer: { textAlign: 'center', fontSize: 12, color: Colors.textTertiary, marginTop: 16, fontWeight: '600', letterSpacing: 0.5 },
  modalRoot: { flex: 1, backgroundColor: Colors.background },
  modalHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  modalCloseBtn: { marginRight: 16, padding: 4 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
});
