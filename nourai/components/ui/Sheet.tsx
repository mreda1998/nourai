import React, { forwardRef, ReactNode, useCallback } from 'react';
import {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Palette, Radius } from '@/constants/theme';

export type SheetRef = BottomSheetModal;

/**
 * Dynamic-height bottom sheet (Apple Maps / Alma style). Open with
 * `ref.current?.present()`, close with `ref.current?.dismiss()`.
 */
export const Sheet = forwardRef<BottomSheetModal, { children: ReactNode; onDismiss?: () => void; night?: boolean }>(
  function Sheet({ children, onDismiss, night = false }, ref) {
    const insets = useSafeAreaInsets();
    const backdrop = useCallback(
      (props: BottomSheetBackdropProps) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.35} pressBehavior="close" />,
      [],
    );
    return (
      <BottomSheetModal
        ref={ref}
        enableDynamicSizing
        onDismiss={onDismiss}
        backdropComponent={backdrop}
        backgroundStyle={{ backgroundColor: night ? Palette.nightRaised : Palette.surface, borderRadius: Radius.xxl }}
        handleIndicatorStyle={{ backgroundColor: night ? Palette.nightInk3 : Palette.ink4, width: 40 }}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
      >
        <BottomSheetView style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: Math.max(insets.bottom, 20) + 8 }}>
          {children}
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);
