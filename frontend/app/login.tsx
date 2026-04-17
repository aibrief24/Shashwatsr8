import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Image as RNImage } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Colors, FontSize, Spacing, Radius } from '@/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react-native';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleLogin = async () => {
    if (!email.trim() || !password) { setError('Please fill all fields'); return; }
    setError('');
    setLoading(true);
    try {
      console.log('[DEBUG-LOGIN-FLOW] Calling login()');
      await login(email, password);
      console.log('[DEBUG-CRASH] login successful, deferring to global navigation observer');
    } catch (e: any) {
      const msg = (e.message || '').toLowerCase();
      let safeMsg = 'Login failed. Please check your credentials.';
      if (msg.includes('invalid login credentials')) safeMsg = 'Invalid email or password.';
      else if (msg.includes('email not confirmed')) safeMsg = 'Please verify your email address before signing in.';
      else if (msg.includes('supabase') || msg.includes('internal') || msg.includes('fetch')) safeMsg = 'Server connection error. Please try again.';
      else if (e.message) safeMsg = e.message;

      setError(safeMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={[Colors.overlayEnd, Colors.card]} style={styles.flex}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View testID="login-screen" style={styles.content}>
            <View style={styles.header}>
              <View style={styles.logoBadge}>
                <RNImage source={require('@/assets/images/icon.png')} style={styles.logoImage} resizeMode="contain" />
              </View>
              <Text style={styles.title}>Welcome Back</Text>
              <Text style={styles.subtitle}>Sign in to your AIBrief24 account</Text>
            </View>

            {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}

            <View style={styles.inputGroup}>
              <View style={styles.inputRow}>
                <Mail size={20} color={Colors.textTertiary} />
                <TextInput testID="login-email-input" style={styles.input} placeholder="Email address" placeholderTextColor={Colors.textTertiary} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
              </View>
              <View style={styles.inputRow}>
                <Lock size={20} color={Colors.textTertiary} />
                <TextInput testID="login-password-input" style={styles.input} placeholder="Password" placeholderTextColor={Colors.textTertiary} value={password} onChangeText={setPassword} secureTextEntry={!showPass} />
                <TouchableOpacity style={styles.eyeIcon} onPress={() => setShowPass(!showPass)}>
                  {showPass ? <EyeOff size={20} color={Colors.textTertiary} /> : <Eye size={20} color={Colors.textTertiary} />}
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity testID="login-submit-btn" onPress={handleLogin} disabled={loading} activeOpacity={0.8} style={styles.btnShadowWrap}>
              <LinearGradient colors={[Colors.primary, Colors.secondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.btn, loading && styles.btnDisabled]}>
                <Text style={styles.btnText}>{loading ? 'Signing in...' : 'Sign In'}</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity testID="forgot-password-btn" style={styles.forgotRow} onPress={() => router.push('/forgot-password' as any)}>
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </TouchableOpacity>

            <TouchableOpacity testID="go-to-signup-btn" style={styles.switchRow} onPress={() => router.push('/signup')}>
              <Text style={styles.switchText}>Don't have an account? </Text>
              <Text style={styles.switchLink}>Sign Up</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center' },
  content: { paddingHorizontal: 32, paddingVertical: 40 },
  header: { alignItems: 'center', marginBottom: 40 },
  logoBadge: { width: 72, height: 72, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 24, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10, overflow: 'hidden' },
  logoImage: { width: '100%', height: '100%' },
  title: { fontSize: 28, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.5, marginBottom: 8 },
  subtitle: { fontSize: 15, color: Colors.textSecondary },
  errorBox: { backgroundColor: Colors.error + '20', borderRadius: Radius.md, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: Colors.error + '50' },
  errorText: { color: Colors.error, fontSize: FontSize.sm, textAlign: 'center', fontWeight: '500' },
  inputGroup: { marginBottom: 32, gap: 16 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 16, paddingHorizontal: 20, height: 60, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  input: { flex: 1, height: '100%', color: Colors.textPrimary, fontSize: 16, marginLeft: 16, paddingVertical: 0, marginVertical: 0, includeFontPadding: false, textAlignVertical: 'center' },
  eyeIcon: { padding: 8 },
  btnShadowWrap: { shadowColor: Colors.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 15, elevation: 6 },
  btn: { height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center' },
  btnDisabled: { opacity: 0.7 },
  btnText: { fontSize: 17, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
  switchRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 32 },
  switchText: { color: Colors.textSecondary, fontSize: 15 },
  switchLink: { color: Colors.primary, fontSize: 15, fontWeight: '700' },
  forgotRow: { alignItems: 'center', marginTop: 16 },
  forgotText: { color: Colors.primary, fontSize: 14, fontWeight: '700' },
});
