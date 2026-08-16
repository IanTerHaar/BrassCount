import type { Theme } from '@constants/theme';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/types/navigation';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Button } from '@components/Button';
import { Card } from '@components/Card';
import { EmptyState } from '@components/EmptyState';
import { Icon } from '@components/Icon';
import { ListRow } from '@components/ListRow';
import { Screen } from '@components/Screen';
import { SectionHeader } from '@components/SectionHeader';
import { Typography } from '@components/Typography';
import {
  previewSequences,
  sequenceActionLabel,
  type SequenceSummary,
} from '@constants/previewData';
import { useThemedStyles } from '@hooks/useTheme';
import { pluralize } from '@utils/format';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    createCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
    },
    createIcon: {
      width: 44,
      height: 44,
      borderRadius: theme.radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primarySoft,
    },
    createText: { flex: 1, gap: 2 },
  });

export const SequencesScreen = () => {
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<Nav>();

  /** First few actions, so the row previews the shape of the string. */
  const summarize = (steps: SequenceSummary['steps']) => {
    const shown = steps.slice(0, 3).map(sequenceActionLabel).join(' → ');
    return steps.length > 3 ? `${shown} → …` : shown;
  };

  return (
    <Screen
      title="Sequences"
      subtitle="Chain actions into a single run"
      scrollable
      testID="screen-sequences"
    >
      <Card
        onPress={() => navigation.navigate('SequenceEditor', {})}
        style={styles.createCard}
        testID="btn-create-sequence"
      >
        <View style={styles.createIcon}>
          <Icon name="plus" size={22} color="primary" />
        </View>
        <View style={styles.createText}>
          <Typography variant="bodyStrong">Create sequence</Typography>
          <Typography variant="caption" color="textTertiary">
            Pick drills and set their order
          </Typography>
        </View>
        <Icon name="chevron" size={16} color="textTertiary" />
      </Card>

      <View>
        <SectionHeader title={`Saved · ${previewSequences.length}`} />

        {previewSequences.length === 0 ? (
          <Card>
            <EmptyState
              icon="list"
              title="No sequences yet"
              message="Build your first sequence to run several drills back to back."
              actionLabel="Create sequence"
              onActionPress={() => navigation.navigate('SequenceEditor', {})}
            />
          </Card>
        ) : (
          <Card flush>
            {previewSequences.map((sequence, i) => (
              <ListRow
                key={sequence.id}
                title={sequence.name}
                subtitle={`${pluralize(
                  sequence.steps.length,
                  'step',
                )} · ${summarize(sequence.steps)}`}
                onPress={() =>
                  navigation.navigate('SequenceEditor', { id: sequence.id })
                }
                divided={i < previewSequences.length - 1}
                testID={`row-sequence-${sequence.id}`}
              />
            ))}
          </Card>
        )}
      </View>

      <Button
        label="Create sequence"
        onPress={() => navigation.navigate('SequenceEditor', {})}
      />
    </Screen>
  );
};
