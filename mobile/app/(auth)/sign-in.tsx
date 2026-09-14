import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { loginWithEmail } from '../../src/auth';
import { useTheme } from '../../src/theme/useTheme';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const router = useRouter();
  const theme = useTheme();

  const handleSignIn = async () => {
    try {
      await loginWithEmail(email, pass);
      router.replace('/(tabs)/today');
    } catch (e) {
      console.warn(e);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
      <Text style={[styles.title, { color: theme.colors.ink }]}>Sign in</Text>
      
      <TextInput 
        style={[styles.input, { backgroundColor: theme.colors.surface, color: theme.colors.ink, borderColor: theme.colors.border }]} 
        placeholder="Email" 
        placeholderTextColor={theme.colors.muted}
        value={email} 
        onChangeText={setEmail}
        autoCapitalize="none"
      />
      <TextInput 
        style={[styles.input, { backgroundColor: theme.colors.surface, color: theme.colors.ink, borderColor: theme.colors.border }]} 
        placeholder="Password" 
        placeholderTextColor={theme.colors.muted}
        value={pass} 
        onChangeText={setPass} 
        secureTextEntry 
      />
      
      <TouchableOpacity style={[styles.btn, { backgroundColor: theme.colors.primary }]} onPress={handleSignIn}>
        <Text style={[styles.btnText, { color: theme.colors.surface }]}>Sign in</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 32, justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 24 },
  input: { padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 16, fontSize: 17 },
  btn: { padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  btnText: { fontSize: 17, fontWeight: '600' }
});
