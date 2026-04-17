import { Redirect, useRouter, useFocusEffect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useCallback } from 'react';
import { Colors } from '@/constants/theme';

export default function SplashEntry() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#020617',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <ActivityIndicator size="small" color="#ffffff" />
    </View>
  );
}
