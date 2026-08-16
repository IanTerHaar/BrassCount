import type { RootStackParamList } from '@/types/navigation';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { Screen } from '@components/Screen';
import { Typography } from '@components/Typography';

export const DetailsScreen = () => {
  const route = useRoute<RouteProp<RootStackParamList, 'Details'>>();

  return (
    <Screen title="Details">
      <Typography>id: {route.params.id}</Typography>
    </Screen>
  );
};
