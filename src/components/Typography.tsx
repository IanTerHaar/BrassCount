import type { SemanticColors, TypographyVariant } from '@constants/theme';
import {
  Text,
  type StyleProp,
  type TextProps,
  type TextStyle,
} from 'react-native';
import { useTheme } from '@hooks/useTheme';

type ColorKey = keyof SemanticColors;

type TypographyProps = Omit<TextProps, 'style'> & {
  variant?: TypographyVariant;
  color?: ColorKey;
  align?: TextStyle['textAlign'];
  style?: StyleProp<TextStyle>;
};

/**
 * The only component that should render raw text. Callers pick a semantic
 * variant + color role instead of choosing font sizes and hex codes.
 */
export const Typography = ({
  variant = 'body',
  color = 'textPrimary',
  align,
  style,
  children,
  ...rest
}: TypographyProps) => {
  const theme = useTheme();

  const composed: TextStyle = {
    ...theme.typography[variant],
    color: theme.colors[color],
    ...(align ? { textAlign: align } : null),
  };

  return (
    <Text {...rest} style={[composed, style]}>
      {children}
    </Text>
  );
};
