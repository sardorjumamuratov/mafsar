import { View, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

export default function SetDetailScreen() {
  const { id } = useLocalSearchParams();
  return (
    <View style={{flex: 1}}>
      <Text>Set Detail: {id}</Text>
    </View>
  );
}
