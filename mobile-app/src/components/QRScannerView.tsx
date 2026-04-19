import React from 'react';
import { Platform, StyleSheet, type ViewStyle } from 'react-native';
import { CameraView, useCameraPermissions } from './CameraCapture';
import { NativeQRScanner } from './NativeQRScannerView';

interface QRScannerProps {
  style?: ViewStyle;
  onScanned: (data: string) => void;
}

export { useCameraPermissions };

export function QRScanner({ style, onScanned }: QRScannerProps) {
  if (Platform.OS === 'android' && NativeQRScanner) {
    return (
      <NativeQRScanner
        style={style ?? StyleSheet.absoluteFill}
        onQRScanned={(e) => onScanned(e.nativeEvent.data)}
      />
    );
  }

  return (
    <CameraView
      style={style ?? StyleSheet.absoluteFill}
      facing="back"
      barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      onBarcodeScanned={({ data }: { data: string }) => onScanned(data)}
    />
  );
}
