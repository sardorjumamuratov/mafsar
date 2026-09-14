import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { signOut } from '../../src/auth';
import { useTheme } from '../../src/theme/useTheme';

export default function YouScreen() {
  const theme = useTheme();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.replace('/(auth)/welcome');
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
      <Text style={{ color: theme.colors.ink, fontSize: 22, margin: 16 }}>You</Text>
      
      <TouchableOpacity onPress={handleSignOut} style={[styles.btn, { backgroundColor: theme.colors.surface }]}>
        <Text style={{ color: theme.colors.danger, fontSize: 17 }}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  btn: { padding: 16, marginHorizontal: 16, borderRadius: 12, alignItems: 'center', marginTop: 32 }
});
