import React, { forwardRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BottomSheetModal, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import * as Haptics from 'expo-haptics';
import { CheckCircle2 } from 'lucide-react-native';
import { Fonts, Palette } from '@/constants/theme';
import { isCatalogueId, track } from '@/lib/insights';
import { Button, Sheet, Txt } from '@/components/ui';

/**
 * Free-text tester feedback, optionally about one product. Stored as a
 * `feedback` event and listed in the tester report.
 */
export const FeedbackSheet = forwardRef<BottomSheetModal, {
  productId?: string;
  productName?: string;
}>(function FeedbackSheet({ productId, productName }, ref) {
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  const send = () => {
    const text = message.trim();
    if (!text) return;
    const context = productName ? `product: ${productName}` : 'general';
    track('feedback', isCatalogueId(productId)
      ? { product_id: productId, meta: { message: text.slice(0, 1500), context } }
      : { meta: { message: text.slice(0, 1500), context, ref: productId } });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSent(true);
    setMessage('');
  };

  const dismiss = () => (ref as React.RefObject<BottomSheetModal | null>)?.current?.dismiss();

  return (
    <Sheet ref={ref} onDismiss={() => setSent(false)}>
      {sent ? (
        <View style={{ alignItems: 'center', paddingVertical: 12 }}>
          <CheckCircle2 size={34} color={Palette.strong} strokeWidth={1.6} />
          <Txt variant="title2" style={{ marginTop: 12 }}>Thanks — got it</Txt>
          <Txt variant="subhead" tone="secondary" align="center" style={{ marginTop: 6 }}>
            Every note is read. This is exactly what makes Elory better.
          </Txt>
          <Button label="Close" variant="secondary" style={{ marginTop: 20 }} onPress={dismiss} />
        </View>
      ) : (
        <>
          <Txt variant="title2">{productName ? 'Something look wrong?' : 'Beta feedback'}</Txt>
          <Txt variant="subhead" tone="secondary" style={{ marginTop: 4 }}>
            {productName
              ? `Tell us what’s off about ${productName} — a verdict, an ingredient, missing info.`
              : 'What’s confusing, broken or missing? What would you use every day?'}
          </Txt>
          <BottomSheetTextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Type anything…"
            placeholderTextColor={Palette.ink3}
            style={styles.input}
            multiline
            maxLength={1500}
            textAlignVertical="top"
          />
          <Button label="Send" disabled={!message.trim()} style={{ marginTop: 16 }} onPress={send} />
        </>
      )}
    </Sheet>
  );
});

const styles = StyleSheet.create({
  input: {
    minHeight: 120, marginTop: 16, borderRadius: 14, borderCurve: 'continuous', backgroundColor: Palette.canvas,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, fontFamily: Fonts.sans, fontSize: 17, color: Palette.ink,
  },
});
