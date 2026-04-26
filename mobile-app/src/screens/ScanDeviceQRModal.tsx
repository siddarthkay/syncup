import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { QRScanner, useCameraPermissions } from '../components/QRScannerView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../components/ui';

const DEVICE_ID_RE = /^[A-Z0-9]{7}(-[A-Z0-9]{7}){7}$/i;

interface Props {
  visible: boolean;
  onCancel: () => void;
  onScanned: (deviceId: string) => void;
}

export function ScanDeviceQRModal({ visible, onCancel, onScanned }: Props) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [scannedOnce, setScannedOnce] = useState(false);
  const lockRef = useRef(false);

  useEffect(() => {
    if (visible) {
      setScannedOnce(false);
      lockRef.current = false;
    }
  }, [visible]);

  useEffect(() => {
    if (visible && permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [visible, permission, requestPermission]);

  const handleScan = useCallback(
    ({ data }: { data: string }) => {
      if (lockRef.current) return;
      const cleaned = data.trim().toUpperCase().replace(/\s+/g, '');
      if (!DEVICE_ID_RE.test(cleaned)) {
        // not a syncthing id, keep the camera live so the user can re-aim
        return;
      }
      lockRef.current = true;
      setScannedOnce(true);
      onScanned(cleaned);
    },
    [onScanned],
  );

  const openSettingsHint = () => {
    Alert.alert(
      'Camera permission needed',
      'Open the system Settings app and allow camera access for SyncUp, then come back and try again.',
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <View style={styles.root}>
        <View style={[styles.header, { paddingTop: 14 + insets.top }]}>
          <TouchableOpacity onPress={onCancel}>
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Scan device QR</Text>
          <View style={{ width: 60 }} />
        </View>

        <View style={styles.cameraWrap}>
          {!permission ? (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderText}>Loading camera…</Text>
            </View>
          ) : !permission.granted ? (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderText}>Camera access denied</Text>
              <Text style={styles.placeholderHint}>
                SyncUp needs the camera to scan a peer's device-ID QR code.
              </Text>
              {permission.canAskAgain ? (
                <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
                  <Text style={styles.permBtnText}>Grant access</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.permBtn} onPress={openSettingsHint}>
                  <Text style={styles.permBtnText}>Open Settings</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : !scannedOnce ? (
              <QRScanner
                style={StyleSheet.absoluteFill}
                onScanned={(data) => handleScan({ data })}
              />
          ) : null}

          <View pointerEvents="none" style={styles.reticle} />
        </View>

        <View style={[styles.footer, { paddingBottom: 24 + insets.bottom }]}>
          <Text style={styles.footerText}>
            Aim at the QR code shown by the other device. Detection is automatic.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    backgroundColor: '#000',
  },
  title: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cancel: { color: colors.accent, fontSize: 15, width: 60 },
  cameraWrap: { flex: 1, position: 'relative' },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  placeholderText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  placeholderHint: {
    color: '#b9c1cc',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  permBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    marginTop: 10,
  },
  permBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  reticle: {
    position: 'absolute',
    left: '15%',
    right: '15%',
    top: '20%',
    bottom: '20%',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
    borderRadius: 16,
  },
  footer: {
    backgroundColor: '#000',
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  footerText: { color: '#b9c1cc', fontSize: 13, textAlign: 'center', lineHeight: 18 },
});
