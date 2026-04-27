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
import { register as apiRegister } from '@/services/authApi';
import { useAuth } from '@/contexts/AuthContext';
import { Palette, type ThemeTokens } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';

export default function RegisterScreen() {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const { login } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [company, setCompany] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = useCallback(async () => {
    const name = fullName.trim();
    const mail = email.trim();
    if (!name || !mail || !password) {
      setError('Completá nombre, email y contraseña.');
      return;
    }
    if (!/^[\p{L}][\p{L}\s'-]{1,}$/u.test(name)) {
      setError('El nombre solo puede tener letras, espacios, apóstrofes o guiones.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) {
      setError('Ingresá un email válido (ej: nombre@empresa.com).');
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await apiRegister({
        email,
        password,
        full_name: fullName,
        company: company || undefined,
      });
      login(res.token, res.user);
      router.replace('/(tabs)');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrarse.');
    } finally {
      setLoading(false);
    }
  }, [fullName, email, password, company, login]);

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

        <Text style={styles.subtitle}>Creá tu cuenta para empezar a planificar rutas.</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Nombre completo</Text>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Juan Pérez"
            placeholderTextColor={tokens.textMuted}
            autoComplete="name"
          />

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
            placeholder="Mínimo 6 caracteres"
            placeholderTextColor={tokens.textMuted}
            secureTextEntry
            autoComplete="new-password"
          />

          <Text style={styles.label}>
            Empresa <Text style={styles.optional}>(opcional)</Text>
          </Text>
          <TextInput
            style={styles.input}
            value={company}
            onChangeText={setCompany}
            placeholder="Transportes SA"
            placeholderTextColor={tokens.textMuted}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.cta, loading && styles.ctaDisabled]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color={tokens.textOnCta} />
              : <Text style={styles.ctaText}>Crear cuenta</Text>}
          </TouchableOpacity>

          <Link href="/(auth)/login" asChild>
            <TouchableOpacity style={styles.switchLink}>
              <Text style={styles.switchText}>
                ¿Ya tenés cuenta? <Text style={styles.switchTextBold}>Iniciá sesión</Text>
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
    marginBottom: 28,
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
  optional: {
    fontWeight: '400',
    color: tokens.textMuted,
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
