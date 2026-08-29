import { StyleSheet, TouchableOpacity, View } from 'react-native';

import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Theme } from '@/theme/theme';
import type { MainTabParamList } from '@/types/navigation';
import { Icon, type IconName } from '@components/Icon';
import { Typography } from '@components/Typography';
import { useTheme, useThemedStyles } from '@hooks/useTheme';

const tabIcons: Record<keyof MainTabParamList, IconName> = {
  Timer: 'timer',
  Drills: 'list',
  Calibration: 'target',
  History: 'chart',
  Profile: 'user',
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: theme.colors.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
      paddingTop: theme.spacing.sm,
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing.xs,
      paddingTop: theme.spacing.xs,
    },
  });

/**
 * Bottom bar — every tab renders as an icon-and-label pair with equal
 * weight. The active tab picks up the primary tint; everything else sits
 * on `textTertiary` so the row reads as a set of siblings.
 */
export const TabBar = ({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) => {
  const styles = useThemedStyles(createStyles);
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.bar, { paddingBottom: insets.bottom + theme.spacing.sm }]}
    >
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const { options } = descriptors[route.key];
        const label = options.title ?? route.name;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <TouchableOpacity
            key={route.key}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            activeOpacity={0.7}
            style={styles.tab}
            testID={`tab-${route.name}`}
          >
            <Icon
              name={tabIcons[route.name as keyof MainTabParamList] ?? 'list'}
              size={23}
              color={focused ? 'primary' : 'textTertiary'}
            />
            <Typography
              variant="overline"
              color={focused ? 'primary' : 'textTertiary'}
            >
              {label.toUpperCase()}
            </Typography>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};
