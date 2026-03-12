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
    <TouchableOpacity testID={`setting-${label.toLowerCase().replace(/\s/g, '-')}`} style={styles.row} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
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
        <SettingRow icon={Shield} label="Privacy Policy" color={Colors.textTertiary} onPress={() => Linking.openURL(WEBSITE_URL + 'privacy')} />
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
  pageTitle: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.textPrimary, paddingHorizontal: 16, marginTop: 16, letterSpacing: -0.5, marginBottom: 16 },
  userCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, padding: 16, backgroundColor: Colors.surface, borderRadius: Radius.md, gap: 14, marginBottom: 24, borderWidth: 0.5, borderColor: Colors.border },
  avatar: { width: 48, height: 48, borderRadius: 14, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 20, fontWeight: '800', color: '#fff' },
  userName: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textPrimary },
  userEmail: { fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 2 },
  sectionTitle: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textTertiary, paddingHorizontal: 16, marginBottom: 8, letterSpacing: 1, textTransform: 'uppercase' },
  section: { marginHorizontal: 16, backgroundColor: Colors.surface, borderRadius: Radius.md, marginBottom: 20, borderWidth: 0.5, borderColor: Colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 14 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowIcon: { width: 34, height: 34, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  rowLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary },
  rowValue: { fontSize: FontSize.sm, color: Colors.textTertiary },
  divider: { height: 0.5, backgroundColor: Colors.border, marginLeft: 60 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 16, paddingVertical: 14, backgroundColor: Colors.accent + '15', borderRadius: Radius.md, marginBottom: 24 },
  logoutText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.accent },
  ctaBox: { marginHorizontal: 16, padding: 20, backgroundColor: Colors.surface, borderRadius: Radius.md, alignItems: 'center', borderWidth: 0.5, borderColor: Colors.border, marginBottom: 20 },
  ctaTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
  ctaDesc: { fontSize: FontSize.xs, color: Colors.textSecondary, textAlign: 'center', lineHeight: 18, marginBottom: 14 },
  ctaBtns: { flexDirection: 'row', gap: 10 },
  ctaBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.sm },
  ctaBtnText: { fontSize: FontSize.sm, fontWeight: '600' },
  footer: { textAlign: 'center', fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 8 },
});
