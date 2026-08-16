import type { Theme } from '@constants/theme';
import type { MainTabParamList } from '@/types/navigation';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@components/Icon';
import { Typography } from '@components/Typography';
import { useTheme, useThemedStyles } from '@hooks/useTheme';

const tabIcons: Record<keyof MainTabParamList, IconName> = {
  Social: 'user',
  Sequences: 'list',
  Timer: 'timer',
  History: 'chart',
  Guns: 'target',
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
    // Reserves the gap the raised button sits in.
    centerSlot: {
      width: 84,
      alignItems: 'center',
    },
    centerButton: {
      position: 'absolute',
      top: -26,
      width: 62,
      height: 62,
      borderRadius: 31,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primary,
      borderWidth: 3,
      borderColor: theme.colors.background,
    },
  });

/**
 * Bottom bar with a raised centre action, matching the wireframe.
 *
 * `Timer` is a tab route so navigating to it keeps the bottom bar mounted,
 * but we hide it from the tab strip — the raised centre button is its
 * entry point and fires the same `tabPress` event a normal tab would.
 */
export const TabBar = ({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) => {
  const styles = useThemedStyles(createStyles);
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const visibleRoutes = state.routes.filter(route => route.name !== 'Timer');
  const timerRoute = state.routes.find(route => route.name === 'Timer');
  const timerFocused =
    !!timerRoute && state.routes[state.index]?.key === timerRoute.key;
  const half = Math.ceil(visibleRoutes.length / 2);

  const renderTab = (route: BottomTabBarProps['state']['routes'][number]) => {
    const index = state.routes.findIndex(item => item.key === route.key);
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
  };

  const onCenterPress = () => {
    if (!timerRoute) {
      return;
    }

    const event = navigation.emit({
      type: 'tabPress',
      target: timerRoute.key,
      canPreventDefault: true,
    });

    if (!timerFocused && !event.defaultPrevented) {
      navigation.navigate(timerRoute.name);
    }
  };

  return (
    <View
      style={[styles.bar, { paddingBottom: insets.bottom + theme.spacing.sm }]}
    >
      {visibleRoutes.slice(0, half).map(renderTab)}

      <View style={styles.centerSlot}>
        <TouchableOpacity
          onPress={onCenterPress}
          accessibilityRole="button"
          accessibilityState={{ selected: timerFocused }}
          accessibilityLabel="Go to shot timer"
          activeOpacity={0.85}
          style={[styles.centerButton, theme.elevation.raised]}
          testID="tab-center-start"
        >
          <Icon name="timer" size={34} color="textOnPrimary" />
        </TouchableOpacity>
      </View>

      {visibleRoutes.slice(half).map(renderTab)}
    </View>
  );
};
