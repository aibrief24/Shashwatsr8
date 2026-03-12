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
  const [loading, setLoading] = useState(false);
  const { signup } = useAuth();
  const router = useRouter();

  const handleSignup = async () => {
    if (!email.trim() || !password || !name.trim()) { setError('Please fill all fields'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setError('');
    setLoading(true);
    try {
      await signup(email, password, name);
      router.replace('/(tabs)');
    } catch (e: any) {
      setError(e.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={['#020617', '#0F172A']} style={styles.flex}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View testID="signup-screen" style={styles.content}>
            <View style={styles.header}>
              <View style={styles.logoBadge}><Text style={styles.logoText}>AI</Text></View>
              <Text style={styles.title}>Create Account</Text>
              <Text style={styles.subtitle}>Join AIBrief24 for daily AI news</Text>
            </View>

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
                <TouchableOpacity onPress={() => setShowPass(!showPass)}>
                  {showPass ? <EyeOff size={20} color={Colors.textTertiary} /> : <Eye size={20} color={Colors.textTertiary} />}
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity testID="signup-submit-btn" onPress={handleSignup} disabled={loading} activeOpacity={0.8}>
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
  content: { paddingHorizontal: 24, paddingVertical: 40 },
  header: { alignItems: 'center', marginBottom: 32 },
  logoBadge: { width: 64, height: 64, borderRadius: 20, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', marginBottom: 20, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 8 },
  logoText: { fontSize: 24, fontWeight: '900', color: '#fff' },
  title: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.5 },
  subtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 8 },
  errorBox: { backgroundColor: Colors.error + '20', borderRadius: Radius.sm, padding: 12, marginBottom: 16 },
  errorText: { color: Colors.error, fontSize: FontSize.sm, textAlign: 'center' },
  inputGroup: { marginBottom: 24, gap: 12 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.inputBg, borderRadius: Radius.md, paddingHorizontal: 16, height: 56, borderWidth: 0.5, borderColor: Colors.border },
  input: { flex: 1, color: Colors.textPrimary, fontSize: FontSize.base, marginLeft: 12 },
  btn: { height: 56, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center' },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontSize: FontSize.lg, fontWeight: '700', color: '#fff' },
  switchRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  switchText: { color: Colors.textSecondary, fontSize: FontSize.sm },
  switchLink: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: '600' },
});
