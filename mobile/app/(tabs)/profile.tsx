import { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Palette, type ThemeTokens } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';

export default function ProfileScreen() {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const { user, logout } = useAuth();

  function handleLogout() {
    Alert.alert('Cerrar sesión', '¿Querés salir de tu cuenta?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir',
        style: 'destructive',
        onPress: () => {
          logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.full_name?.charAt(0)?.toUpperCase() ?? '?'}
          </Text>
        </View>
        <Text style={styles.name}>{user?.full_name ?? '—'}</Text>
        <Text style={styles.email}>{user?.email ?? '—'}</Text>
        {user?.company && <Text style={styles.company}>{user.company}</Text>}
      </View>

      {user?.trucks && user.trucks.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MIS CAMIONES</Text>
          {user.trucks.map((truck) => (
            <View key={truck.id} style={styles.truckCard}>
              <Text style={styles.truckName}>{truck.name}</Text>
              <View style={styles.truckSpecs}>
                <View style={styles.spec}>
                  <Text style={styles.specValue}>{truck.max_weight_kg.toLocaleString()}<Text style={styles.specUnit}> kg</Text></Text>
                  <Text style={styles.specKey}>PESO MÁX.</Text>
                </View>
                <View style={styles.spec}>
                  <Text style={styles.specValue}>{truck.max_height_m}<Text style={styles.specUnit}> m</Text></Text>
                  <Text style={styles.specKey}>ALTURA</Text>
                </View>
                <View style={styles.spec}>
                  <Text style={styles.specValue}>{truck.max_width_m}<Text style={styles.specUnit}> m</Text></Text>
                  <Text style={styles.specKey}>ANCHO</Text>
                </View>
                <View style={styles.spec}>
                  <Text style={styles.specValue}>{truck.max_length_m}<Text style={styles.specUnit}> m</Text></Text>
                  <Text style={styles.specKey}>LARGO</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>CUENTA</Text>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.85}>
          <Text style={styles.logoutText}>Cerrar sesión</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function makeStyles(tokens: ThemeTokens) { return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.surfaceAlt,
  },
  content: {
    padding: tokens.spaceXl,
    paddingTop: 60,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: tokens.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: tokens.spaceMd,
  },
  avatarText: {
    color: Palette.white,
    fontSize: 30,
    fontWeight: '800',
  },
  name: {
    fontSize: 22,
    fontWeight: '800',
    color: tokens.textPrimary,
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  email: {
    fontSize: 14,
    color: tokens.textSecond,
  },
  company: {
    fontSize: 13,
    color: tokens.textMuted,
    marginTop: 2,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: tokens.textSecond,
    letterSpacing: 1.4,
    marginBottom: tokens.spaceMd,
  },
  truckCard: {
    backgroundColor: tokens.surface,
    borderRadius: tokens.radiusMd,
    padding: tokens.spaceLg,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: tokens.border,
  },
  truckName: {
    fontSize: 16,
    fontWeight: '700',
    color: tokens.textPrimary,
    marginBottom: tokens.spaceMd,
  },
  truckSpecs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  spec: {
    alignItems: 'flex-start',
    flex: 1,
  },
  specValue: {
    fontSize: 15,
    fontWeight: '800',
    color: tokens.textPrimary,
    letterSpacing: -0.3,
  },
  specUnit: {
    fontSize: 11,
    fontWeight: '600',
    color: tokens.textSecond,
  },
  specKey: {
    fontSize: 9,
    color: tokens.textSecond,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginTop: 4,
  },
  logoutButton: {
    backgroundColor: tokens.dangerBg,
    borderRadius: tokens.radiusMd,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(198, 40, 40, 0.2)',
  },
  logoutText: {
    color: tokens.danger,
    fontSize: 15,
    fontWeight: '700',
  },
}); }
