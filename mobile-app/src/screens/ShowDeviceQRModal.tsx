import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { colors } from '../components/ui';

interface Props {
  visible: boolean;
  deviceId: string;
  deviceName?: string;
  onClose: () => void;
}

export function ShowDeviceQRModal({ visible, deviceId, deviceName, onClose }: Props) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>This device</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.close}>Done</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            {deviceName ? <Text style={styles.name} numberOfLines={1}>{deviceName}</Text> : null}

            <View style={styles.qrFrame}>
              {deviceId ? (
                <QRCode
                  value={deviceId}
                  size={240}
                  color="#000"
                  backgroundColor="#fff"
                />
              ) : (
                <Text style={styles.empty}>Daemon not ready</Text>
              )}
            </View>

            <Text style={styles.idLabel}>Device ID</Text>
            <Text style={styles.idValue} selectable>{deviceId}</Text>

            <Text style={styles.hint}>
              On the other device, open SyncUp → Devices → + → Scan QR.
            </Text>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: { color: colors.text, fontSize: 16, fontWeight: '600' },
  close: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  body: { padding: 24, alignItems: 'center' },
  name: { color: colors.text, fontSize: 14, marginBottom: 16 },
  qrFrame: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  empty: { color: colors.textDim, fontSize: 13 },
  idLabel: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  idValue: {
    color: colors.text,
    fontSize: 11,
    fontFamily: 'Menlo',
    textAlign: 'center',
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  hint: {
    color: colors.textDim,
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 16,
    lineHeight: 17,
  },
});
