/**
 * CategoryPicker.tsx
 *
 * Shared interest picker used by BOTH the onboarding flow and Settings →
 * "Edit Interests", so the two can never drift apart.
 *
 * Categories are fetched from GET /api/categories (the canonical server-side
 * list) and fall back to FALLBACK_CATEGORIES if the request fails — the picker
 * must never be empty, since onboarding cannot be completed without it.
 *
 * The component persists the selection to AsyncStorage itself before calling
 * onConfirm, so every caller writes the same key in the same format.
 */
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import {
    Brain,
    Building2,
    Check,
    Cpu,
    DollarSign,
    FlaskConical,
    GitBranch,
    Package,
    Rocket,
    Zap,
} from 'lucide-react-native';
import { api } from '@/services/api';
import { Colors, FontSize } from '@/constants/theme';

/** AsyncStorage key holding a JSON array of category names. */
export const PREFERRED_CATEGORIES_KEY = 'preferred_categories';

/** Minimum number of interests the user must pick before continuing. */
export const MIN_CATEGORY_SELECTION = 3;

/** The 9 canonical categories, mirroring CATEGORIES in backend/server.py. */
export const FALLBACK_CATEGORIES = [
    'Latest',
    'AI Tools',
    'AI Startups',
    'AI Models',
    'AI Research',
    'Funding News',
    'Product Launches',
    'Big Tech AI',
    'Open Source AI',
];

const CATEGORY_ICONS: Record<string, any> = {
    'Latest': Zap,
    'AI Tools': Cpu,
    'AI Startups': Rocket,
    'AI Models': Brain,
    'AI Research': FlaskConical,
    'Funding News': DollarSign,
    'Product Launches': Package,
    'Big Tech AI': Building2,
    'Open Source AI': GitBranch,
};

const CATEGORY_COLORS = [
    Colors.primary, Colors.secondary, Colors.accent, Colors.success,
    '#F59E0B', '#EC4899', '#06B6D4', '#84CC16', '#8B5CF6',
];

