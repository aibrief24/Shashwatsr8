import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { ArrowLeft } from 'lucide-react-native';

export default function PrivacyPolicyScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                    <ArrowLeft size={24} color={Colors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Privacy Policy</Text>
            </View>
            <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.lastUpdated}>Last Updated: March 2026</Text>

                <Text style={styles.sectionTitle}>1. Information We Collect</Text>
                <Text style={styles.paragraph}>
                    We collect only the essential information needed to provide you with a personalized AI news experience. This includes a secure push notification token for alerts, and authentication-related account data if you choose to sign up.
                </Text>

                <Text style={styles.sectionTitle}>2. How We Use Information</Text>
                <Text style={styles.paragraph}>
                    Your information is strictly used to operate, maintain, and improve the AIBrief24 platform. We use it to deliver curated content, synchronize your preferences across devices, and send relevant updates. We do not sell your personal data to third parties.
                </Text>

                <Text style={styles.sectionTitle}>3. Account and Profile Data</Text>
                <Text style={styles.paragraph}>
                    If you create an account, we securely store your email address and basic profile data (such as your display name). This information is necessary for authentication and to keep your preferences linked to your account.
                </Text>

                <Text style={styles.sectionTitle}>4. Bookmarks and Preferences</Text>
                <Text style={styles.paragraph}>
                    To provide a seamless cross-device experience, articles you bookmark and any reading preferences you set are securely stored on our servers. This ensures you never lose track of important AI research or news.
                </Text>

                <Text style={styles.sectionTitle}>5. Push Notifications</Text>
                <Text style={styles.paragraph}>
                    If you opt-in to alerts, we store a secure push notification token associated with your device. This allows us to send breaking AI news directly to you. You may disable this at any time in the app settings or your device OS settings.
                </Text>

                <Text style={styles.sectionTitle}>6. Third-Party Services</Text>
                <Text style={styles.paragraph}>
                    AIBrief24 uses Supabase, a secure open-source platform, for our backend database and secure user authentication. Use of Supabase adheres to strict industry standard security guidelines.
                </Text>

                <Text style={styles.sectionTitle}>7. External Links and Content</Text>
                <Text style={styles.paragraph}>
                    Our app aggregates news and research from across the web. When you tap an article, it may open a third-party website or source. We are not responsible for the privacy practices, tracking, or content of those external sites.
                </Text>

                <Text style={styles.sectionTitle}>8. Data Retention & Deletion</Text>
                <Text style={styles.paragraph}>
                    We retain your data only for as long as your account is active or as needed to provide you the service. You may request full deletion of your account and all associated data at any time by contacting support.
                </Text>

                <Text style={styles.sectionTitle}>9. Contact Information</Text>
                <Text style={styles.paragraph}>
                    If you have any questions or concerns regarding this Privacy Policy or your data, please contact us at support@aibrief24.com.
                </Text>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    backBtn: {
        marginRight: 16,
        padding: 4,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: Colors.textPrimary,
    },
    content: {
        padding: 24,
        paddingBottom: 40,
    },
    lastUpdated: {
        fontSize: 13,
        color: Colors.textTertiary,
        marginBottom: 24,
        fontWeight: '500',
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: Colors.textPrimary,
        marginTop: 24,
        marginBottom: 12,
    },
    paragraph: {
        fontSize: 15,
        color: Colors.textSecondary,
        lineHeight: 24,
    },
});
