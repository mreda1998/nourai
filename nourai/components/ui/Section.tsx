import React, { ReactNode } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { PressableScale } from './PressableScale';
import { Txt } from './Txt';

/** Section title + optional trailing action. Sections are separated by 36pt. */
export function Section({ title, caption, action, onAction, children, style, night = false }: {
  title?: string;
  caption?: string;
  action?: string;
  onAction?: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  night?: boolean;
}) {
  return (
    <View style={[{ marginTop: 36 }, style]}>
      {title ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14 }}>
          <View style={{ flex: 1 }}>
            <Txt variant="title3" tone={night ? 'inverse' : 'primary'} accessibilityRole="header">{title}</Txt>
            {caption ? <Txt variant="footnote" tone={night ? 'inverse2' : 'secondary'} style={{ marginTop: 3 }}>{caption}</Txt> : null}
          </View>
          {action && onAction ? (
            <PressableScale onPress={onAction} haptic="selection" hitSlop={10}>
              <Txt variant="subheadStrong" tone={night ? 'inverse2' : 'accent'}>{action}</Txt>
            </PressableScale>
          ) : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}
