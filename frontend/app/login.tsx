import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
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
  const { login } = useAuth();
  const router = useRouter();

  const handleLogin = async () => {
    if (!email.trim() || !password) { setError('Please fill all fields'); return; }
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      router.replace('/(tabs)');
    } catch (e: any) {
      setError(e.message || 'Login failed');
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
                <LinearGradient colors={[Colors.primary, Colors.secondary]} style={StyleSheet.absoluteFillObject} />
                <Text style={styles.logoText}>AI</Text>
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
                <View style={styles.inputWrapper}>
                  <TextInput testID="login-password-input" style={styles.input} placeholder="Password" placeholderTextColor={Colors.textTertiary} value={password} onChangeText={setPassword} secureTextEntry={!showPass} />
                </View>
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
  logoText: { fontSize: 26, fontWeight: '900', color: '#fff', letterSpacing: 1 },
  title: { fontSize: 28, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.5, marginBottom: 8 },
  subtitle: { fontSize: 15, color: Colors.textSecondary },
  errorBox: { backgroundColor: Colors.error + '20', borderRadius: Radius.md, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: Colors.error + '50' },
  errorText: { color: Colors.error, fontSize: FontSize.sm, textAlign: 'center', fontWeight: '500' },
  inputGroup: { marginBottom: 32, gap: 16 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 16, paddingHorizontal: 20, height: 60, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  inputWrapper: { flex: 1 },
  input: { color: Colors.textPrimary, fontSize: 16, marginLeft: 16 },
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
