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

export default function ProfileScreen() {
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
          <Text style={styles.sectionTitle}>Mis camiones</Text>
          {user.trucks.map((truck) => (
            <View key={truck.id} style={styles.truckCard}>
              <Text style={styles.truckName}>{truck.name}</Text>
              <View style={styles.truckSpecs}>
                <View style={styles.spec}>
                  <Text style={styles.specValue}>{truck.max_weight_kg.toLocaleString()} kg</Text>
                  <Text style={styles.specKey}>peso máx.</Text>
                </View>
                <View style={styles.spec}>
                  <Text style={styles.specValue}>{truck.max_height_m} m</Text>
                  <Text style={styles.specKey}>altura</Text>
                </View>
                <View style={styles.spec}>
                  <Text style={styles.specValue}>{truck.max_width_m} m</Text>
                  <Text style={styles.specKey}>ancho</Text>
                </View>
                <View style={styles.spec}>
                  <Text style={styles.specValue}>{truck.max_length_m} m</Text>
                  <Text style={styles.specKey}>largo</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Cuenta</Text>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Cerrar sesión</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f4f8',
  },
  content: {
    padding: 24,
    paddingTop: 60,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1a73e8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '700',
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: '#6b7280',
  },
  company: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 2,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  truckCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  truckName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 10,
  },
  truckSpecs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  spec: {
    alignItems: 'center',
  },
  specValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a73e8',
  },
  specKey: {
    fontSize: 10,
    color: '#9ca3af',
    marginTop: 2,
  },
  logoutButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  logoutText: {
    color: '#dc2626',
    fontSize: 15,
    fontWeight: '600',
  },
});
