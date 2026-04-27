import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/lib/supabase';
import { api } from '@/services/api';
import { PremiumLock } from '@/components/elory/PremiumLock';

export default function PremiumLayout() {
  const { isSignedIn } = useAuth();
  const [isPremium, setIsPremium] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isSignedIn) {
      setIsPremium(false);
      return;
    }
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token || cancelled) return;
      api.getSubscription(session.access_token)
        .then((sub) => { if (!cancelled) setIsPremium(sub.is_premium); })
        .catch(() => { if (!cancelled) setIsPremium(false); });
    });
    return () => { cancelled = true; };
  }, [isSignedIn]);

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.darkSurface },
          animation: 'slide_from_bottom',
        }}
      />
      {isPremium === false && <PremiumLock />}
    </>
  );
}
