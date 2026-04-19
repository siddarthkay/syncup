import { Platform, requireNativeComponent, type ViewStyle } from 'react-native';

export const NativeQRScanner = Platform.OS === 'android'
  ? requireNativeComponent<{
      style?: ViewStyle;
      facing?: string;
      onQRScanned?: (e: { nativeEvent: { data: string } }) => void;
    }>('QRScannerView')
  : null;
