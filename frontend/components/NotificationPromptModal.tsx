import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import { Bell, X } from 'lucide-react-native';
import { Colors, Radius, FontSize } from '@/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { requestAndRegisterPushToken } from '@/utils/notifications';
import { useAuth } from '@/contexts/AuthContext';

interface NotificationPromptModalProps {
    visible: boolean;
    onComplete: () => void;
}

export default function NotificationPromptModal({ visible, onComplete }: NotificationPromptModalProps) {
    const [loading, setLoading] = useState(false);
    const { token } = useAuth();

    const handleAllow = async () => {
        setLoading(true);
        console.log('[PUSH-PROMPT] User tapped "Turn on"');
        try {
            if (token) {
                await requestAndRegisterPushToken(token);
            } else {
                console.warn('[PUSH-PROMPT] No auth token found.');
            }
        } catch (e) {
            console.log('[PUSH-PROMPT] Error during registration flow:', e);
        } finally {
            setLoading(false);
            onComplete();
        }
    };

    const handleLater = () => {
        console.log('[PUSH-PROMPT] User tapped "Maybe later"');
        onComplete();
    };

    return (
        <Modal
            transparent
            visible={visible}
            animationType="fade"
            onRequestClose={handleLater}
        >
            <BlurView intensity={20} tint="dark" style={styles.overlay}>
                <View style={styles.modalContainer}>
                    <TouchableOpacity
                        style={styles.closeBtn}
                        onPress={handleLater}
                        disabled={loading}
                        hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                    >
                        <X size={24} color={Colors.textSecondary} />
                    </TouchableOpacity>

                    <View style={styles.iconContainer}>
                        <LinearGradient
                            colors={[Colors.primary, Colors.secondary]}
                            style={StyleSheet.absoluteFillObject}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                        />
                        <Bell size={32} color="#fff" />
                    </View>

                    <Text style={styles.title}>Stay updated with AI news</Text>
                    <Text style={styles.subtitle}>
                        Turn on notifications to get major AI launches, funding updates, and breaking AI news.
                    </Text>

                    <View style={styles.actions}>
                        <TouchableOpacity
                            style={styles.primaryBtnWrapper}
                            onPress={handleAllow}
                            disabled={loading}
                            activeOpacity={0.8}
                        >
                            <LinearGradient
                                colors={[Colors.primary, Colors.secondary]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={[styles.primaryBtn, loading && styles.btnDisabled]}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <Text style={styles.primaryBtnText}>Turn on</Text>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.secondaryBtn}
                            onPress={handleLater}
                            disabled={loading}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.secondaryBtnText}>Maybe later</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </BlurView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.6)',
        padding: 24,
    },
    modalContainer: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: Colors.card,
        borderRadius: Radius.lg,
        padding: 24,
        paddingTop: 32,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 20,
        position: 'relative',
    },
    closeBtn: {
        position: 'absolute',
        top: 16,
        right: 16,
        zIndex: 10,
    },
    iconContainer: {
        width: 72,
        height: 72,
        borderRadius: 36,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
        overflow: 'hidden',
    },
    title: {
        fontSize: 22,
        fontWeight: '800',
        color: Colors.textPrimary,
        marginBottom: 12,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: FontSize.base,
        color: Colors.textSecondary,
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 32,
        paddingHorizontal: 8,
    },
    actions: {
        width: '100%',
        gap: 12,
    },
    primaryBtnWrapper: {
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 4,
    },
    primaryBtn: {
        height: 56,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
    },
    btnDisabled: {
        opacity: 0.7,
    },
    primaryBtnText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
    },
    secondaryBtn: {
        height: 56,
        justifyContent: 'center',
        alignItems: 'center',
    },
    secondaryBtnText: {
        fontSize: 15,
        color: Colors.textSecondary,
        fontWeight: '600',
    },
});
