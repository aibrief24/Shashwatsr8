import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, Linking, ScrollView, Platform, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { Colors, FontSize, Radius, Spacing, TELEGRAM_URL, WEBSITE_URL } from '@/constants/theme';
import { Bell, Send, Globe, Share2, Shield, Info, LogOut, ChevronRight, ExternalLink } from 'lucide-react-native';

export default function SettingsScreen() {
  const [notifEnabled, setNotifEnabled] = useState(true);
  const { user, logout } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  const handleShareApp = () => {
    if (Platform.OS === 'web') {
      Linking.openURL(WEBSITE_URL);
    }
  };

  const SettingRow = ({ icon: Icon, label, value, onPress, color = Colors.textPrimary, rightElement }: any) => (
    <TouchableOpacity testID={`setting-${label.toLowerCase().replace(/\s/g, '-')}`} style={styles.row} onPress={onPress} activeOpacity={onPress ? 0.7 : 1} disabled={!onPress}>
      <View style={styles.rowLeft}>
        <View style={[styles.rowIcon, { backgroundColor: (color || Colors.primary) + '15' }]}>
          <Icon size={18} color={color || Colors.primary} strokeWidth={1.5} />
        </View>
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      {rightElement || (value ? <Text style={styles.rowValue}>{value}</Text> : <ChevronRight size={18} color={Colors.textTertiary} />)}
    </TouchableOpacity>
  );

  return (
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
          rightElement={<Switch value={notifEnabled} onValueChange={setNotifEnabled} trackColor={{ false: Colors.surfaceHighlight, true: Colors.primary + '60' }} thumbColor={notifEnabled ? Colors.primary : Colors.textTertiary} />}
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

      {/* Logout */}
      <TouchableOpacity testID="logout-btn" style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
        <LogOut size={18} color={Colors.accent} />
        <Text style={styles.logoutText}>Sign Out</Text>
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
});
