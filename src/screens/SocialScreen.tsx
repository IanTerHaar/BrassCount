import { Card } from '@components/Card';
import { EmptyState } from '@components/EmptyState';
import { Screen } from '@components/Screen';

export const SocialScreen = () => (
  <Screen
    title="Social"
    subtitle="Compare with your crew"
    testID="screen-social"
  >
    <Card>
      <EmptyState
        icon="user"
        title="Coming soon"
        message="Social features are on the way. Check back soon to share runs and challenge friends."
        testID="empty-social"
      />
    </Card>
  </Screen>
);
