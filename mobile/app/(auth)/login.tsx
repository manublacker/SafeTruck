import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Link, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { login as apiLogin } from '@/services/authApi';
import { useAuth } from '@/contexts/AuthContext';
import { Theme, Palette } from '@/constants/theme';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = useCallback(async () => {
    if (!email || !password) {
      setError('Completá email y contraseña.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await apiLogin({ email, password });
      login(res.token, res.user);
      router.replace('/(tabs)');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión.');
    } finally {
      setLoading(false);
    }
  }, [email, password, login]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <View style={styles.logoSquare}>
            <Ionicons name="cube-outline" size={26} color={Palette.white} />
          </View>
          <View>
            <Text style={styles.eyebrow}>LOGÍSTICA AMBA</Text>
            <Text style={styles.brandName}>SafeTruck</Text>
          </View>
        </View>

        <Text style={styles.subtitle}>Rutas para flotas de camiones.</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="juan@empresa.com"
            placeholderTextColor={Theme.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />

          <Text style={styles.label}>Contraseña</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••"
            placeholderTextColor={Theme.textMuted}
            secureTextEntry
            autoComplete="current-password"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.cta, loading && styles.ctaDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color={Theme.textOnCta} />
              : <Text style={styles.ctaText}>Ingresar</Text>}
          </TouchableOpacity>

          <Link href="/(auth)/register" asChild>
            <TouchableOpacity style={styles.switchLink}>
              <Text style={styles.switchText}>
                ¿No tenés cuenta? <Text style={styles.switchTextBold}>Registrate</Text>
              </Text>
            </TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.surface,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Theme.spaceXl,
    paddingVertical: 48,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 8,
  },
  logoSquare: {
    width: 44,
    height: 44,
    borderRadius: Theme.radiusSm,
    backgroundColor: Theme.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: Theme.letterEyebrow,
    color: Theme.textSecond,
    marginBottom: 2,
  },
  brandName: {
    fontSize: 28,
    fontWeight: '800',
    color: Theme.textPrimary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: Theme.fontSizeBody,
    color: Theme.textSecond,
    marginBottom: 32,
    lineHeight: 22,
  },
  form: {
    width: '100%',
  },
  label: {
    fontSize: Theme.fontSizeSmall,
    fontWeight: '700',
    color: Theme.textPrimary,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: Theme.radiusSm,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: Theme.fontSizeBody,
    color: Theme.textPrimary,
    backgroundColor: Theme.surface,
    marginBottom: Theme.spaceLg,
  },
  error: {
    color: Theme.danger,
    fontSize: Theme.fontSizeSmall,
    fontWeight: '600',
    marginBottom: Theme.spaceMd,
    backgroundColor: Theme.dangerBg,
    padding: 10,
    borderRadius: Theme.radiusSm,
  },
  cta: {
    backgroundColor: Theme.cta,
    borderRadius: Theme.ctaRadius,
    minHeight: Theme.ctaHeight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Theme.spaceXs,
  },
  ctaDisabled: {
    backgroundColor: Theme.textMuted,
  },
  ctaText: {
    color: Theme.textOnCta,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  switchLink: {
    marginTop: Theme.spaceLg,
    alignItems: 'center',
  },
  switchText: {
    color: Theme.textSecond,
    fontSize: Theme.fontSizeSmall,
  },
  switchTextBold: {
    color: Theme.textPrimary,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
