import { View, type ViewStyle } from 'react-native';

import type { SemanticColors } from '@/theme/theme';
import { useTheme } from '@hooks/useTheme';

export type IconName =
  | 'timer'
  | 'list'
  | 'chart'
  | 'target'
  | 'user'
  | 'plus'
  | 'play'
  | 'chevron'
  | 'check'
  | 'pencil';

type IconProps = {
  name: IconName;
  /** Bounding box in px. Strokes scale from this. */
  size?: number;
  color?: keyof SemanticColors;
};

/**
 * Geometric icons drawn from plain Views.
 *
 * The project has no icon/SVG dependency, and adding one would mean native
 * linking — so each glyph is composed from bars, rings and rotated squares.
 * Every shape derives its stroke from `size`, so icons stay crisp at any
 * scale without a second set of assets.
 */
export const Icon = ({ name, size = 24, color = 'textPrimary' }: IconProps) => {
  const theme = useTheme();
  const tint = theme.colors[color];
  const stroke = Math.max(1.5, Math.round(size * 0.09));

  const bar = (style: ViewStyle) => ({
    position: 'absolute' as const,
    backgroundColor: tint,
    borderRadius: stroke,
    ...style,
  });

  const ring = (diameter: number, thickness: number): ViewStyle => ({
    position: 'absolute',
    width: diameter,
    height: diameter,
    borderRadius: diameter / 2,
    borderWidth: thickness,
    borderColor: tint,
  });

  const box: ViewStyle = {
    width: size,
    height: size,
    alignItems: 'center',
    justifyContent: 'center',
  };

  switch (name) {
    case 'timer':
      return (
        <View style={box}>
          {/* dial */}
          <View style={[ring(size * 0.76, stroke), { top: size * 0.19 }]} />
          {/* crown */}
          <View
            style={bar({
              top: 0,
              width: size * 0.34,
              height: stroke,
            })}
          />
          {/* hand, angled so it reads as "running" */}
          <View
            style={bar({
              top: size * 0.4,
              width: stroke,
              height: size * 0.22,
              transform: [{ rotate: '35deg' }],
            })}
          />
        </View>
      );

    case 'list':
      return (
        <View style={box}>
          {[0.22, 0.47, 0.72].map(top => (
            <View
              key={top}
              style={bar({
                top: size * top,
                left: size * 0.08,
                width: size * 0.84,
                height: stroke,
              })}
            />
          ))}
        </View>
      );

    case 'chart':
      return (
        <View style={box}>
          {[
            { left: 0.12, height: 0.34 },
            { left: 0.41, height: 0.62 },
            { left: 0.7, height: 0.46 },
          ].map(b => (
            <View
              key={b.left}
              style={bar({
                bottom: size * 0.12,
                left: size * b.left,
                width: size * 0.18,
                height: size * b.height,
              })}
            />
          ))}
        </View>
      );

    case 'target':
      return (
        <View style={box}>
          <View style={ring(size * 0.92, stroke)} />
          <View style={ring(size * 0.5, stroke)} />
          <View
            style={{
              position: 'absolute',
              width: stroke * 1.6,
              height: stroke * 1.6,
              borderRadius: stroke,
              backgroundColor: tint,
            }}
          />
        </View>
      );

    case 'user':
      return (
        <View style={box}>
          <View style={[ring(size * 0.42, stroke), { top: size * 0.08 }]} />
          <View
            style={{
              position: 'absolute',
              bottom: size * 0.08,
              width: size * 0.74,
              height: size * 0.38,
              borderTopLeftRadius: size * 0.37,
              borderTopRightRadius: size * 0.37,
              borderWidth: stroke,
              borderBottomWidth: 0,
              borderColor: tint,
            }}
          />
        </View>
      );

    case 'plus':
      return (
        <View style={box}>
          <View style={bar({ width: size * 0.72, height: stroke })} />
          <View style={bar({ width: stroke, height: size * 0.72 })} />
        </View>
      );

    case 'play':
      // Triangle via the classic transparent-border trick — no SVG needed.
      return (
        <View style={box}>
          <View
            style={{
              width: 0,
              height: 0,
              marginLeft: size * 0.12,
              borderTopWidth: size * 0.3,
              borderBottomWidth: size * 0.3,
              borderLeftWidth: size * 0.52,
              borderTopColor: 'transparent',
              borderBottomColor: 'transparent',
              borderLeftColor: tint,
            }}
          />
        </View>
      );

    case 'chevron':
      return (
        <View style={box}>
          <View
            style={{
              width: size * 0.42,
              height: size * 0.42,
              borderRightWidth: stroke,
              borderTopWidth: stroke,
              borderColor: tint,
              transform: [{ rotate: '45deg' }],
              marginLeft: -size * 0.12,
            }}
          />
        </View>
      );

    case 'check':
      return (
        <View style={box}>
          <View
            style={bar({
              left: size * 0.16,
              top: size * 0.5,
              width: size * 0.3,
              height: stroke,
              transform: [{ rotate: '45deg' }],
            })}
          />
          <View
            style={bar({
              left: size * 0.34,
              top: size * 0.44,
              width: size * 0.52,
              height: stroke,
              transform: [{ rotate: '-45deg' }],
            })}
          />
        </View>
      );

    case 'pencil':
      return (
        <View style={box}>
          <View
            style={bar({
              width: size * 0.68,
              height: stroke * 1.8,
              transform: [{ rotate: '-45deg' }],
            })}
          />
          <View
            style={bar({
              left: size * 0.14,
              top: size * 0.7,
              width: stroke * 2.4,
              height: stroke * 2.4,
              borderRadius: 1,
              transform: [{ rotate: '-45deg' }],
            })}
          />
        </View>
      );
  }
};
