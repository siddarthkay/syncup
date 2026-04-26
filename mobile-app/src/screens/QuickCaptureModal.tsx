import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from '../components/CameraCapture';
import * as Haptics from 'expo-haptics';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSyncthingClient } from '../daemon/SyncthingContext';
import type { FolderConfig } from '../api/types';
import { copyFile } from '../fs/bridgeFs';
import { colors } from '../components/ui';
import { Icon } from '../components/Icon';

interface Props {
  visible: boolean;
  folders: FolderConfig[];
  onClose: () => void;
  onCaptured: () => void;
}

export function QuickCaptureModal({ visible, folders, onClose, onCaptured }: Props) {
  const client = useSyncthingClient();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [capturing, setCapturing] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<FolderConfig | null>(null);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    if (visible && permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [visible, permission, requestPermission]);

  useEffect(() => {
    if (visible && folders.length > 0 && !selectedFolder) {
      setSelectedFolder(folders[0]);
    }
  }, [visible, folders, selectedFolder]);

  useEffect(() => {
    if (!visible) {
      setShowFolderPicker(false);
      setCapturing(false);
    }
  }, [visible]);

  const capture = async () => {
    if (!cameraRef.current || capturing || !selectedFolder) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        skipProcessing: false,
      });
      if (!photo?.uri) {
        Alert.alert('Capture failed', 'No image data returned.');
        return;
      }

      const now = new Date();
      const timestamp = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
        '_',
        String(now.getHours()).padStart(2, '0'),
        String(now.getMinutes()).padStart(2, '0'),
        String(now.getSeconds()).padStart(2, '0'),
      ].join('');
      const filename = `IMG_${timestamp}.jpg`;

      const srcPath = photo.uri.replace(/^file:\/\//, '');
      const dstPath = `${selectedFolder.path}/${filename}`;
      copyFile(srcPath, dstPath);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

      try {
        await client.scanFolder(selectedFolder.id);
      } catch {
        // daemon watcher picks it up
      }

      onCaptured();
      Alert.alert(
        'Saved',
        `${filename} saved to "${selectedFolder.label || selectedFolder.id}"`,
        [
          { text: 'Take another', onPress: () => {} },
          { text: 'Done', onPress: onClose },
        ],
      );
    } catch (e) {
      Alert.alert('Capture failed', e instanceof Error ? e.message : String(e));
    } finally {
      setCapturing(false);
    }
  };

  if (!permission?.granted) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <View style={styles.permissionWrap}>
            <Text style={styles.permissionText}>Camera access is needed to take photos.</Text>
            <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
              <Text style={styles.permissionBtnText}>Grant access</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    );
  }

  if (folders.length === 0) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <View style={styles.permissionWrap}>
            <Text style={styles.permissionText}>
              Add a folder first, then come back here to capture photos straight into it.
            </Text>
            <TouchableOpacity style={styles.permissionBtn} onPress={onClose}>
              <Text style={styles.permissionBtnText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.container}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing={facing}
        />

        <View style={styles.overlay} pointerEvents="box-none">
          <View style={[styles.topBar, { paddingTop: 12 + insets.top }]}>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowFolderPicker(true)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name="folder" size={16} color="#fff" />
                <Text style={styles.folderLabel} numberOfLines={1}>
                  {selectedFolder?.label || selectedFolder?.id || 'Select folder'}
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}>
              <Icon name="camera-reverse" size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={[styles.bottomBar, { paddingBottom: 20 + insets.bottom }]}>
            <View style={styles.shutterWrap}>
              <TouchableOpacity
                style={[styles.shutter, capturing && styles.shutterActive]}
                onPress={capture}
                disabled={capturing || !selectedFolder}
              >
                <View style={styles.shutterInner} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {showFolderPicker && (
          <View style={styles.pickerOverlay}>
            <SafeAreaView style={styles.pickerSheet} edges={['bottom']}>
              <Text style={styles.pickerTitle}>Save to folder</Text>
              {folders.map(f => (
                <TouchableOpacity
                  key={f.id}
                  style={[
                    styles.pickerRow,
                    selectedFolder?.id === f.id && styles.pickerRowActive,
                  ]}
                  onPress={() => {
                    setSelectedFolder(f);
                    setShowFolderPicker(false);
                  }}
                >
                  <Text style={styles.pickerRowText}>
                    {f.label || f.id}
                  </Text>
                  {selectedFolder?.id === f.id && (
                    <Text style={styles.pickerCheck}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.pickerCancel}
                onPress={() => setShowFolderPicker(false)}
              >
                <Text style={styles.pickerCancelText}>Cancel</Text>
              </TouchableOpacity>
            </SafeAreaView>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  closeBtn: { color: '#fff', fontSize: 22, width: 36 },
  folderLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    overflow: 'hidden',
    maxWidth: 200,
  },
  flipBtn: { color: '#fff', fontSize: 22, width: 36, textAlign: 'right' },
  bottomBar: {
    alignItems: 'center',
    paddingBottom: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingTop: 20,
  },
  shutterWrap: { alignItems: 'center' },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterActive: { borderColor: colors.accent },
  shutterInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#fff',
  },
  permissionWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 16,
  },
  permissionText: { color: colors.text, fontSize: 15, textAlign: 'center' },
  permissionBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  permissionBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  cancelText: { color: colors.textDim, fontSize: 14, marginTop: 8 },
  pickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
  },
  pickerTitle: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  pickerRow: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pickerRowActive: { backgroundColor: colors.bg },
  pickerRowText: { color: colors.text, fontSize: 15, flex: 1 },
  pickerCheck: { color: colors.accent, fontSize: 16, fontWeight: '700' },
  pickerCancel: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  pickerCancelText: { color: colors.textDim, fontSize: 15 },
});
