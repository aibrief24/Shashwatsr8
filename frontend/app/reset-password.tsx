import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, FontSize, Radius } from '@/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { Lock, ArrowLeft, CheckCircle } from 'lucide-react-native';
import { api } from '@/services/api';

export default function ResetPasswordScreen() {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    const router = useRouter();
    // Supabase hashes the access_token into the URL in the format:
    // aibrief24://reset-password#access_token=...&refresh_token=...&type=recovery
    // expo-router useLocalSearchParams automatically parses fragments and query params into properties.
    const { access_token } = useLocalSearchParams();

    const handleUpdate = async () => {
        if (!password.trim()) { setError('Please enter a new password'); return; }
        if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
        if (!access_token || typeof access_token !== 'string') {
            setError('Invalid or expired reset link. Please try requesting a new one.');
            return;
        }

        setError('');
        setLoading(true);
        try {
            await api.updatePassword(access_token, password);
            setSuccess(true);
        } catch (e: any) {
            setError(e.message || 'Failed to update password. Link may be expired.');
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <LinearGradient colors={[Colors.overlayEnd, Colors.card]} style={styles.flex}>
                <View style={styles.successContainer}>
                    <View style={styles.successIcon}>
                        <CheckCircle size={40} color={Colors.success} />
                    </View>
                    <Text style={styles.successTitle}>Password Updated</Text>
                    <Text style={styles.successDesc}>
                        Your password has been successfully reset. You can now sign in with your new password.
                    </Text>
                    <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/login')}>
                        <Text style={styles.backBtnText}>Go to Sign In</Text>
                    </TouchableOpacity>
                </View>
            </LinearGradient>
        );
    }

    return (
        <LinearGradient colors={[Colors.overlayEnd, Colors.card]} style={styles.flex}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
                <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                    <View style={styles.content}>
                        <TouchableOpacity testID="back-btn" style={styles.backRow} onPress={() => router.push('/login')}>
                            <ArrowLeft size={20} color={Colors.textSecondary} />
                            <Text style={styles.backText}>Cancel</Text>
                        </TouchableOpacity>

                        <View style={styles.header}>
                            <View style={styles.logoBadge}>
                                <LinearGradient colors={[Colors.primary, Colors.secondary]} style={StyleSheet.absoluteFillObject} />
                                <Text style={styles.logoText}>AI</Text>
                            </View>
                            <Text style={styles.title}>Create New Password</Text>
                            <Text style={styles.subtitle}>Enter a strong new password for your account.</Text>
                        </View>

                        {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}

                        <View style={styles.inputGroup}>
                            <View style={styles.inputRow}>
                                <Lock size={20} color={Colors.textTertiary} />
                                <TextInput
                                    testID="reset-password-input"
                                    style={styles.input}
                                    placeholder="New password (min 6 chars)"
                                    placeholderTextColor={Colors.textTertiary}
                                    value={password}
                                    onChangeText={setPassword}
                                    secureTextEntry
                                    autoCapitalize="none"
                                    autoFocus
                                />
                            </View>
                        </View>

                        <TouchableOpacity testID="save-password-btn" onPress={handleUpdate} disabled={loading} activeOpacity={0.8} style={styles.btnShadowWrap}>
                            <LinearGradient
                                colors={[Colors.primary, Colors.secondary]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={[styles.btn, loading && styles.btnDisabled]}
                            >
                                <Text style={styles.btnText}>{loading ? 'Updating...' : 'Update Password'}</Text>
                            </LinearGradient>
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
    backRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 32 },
    backText: { fontSize: 16, color: Colors.textSecondary, fontWeight: '500' },
    header: { alignItems: 'center', marginBottom: 40 },
    logoBadge: { width: 72, height: 72, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 24, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10, overflow: 'hidden' },
    logoText: { fontSize: 26, fontWeight: '900', color: '#fff', letterSpacing: 1 },
    title: { fontSize: 28, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.5, marginBottom: 8 },
    subtitle: { fontSize: 15, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
    errorBox: { backgroundColor: Colors.error + '20', borderRadius: Radius.md, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: Colors.error + '50' },
    errorText: { color: Colors.error, fontSize: FontSize.sm, textAlign: 'center', fontWeight: '500' },
    inputGroup: { marginBottom: 32 },
    inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 16, paddingHorizontal: 20, height: 60, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
    input: { flex: 1, color: Colors.textPrimary, fontSize: 16, marginLeft: 16 },
    btnShadowWrap: { shadowColor: Colors.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 15, elevation: 6 },
    btn: { height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center' },
    btnDisabled: { opacity: 0.7 },
    btnText: { fontSize: 17, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
    successContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
    successIcon: { width: 80, height: 80, borderRadius: 24, backgroundColor: Colors.success + '20', justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
    successTitle: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.textPrimary, marginBottom: 12, letterSpacing: -0.5 },
    successDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
    backBtn: { marginTop: 40, paddingVertical: 14, paddingHorizontal: 40, backgroundColor: Colors.surfaceHighlight, borderRadius: Radius.md, borderWidth: 0.5, borderColor: Colors.border },
    backBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textPrimary },
});
