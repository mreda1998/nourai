import React, { useState } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Apple, Droplet, FlaskConical, Pill as PillIcon } from 'lucide-react-native';
import { Palette } from '@/constants/theme';

const categoryArt: Record<string, { colors: [string, string]; icon: typeof Apple }> = {
  supplement: { colors: ['#EFE3CC', '#E2CFA9'], icon: PillIcon },
  cosmetic: { colors: ['#E2ECE6', '#C9DDD2'], icon: Droplet },
  food: { colors: ['#F2E4D8', '#E6CDB6'], icon: Apple },
  otc: { colors: ['#E4E6EE', '#CFD4E2'], icon: FlaskConical },
};

/**
 * Product imagery on a soft tinted plate (Alma-style). Falls back to a
 * category gradient + glyph when there's no photo or it fails to load.
 */
export function ProductImage({ uri, category, size = 56, radius, style }: {
  uri?: string | null;
  category?: string | null;
  size?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [failed, setFailed] = useState(false);
  const art = categoryArt[category ?? ''] ?? categoryArt.supplement;
  const Icon = art.icon;
  const r = radius ?? Math.round(size * 0.28);
  return (
    <View style={[{ width: size, height: size, borderRadius: r, borderCurve: 'continuous', overflow: 'hidden', backgroundColor: Palette.sunken }, style]}>
      <LinearGradient colors={art.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', inset: 0 }} />
      {uri && !failed ? (
        <Image
          source={{ uri }}
          onError={() => setFailed(true)}
          contentFit="contain"
          transition={250}
          style={{ position: 'absolute', top: size * 0.1, left: size * 0.1, right: size * 0.1, bottom: size * 0.1 }}
        />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={size * 0.4} color="rgba(14,31,30,0.45)" strokeWidth={1.4} />
        </View>
      )}
    </View>
  );
}
