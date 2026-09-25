import React, { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Image } from 'expo-image';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { Palette, Radius } from '@/constants/theme';
import { API_ORIGIN } from '@/services/api';
import { Card, Section, Txt } from '@/components/ui';

type State = 'loading' | 'ready' | 'fallback' | 'hidden';

/**
 * A hosted scientific viewer (Mol*, SwissBioPics, Reactome) in a WebView.
 * Falls back to a cached still image when the viewer can't load, and hides
 * itself when there's nothing to show — never a placeholder.
 */
export function ViewerPanel({
  title, caption, viewerPath, fallbackUrl, attribution, height = 280, interactive = false, children,
}: {
  title: string;
  caption?: string;
  viewerPath?: string | null;
  fallbackUrl?: string | null;
  attribution?: string | null;
  height?: number;
  interactive?: boolean;
  children?: React.ReactNode;
}) {
  const [state, setState] = useState<State>(viewerPath ? 'loading' : fallbackUrl ? 'fallback' : 'hidden');

  if (state === 'hidden') return null;

  const fail = () => setState(fallbackUrl ? 'fallback' : 'hidden');
  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'ready') setState('ready');
      else if (msg.type === 'error') fail();
      else if (msg.type === 'timeout') setState((s) => (s === 'loading' ? (fallbackUrl ? 'fallback' : 'hidden') : s));
    } catch { /* ignore non-JSON messages */ }
  };

  return (
    <Section title={title} caption={caption}>
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <View style={{ height, backgroundColor: Palette.canvas, borderRadius: Radius.xl, overflow: 'hidden' }}>
          {state === 'fallback' ? (
            <Image source={{ uri: `${API_ORIGIN}${fallbackUrl}` }} style={{ flex: 1 }} contentFit="contain" transition={200} onError={() => setState('hidden')} />
          ) : (
            <WebView
              source={{ uri: `${API_ORIGIN}${viewerPath}` }}
              style={{ flex: 1, backgroundColor: Palette.canvas }}
              originWhitelist={['*']}
              onMessage={onMessage}
              onError={fail}
              onHttpError={fail}
              scrollEnabled={interactive}
              bounces={false}
              javaScriptEnabled
              domStorageEnabled
              allowsInlineMediaPlayback={false}
              setSupportMultipleWindows={false}
            />
          )}
          {state === 'loading' ? (
            <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: Palette.canvas }}>
              <ActivityIndicator color={Palette.accent} />
            </View>
          ) : null}
        </View>
        {children ? <View style={{ padding: 16, paddingTop: 12 }}>{children}</View> : null}
      </Card>
      {attribution && state === 'fallback' ? (
        <Txt variant="caption" tone="tertiary" style={{ marginTop: 6 }}>{attribution}</Txt>
      ) : null}
    </Section>
  );
}
