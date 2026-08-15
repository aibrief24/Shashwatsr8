import { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { Colors, FontSize, Radius } from '@/constants/theme';
import { ArrowLeft, Bell, Bookmark, Mail, Trash2, TriangleAlert, User } from 'lucide-react-native';

/**
 * Permanent account deletion — App Store guideline 5.1.1(v).
 *
 * '/delete-account' is already whitelisted in GlobalAuthObserver's PUBLIC_ROUTES,
 * so the observer never redirects away from this screen. That also means it will
 * NOT move the user once the token is cleared, hence the explicit
 * router.replace('/(tabs)') on success — the same pattern settings.tsx uses
 * after sign-out.
 */

const DELETED_ITEMS = [
    { icon: User, label: 'Your account', desc: 'Sign-in is removed permanently. You can create a new account later, but nothing is restored.' },
    { icon: Mail, label: 'Your email address', desc: 'Removed from our authentication provider and our records.' },
    { icon: Bookmark, label: 'Saved articles', desc: 'Every article you bookmarked is deleted and cannot be recovered.' },
    { icon: Bell, label: 'Notification registration', desc: 'Your device is unregistered and will stop receiving push notifications.' },
];

export default function DeleteAccountScreen() {
    const [loading, setLoading] = useState(false);
    const { token, user, deleteAccount } = useAuth();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const performDelete = async () => {
        setLoading(true);
        try {
            await deleteAccount();
            console.log('[DELETE-ACCOUNT] deletion succeeded');
            Alert.alert(
                'Account Deleted',
                'Your account and all associated data have been permanently deleted.',
                [{ text: 'OK', onPress: () => router.replace('/(tabs)') }]
            );
        } catch (e: any) {
            console.log('[DELETE-ACCOUNT] deletion failed', e);
            const msg = e?.message?.includes('SESSION_EXPIRED')
                ? 'Your session expired. Please sign in again and retry.'
                : e?.message || 'Something went wrong. Please try again.';
            Alert.alert(
                'Could Not Delete Account',
                msg,
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Retry', onPress: () => confirmDelete() },
                ]
            );
        } finally {
            setLoading(false);
        }
    };

    const confirmDelete = () => {
        Alert.alert(
            'Delete Account?',
            'This permanently deletes your account, saved articles, and notification settings. This cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: performDelete },
            ]
        );
    };

    const renderHeader = () => (
        <View style={styles.header}>
            <TouchableOpacity testID="delete-account-back-btn" style={styles.backBtn} onPress={() => router.back()}>
                <ArrowLeft size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Delete Account</Text>
        </View>
    );

    if (!token) {
        return (
            <View testID="delete-account-screen" style={[styles.container, { paddingTop: insets.top }]}>
                {renderHeader()}
                <View style={styles.signedOut}>
                    <View style={styles.signedOutIcon}>
                        <User size={32} color={Colors.textTertiary} strokeWidth={1.5} />
                    </View>
                    <Text style={styles.signedOutTitle}>You’re not signed in</Text>
                    <Text style={styles.signedOutDesc}>
                        Sign in to the account you want to delete, then come back to this screen.
                    </Text>
                    <TouchableOpacity
                        testID="delete-account-signin-btn"
                        style={styles.signInBtn}
                        onPress={() => router.push('/login')}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.signInBtnText}>Go to Sign In</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    return (
        <View testID="delete-account-screen" style={[styles.container, { paddingTop: insets.top }]}>
            {renderHeader()}

            <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.warningBox}>
                    <TriangleAlert size={20} color={Colors.error} />
                    <Text style={styles.warningText}>
                        This is permanent. Deleted data cannot be recovered by you or by our support team.
                    </Text>
                </View>

                {!!user?.email && (
                    <Text style={styles.accountLine}>
                        Signed in as <Text style={styles.accountEmail}>{user.email}</Text>
                    </Text>
                )}

                <Text style={styles.sectionTitle}>What gets deleted</Text>

                {DELETED_ITEMS.map(item => {
                    const Icon = item.icon;
                    return (
                        <View key={item.label} style={styles.itemRow}>
                            <View style={styles.itemIcon}>
                                <Icon size={18} color={Colors.error} strokeWidth={1.5} />
                            </View>
                            <View style={styles.itemBody}>
                                <Text style={styles.itemLabel}>{item.label}</Text>
                                <Text style={styles.itemDesc}>{item.desc}</Text>
                            </View>
                        </View>
                    );
                })}

                <Text style={styles.note}>
                    You’ll be asked to confirm once more before anything is deleted.
                </Text>

                <TouchableOpacity
                    testID="delete-account-btn"
                    style={[styles.deleteBtn, loading && styles.deleteBtnDisabled]}
                    onPress={confirmDelete}
                    disabled={loading}
                    activeOpacity={0.8}
                >
                    {loading ? (
                        <ActivityIndicator size="small" color={Colors.error} />
                    ) : (
                        <>
                            <Trash2 size={18} color={Colors.error} />
                            <Text style={styles.deleteBtnText}>Delete My Account</Text>
                        </>
                    )}
                </TouchableOpacity>

                <TouchableOpacity
                    testID="delete-account-cancel-btn"
                    style={styles.cancelBtn}
                    onPress={() => router.back()}
                    disabled={loading}
                    activeOpacity={0.7}
                >
                    <Text style={styles.cancelBtnText}>Keep My Account</Text>
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    backBtn: { marginRight: 16, padding: 4 },
    headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
    content: { padding: 24, paddingBottom: 48 },
    warningBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        backgroundColor: Colors.error + '15',
        borderRadius: Radius.md,
        borderWidth: 1,
        borderColor: Colors.error + '40',
        padding: 16,
        marginBottom: 24,
    },
    warningText: {
        flex: 1,
        color: Colors.error,
        fontSize: FontSize.sm,
        fontWeight: '600',
        lineHeight: 20,
    },
    accountLine: {
        fontSize: FontSize.sm,
        color: Colors.textSecondary,
        marginBottom: 28,
    },
    accountEmail: { color: Colors.textPrimary, fontWeight: '700' },
    sectionTitle: {
        fontSize: 12,
        fontWeight: '800',
        color: Colors.textTertiary,
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        marginBottom: 16,
    },
    itemRow: { flexDirection: 'row', gap: 14, marginBottom: 20 },
    itemIcon: {
        width: 38,
        height: 38,
        borderRadius: 12,
        backgroundColor: Colors.error + '15',
        justifyContent: 'center',
        alignItems: 'center',
    },
    itemBody: { flex: 1 },
    itemLabel: {
        fontSize: 15,
        fontWeight: '700',
        color: Colors.textPrimary,
        marginBottom: 4,
    },
    itemDesc: {
        fontSize: 13,
        color: Colors.textSecondary,
        lineHeight: 20,
    },
    note: {
        fontSize: 13,
        color: Colors.textTertiary,
        lineHeight: 20,
        marginTop: 8,
        marginBottom: 28,
    },
    deleteBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        height: 56,
        borderRadius: Radius.full,
        backgroundColor: Colors.error + '15',
        borderWidth: 1,
        borderColor: Colors.error + '50',
        marginBottom: 16,
    },
    deleteBtnDisabled: { opacity: 0.6 },
    deleteBtnText: {
        fontSize: 16,
        fontWeight: '800',
        color: Colors.error,
        letterSpacing: 0.5,
    },
    cancelBtn: { height: 52, justifyContent: 'center', alignItems: 'center' },
    cancelBtnText: {
        fontSize: FontSize.sm,
        fontWeight: '700',
        color: Colors.textSecondary,
    },
    signedOut: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 40,
        paddingBottom: 60,
    },
    signedOutIcon: {
        width: 72,
        height: 72,
        borderRadius: 24,
        backgroundColor: Colors.surfaceHighlight,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
    signedOutTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: Colors.textPrimary,
        marginBottom: 12,
        letterSpacing: -0.5,
    },
    signedOutDesc: {
        fontSize: FontSize.sm,
        color: Colors.textSecondary,
        textAlign: 'center',
        lineHeight: 22,
    },
    signInBtn: {
        marginTop: 32,
        paddingVertical: 14,
        paddingHorizontal: 40,
        backgroundColor: Colors.surfaceHighlight,
        borderRadius: Radius.md,
        borderWidth: 0.5,
        borderColor: Colors.border,
    },
    signInBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textPrimary },
});