/** Read the saved interests. Returns [] when unset or corrupt. */
export async function loadPreferredCategories(): Promise<string[]> {
    try {
        const raw = await AsyncStorage.getItem(PREFERRED_CATEGORIES_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((c): c is string => typeof c === 'string');
    } catch (e) {
        console.log('[INTERESTS] load failed', e);
        return [];
    }
}

/** Persist the interests. Never throws — personalization is best-effort. */
export async function savePreferredCategories(categories: string[]): Promise<void> {
    try {
        await AsyncStorage.setItem(PREFERRED_CATEGORIES_KEY, JSON.stringify(categories));
        console.log(`[INTERESTS] saved ${categories.length} categories`);
    } catch (e) {
        console.log('[INTERESTS] save failed', e);
    }
}

interface CategoryPickerProps {
    /** Pre-checked categories (e.g. the current saved selection in Settings). */
    initialSelected?: string[];
    title?: string;
    subtitle?: string;
    confirmLabel?: string;
    /** Called after the selection has been persisted. */
    onConfirm: (selected: string[]) => void;
}

export default function CategoryPicker({
    initialSelected = [],
    title = 'What do you care about?',
    subtitle = 'Pick at least 3 topics and we’ll surface them first in your feed.',
    confirmLabel = 'Continue',
    onConfirm,
}: CategoryPickerProps) {
    const [names, setNames] = useState<string[]>(FALLBACK_CATEGORIES);
    const [selected, setSelected] = useState<string[]>(initialSelected);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const loadCategories = async () => {
            try {
                const res = await api.getCategories();
                const fetched: string[] = (res?.categories || [])
                    .map((c: any) => c?.name)
                    .filter((n: any): n is string => typeof n === 'string' && n.length > 0);
                if (!cancelled && fetched.length > 0) setNames(fetched);
            } catch (e) {
                console.log('[INTERESTS] category fetch failed, using fallback list', e);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        loadCategories();
        return () => { cancelled = true; };
    }, []);

    const toggle = useCallback((name: string) => {
        setSelected(prev =>
            prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
        );
    }, []);

    const handleConfirm = useCallback(async () => {
        if (selected.length < MIN_CATEGORY_SELECTION || saving) return;
        setSaving(true);
        await savePreferredCategories(selected);
        setSaving(false);
        onConfirm(selected);
    }, [selected, saving, onConfirm]);

    const remaining = MIN_CATEGORY_SELECTION - selected.length;
    const canConfirm = remaining <= 0;

    return (
        <View style={styles.container}>
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.subtitle}>{subtitle}</Text>

                {loading ? (
                    <View style={styles.loading}>
                        <ActivityIndicator size="large" color={Colors.primary} />
                    </View>
                ) : (
                    <View style={styles.grid}>
                        {names.map((name, i) => {
                            const Icon = CATEGORY_ICONS[name] || Zap;
                            const color = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
                            const isSelected = selected.includes(name);
                            return (
                                <TouchableOpacity
                                    testID={`interest-${name}`}
                                    key={name}
                                    style={[styles.tile, isSelected && styles.tileSelected]}
                                    onPress={() => toggle(name)}
                                    activeOpacity={0.8}
                                >
                                    {isSelected && (
                                        <View style={styles.checkBadge}>
                                            <Check size={12} color="#fff" strokeWidth={3} />
                                        </View>
                                    )}
                                    <View style={[styles.tileIcon, { backgroundColor: color + '20' }]}>
                                        <Icon size={22} color={color} strokeWidth={1.5} />
                                    </View>
                                    <Text style={styles.tileName} numberOfLines={2}>{name}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                )}
            </ScrollView>

            <View style={styles.footer}>
                <Text style={styles.counter}>
                    {canConfirm
                        ? `${selected.length} selected`
                        : `Select ${remaining} more to continue`}
                </Text>
                <TouchableOpacity
                    testID="interests-confirm-btn"
                    onPress={handleConfirm}
                    disabled={!canConfirm || saving}
                    activeOpacity={0.8}
                    style={styles.btnShadowWrap}
                >
                    <LinearGradient
                        colors={[Colors.primary, Colors.secondary]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[styles.btn, (!canConfirm || saving) && styles.btnDisabled]}
                    >
                        {saving ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <Text style={styles.btnText}>{confirmLabel}</Text>
                        )}
                    </LinearGradient>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    scrollContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
    title: {
        fontSize: 28,
        fontWeight: '800',
        color: Colors.textPrimary,
        letterSpacing: -0.5,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 15,
        color: Colors.textSecondary,
        lineHeight: 22,
        marginBottom: 28,
    },
    loading: { paddingVertical: 60, alignItems: 'center' },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        gap: 12,
    },
    tile: {
        width: '48%',
        backgroundColor: Colors.surface,
        borderRadius: 20,
        padding: 16,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    tileSelected: {
        borderColor: Colors.primary,
        backgroundColor: Colors.primary + '12',
    },
    checkBadge: {
        position: 'absolute',
        top: 10,
        right: 10,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: Colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 2,
    },
    tileIcon: {
        width: 48,
        height: 48,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 14,
    },
    tileName: {
        fontSize: 15,
        fontWeight: '700',
        color: Colors.textPrimary,
        letterSpacing: -0.3,
    },
    footer: {
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 24,
        borderTopWidth: 1,
        borderTopColor: Colors.border,
        backgroundColor: Colors.background,
    },
    counter: {
        fontSize: FontSize.xs,
        color: Colors.textTertiary,
        fontWeight: '600',
        textAlign: 'center',
        marginBottom: 12,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
    },
    btnShadowWrap: {
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 15,
        elevation: 6,
    },
    btn: {
        height: 56,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
    },
    btnDisabled: { opacity: 0.4 },
    btnText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
        letterSpacing: 0.5,
    },
});
