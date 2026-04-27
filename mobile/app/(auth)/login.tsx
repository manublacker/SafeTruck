import { useState, useCallback, useMemo } from 'react';
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
  Image,
} from 'react-native';
import { Link, router } from 'expo-router';
import { login as apiLogin } from '@/services/authApi';
import { useAuth } from '@/contexts/AuthContext';
import { Palette, type ThemeTokens } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';

export default function LoginScreen() {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
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
          <Image
            source={require('@/assets/images/safetruck-logo.png')}
            style={styles.logoImg}
            resizeMode="contain"
          />
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
            placeholderTextColor={tokens.textMuted}
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
            placeholderTextColor={tokens.textMuted}
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
              ? <ActivityIndicator color={tokens.textOnCta} />
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

function makeStyles(tokens: ThemeTokens) { return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.surface,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: tokens.spaceXl,
    paddingVertical: 48,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 8,
  },
  logoImg: {
    width: 64,
    height: 64,
    borderRadius: 14,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: tokens.letterEyebrow,
    color: tokens.textSecond,
    marginBottom: 2,
  },
  brandName: {
    fontSize: 28,
    fontWeight: '800',
    color: tokens.textPrimary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: tokens.fontSizeBody,
    color: tokens.textSecond,
    marginBottom: 32,
    lineHeight: 22,
  },
  form: {
    width: '100%',
  },
  label: {
    fontSize: tokens.fontSizeSmall,
    fontWeight: '700',
    color: tokens.textPrimary,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: tokens.border,
    borderRadius: tokens.radiusSm,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: tokens.fontSizeBody,
    color: tokens.textPrimary,
    backgroundColor: tokens.surface,
    marginBottom: tokens.spaceLg,
  },
  error: {
    color: tokens.danger,
    fontSize: tokens.fontSizeSmall,
    fontWeight: '600',
    marginBottom: tokens.spaceMd,
    backgroundColor: tokens.dangerBg,
    padding: 10,
    borderRadius: tokens.radiusSm,
  },
  cta: {
    backgroundColor: tokens.cta,
    borderRadius: tokens.ctaRadius,
    minHeight: tokens.ctaHeight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: tokens.spaceXs,
  },
  ctaDisabled: {
    backgroundColor: tokens.textMuted,
  },
  ctaText: {
    color: tokens.textOnCta,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  switchLink: {
    marginTop: tokens.spaceLg,
    alignItems: 'center',
  },
  switchText: {
    color: tokens.textSecond,
    fontSize: tokens.fontSizeSmall,
  },
  switchTextBold: {
    color: tokens.textPrimary,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
}); }
