import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Colors, Fonts } from '@/constants/theme';

interface Props {
  score: number;
  label?: string;
  qualifier?: string;
  size?: number;
  dark?: boolean;
}

export function ScoreRing({ score, label, qualifier, size = 140, dark }: Props) {
  const strokeWidth = Math.max(5, size * 0.055);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const dashOffset = circumference * (1 - pct);

  const trackColor = dark ? 'rgba(241,237,228,0.14)' : Colors.borderHairline;
  const fillColor = dark ? Colors.sand : Colors.accent;
  const textColor = dark ? Colors.darkInk : Colors.ink;
  const mutedColor = dark ? 'rgba(241,237,228,0.55)' : Colors.inkSecondary;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={fillColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
        />
      </Svg>
      <Text style={{ fontFamily: Fonts.serifMedium, fontSize: size * 0.32, lineHeight: size * 0.34, color: textColor }}>
        {Math.round(score)}
      </Text>
      {qualifier && (
        <Text
          style={{
            fontFamily: Fonts.sansSemiBold,
            fontSize: 11,
            letterSpacing: 0.2,
            color: mutedColor,
            marginTop: 2,
          }}
        >
          {qualifier}
        </Text>
      )}
      {label && (
        <Text
          style={{
            position: 'absolute',
            bottom: -20,
            fontFamily: Fonts.sans,
            fontSize: 12,
            color: mutedColor,
          }}
        >
          {label}
        </Text>
      )}
    </View>
  );
}
