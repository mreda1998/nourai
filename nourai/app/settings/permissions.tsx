import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Camera } from 'expo-camera';
import { Bell, Camera as CameraIcon, ShieldCheck } from 'lucide-react-native';
import { Palette } from '@/constants/theme';
import { Button, Card, ListGroup, ListRow, Pill, Screen, Section, Txt } from '@/components/ui';

type Status = 'granted' | 'denied' | 'undetermined';

export default function PermissionsScreen() {
  const [camera, setCamera] = useState<Status | null>(null);

  useFocusEffect(useCallback(() => {
    Camera.getCameraPermissionsAsync().then(({ status }) => setCamera(status as Status)).catch(() => setCamera('undetermined'));
  }, []));

  const request = async () => {
    if (camera === 'denied') { Linking.openSettings(); return; }
    const { status } = await Camera.requestCameraPermissionsAsync();
    setCamera(status as Status);
  };

  const pill = camera === 'granted'
    ? <Pill label="Allowed" tone="strong" />
    : camera === 'denied' ? <Pill label="Denied" tone="weak" /> : <Pill label="Not set" />;

  return (
    <Screen back title="Permissions">
      <Card padding={18} style={{ flexDirection: 'row', gap: 12 }}>
        <ShieldCheck size={22} color={Palette.accent} />
        <Txt variant="subhead" tone="secondary" style={{ flex: 1 }}>
          Elory uses the camera only to read barcodes. No images are stored or uploaded.
        </Txt>
      </Card>

      <Section title="Access">
        <ListGroup>
          <ListRow icon={CameraIcon} title="Camera" subtitle="Needed to scan products" trailing={camera == null ? <ActivityIndicator size="small" color={Palette.accent} /> : pill} chevron={false} />
          <ListRow icon={Bell} title="Notifications" subtitle="Managed in iOS Settings" onPress={() => Linking.openSettings()} />
        </ListGroup>
        {camera && camera !== 'granted' ? (
          <View style={{ marginTop: 16 }}>
            <Button label={camera === 'denied' ? 'Open Settings to allow camera' : 'Allow camera'} onPress={request} />
          </View>
        ) : null}
      </Section>
    </Screen>
  );
}
