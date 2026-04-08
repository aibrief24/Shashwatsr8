import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Colors, FontSize, Radius } from '@/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { Mail, Lock, User, Eye, EyeOff } from 'lucide-react-native';

export default function SignupScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const { signup } = useAuth();
  const router = useRouter();

  const handleSignup = async () => {
    if (!email.trim() || !password || !name.trim()) { setError('Please fill all fields'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const res = await signup(email.trim().toLowerCase(), password, name.trim());
      if (res?.needsConfirmation) {
        setSuccess('Account created successfully.\n\nPlease check your email to verify your account before signing in. (Check your spam folder if it does not arrive within a few minutes)');
      } else {
        router.replace('/(tabs)');
      }
    } catch (e: any) {
      const msg = (e.message || '').toLowerCase();
      let safeMsg = 'Signup failed. Please try again.';
      if (msg.includes('already registered') || msg.includes('already exists')) safeMsg = 'An account with this email already exists. Please sign in instead.';
      else if (msg.includes('password')) safeMsg = 'Please use a stronger password.';
      else if (msg.includes('rate limit') || msg.includes('requests')) safeMsg = 'Too many attempts. Please try again in a few minutes.';
      else if (msg.includes('invalid email') || msg.includes('format')) safeMsg = 'Please provide a valid email format.';
      else if (msg.includes('supabase') || msg.includes('internal') || msg.includes('fetch') || msg.includes('database')) safeMsg = 'Servers are busy right now. Please try again in a moment.';
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
          <View testID="signup-screen" style={styles.content}>
            <View style={styles.header}>
              <View style={styles.logoBadge}>
                <LinearGradient colors={[Colors.primary, Colors.secondary]} style={StyleSheet.absoluteFillObject} />
                <Text style={styles.logoText}>AI</Text>
              </View>
              <Text style={styles.title}>Create Account</Text>
              <Text style={styles.subtitle}>Join AIBrief24 for daily AI news</Text>
            </View>

            {success ? <View style={styles.successBox}><Text style={styles.successText}>{success}</Text></View> : null}
            {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}

            <View style={styles.inputGroup}>
              <View style={styles.inputRow}>
                <User size={20} color={Colors.textTertiary} />
                <TextInput testID="signup-name-input" style={styles.input} placeholder="Full name" placeholderTextColor={Colors.textTertiary} value={name} onChangeText={setName} autoCapitalize="words" />
              </View>
              <View style={styles.inputRow}>
                <Mail size={20} color={Colors.textTertiary} />
                <TextInput testID="signup-email-input" style={styles.input} placeholder="Email address" placeholderTextColor={Colors.textTertiary} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
              </View>
              <View style={styles.inputRow}>
                <Lock size={20} color={Colors.textTertiary} />
                <TextInput testID="signup-password-input" style={styles.input} placeholder="Password (min 6 chars)" placeholderTextColor={Colors.textTertiary} value={password} onChangeText={setPassword} secureTextEntry={!showPass} />
                <TouchableOpacity style={styles.eyeIcon} onPress={() => setShowPass(!showPass)}>
                  {showPass ? <EyeOff size={20} color={Colors.textTertiary} /> : <Eye size={20} color={Colors.textTertiary} />}
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity testID="signup-submit-btn" onPress={handleSignup} disabled={loading} activeOpacity={0.8} style={styles.btnShadowWrap}>
              <LinearGradient colors={[Colors.primary, Colors.secondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.btn, loading && styles.btnDisabled]}>
                <Text style={styles.btnText}>{loading ? 'Creating account...' : 'Create Account'}</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity testID="go-to-login-btn" style={styles.switchRow} onPress={() => router.back()}>
              <Text style={styles.switchText}>Already have an account? </Text>
              <Text style={styles.switchLink}>Sign In</Text>
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
  successBox: { backgroundColor: Colors.success + '15', borderRadius: Radius.md, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: Colors.success + '30' },
  successText: { color: Colors.success, fontSize: FontSize.sm, textAlign: 'center', fontWeight: '600', lineHeight: 22 },
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
});
