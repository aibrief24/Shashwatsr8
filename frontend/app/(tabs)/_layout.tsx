import { Tabs } from 'expo-router';
import { View, StyleSheet, Platform } from 'react-native';
import { useEffect } from 'react';
import { Colors } from '@/constants/theme';
import { Home, LayoutGrid, Bookmark, Settings } from 'lucide-react-native';

export default function TabsLayout() {
  console.log('[DEBUG-CRASH] tabs layout render');
  useEffect(() => {
    console.log('[DEBUG-CRASH] tabs layout mount');
    console.log('[DEBUG-CRASH] tab screen registration');
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textTertiary,
        tabBarShowLabel: true,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
        // @ts-ignore: safeAreaInsets is passed to React Navigation
        safeAreaInsets: { bottom: 0 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Feed',
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} strokeWidth={1.5} />,
        }}
      />
      <Tabs.Screen
        name="categories"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color, size }) => <LayoutGrid size={size} color={color} strokeWidth={1.5} />,
        }}
      />
      <Tabs.Screen
        name="bookmarks"
        options={{
          title: 'Saved',
          tabBarIcon: ({ color, size }) => <Bookmark size={size} color={color} strokeWidth={1.5} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Settings size={size} color={color} strokeWidth={1.5} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 32 : 16,
    left: 20,
    right: 20,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(11, 18, 33, 0.95)',
    borderTopWidth: 0,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingBottom: 0,
    elevation: 10,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
  },
  tabItem: {
    paddingTop: 8,
    paddingBottom: 8,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
    letterSpacing: 0.5,
  },
});
