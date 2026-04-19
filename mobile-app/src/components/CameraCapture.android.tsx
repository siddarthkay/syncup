import React, { forwardRef, useImperativeHandle, useState, useEffect, useCallback } from 'react';
import { PermissionsAndroid, type ViewStyle } from 'react-native';
import { NativeQRScanner } from './NativeQRScannerView';

// Match the expo-camera CameraView API surface used by QuickCaptureModal
export const CameraView = forwardRef<
  { takePictureAsync: (opts?: { quality?: number }) => Promise<{ uri: string } | null> },
  { style?: ViewStyle; facing?: 'front' | 'back'; children?: React.ReactNode }
>(({ style, facing, children }, ref) => {
  useImperativeHandle(ref, () => ({
    takePictureAsync: async (_opts?: { quality?: number }) => {
      // Photo capture not yet supported on Android native camera
      return null;
    },
  }));

  return (
    <>
      {NativeQRScanner && <NativeQRScanner style={style} facing={facing} />}
      {children}
    </>
  );
});

export function useCameraPermissions(): [
  { granted: boolean; canAskAgain: boolean } | null,
  () => Promise<void>,
] {
  const [permission, setPermission] = useState<{ granted: boolean; canAskAgain: boolean } | null>(null);

  useEffect(() => {
    (async () => {
      const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
      setPermission({ granted, canAskAgain: true });
    })();
  }, []);

  const request = useCallback(async () => {
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
    const granted = result === PermissionsAndroid.RESULTS.GRANTED;
    const canAskAgain = result !== PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN;
    setPermission({ granted, canAskAgain });
    // If denied without "never ask again", re-check so a subsequent tap retries
    if (!granted && canAskAgain) {
      const recheckGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
      if (recheckGranted) {
        setPermission({ granted: true, canAskAgain: true });
      }
    }
  }, []);

  return [permission, request];
}
