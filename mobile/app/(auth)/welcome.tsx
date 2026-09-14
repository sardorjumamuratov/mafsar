import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { loginWithGoogle } from '../../src/auth';
import { useTheme } from '../../src/theme/useTheme';

export default function WelcomeScreen() {
  const router = useRouter();
  const theme = useTheme();

  const handleGoogle = async () => {
    try {
      await loginWithGoogle();
      router.replace('/(tabs)/today');
    } catch (e) {
      console.warn(e);
    }
  };

  const handleEmail = () => {
    router.push('/(auth)/sign-in');
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
      <Text style={[styles.logo, { color: theme.colors.primary }]}>Mafsar</Text>
      <Text style={[styles.title, { color: theme.colors.ink }]}>Review your cards anywhere.</Text>
      <Text style={[styles.subtitle, { color: theme.colors.muted }]}>
        Sets you make in the browser extension show up here.
      </Text>
      
      <View style={styles.buttons}>
        <TouchableOpacity style={[styles.btn, { backgroundColor: theme.colors.surface }]} onPress={handleGoogle}>
          <Text style={[styles.btnText, { color: theme.colors.ink }]}>Continue with Google</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, { backgroundColor: theme.colors.primary }]} onPress={handleEmail}>
          <Text style={[styles.btnText, { color: theme.colors.surface }]}>Sign in with email</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 32, justifyContent: 'center' },
  logo: { fontSize: 32, fontWeight: 'bold', marginBottom: 24 },
  title: { fontSize: 28, fontWeight: '600', marginBottom: 12 },
  subtitle: { fontSize: 17, lineHeight: 24, marginBottom: 48 },
  buttons: { gap: 16 },
  btn: { padding: 16, borderRadius: 12, alignItems: 'center' },
  btnText: { fontSize: 17, fontWeight: '600' }
});
