import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useVideoPlayer, VideoView } from 'expo-video';
import Pdf from 'react-native-pdf';
import { colors, formatBytes } from '../components/ui';
import { fileKind, type FileKind } from '../utils/fileTypes';
import { Icon } from '../components/Icon';

interface Props {
  visible: boolean;
  fileUri: string | null;
  name: string;
  size: number;
  modTime: string;
  relPath: string;
  onClose: () => void;
}

const TEXT_PREVIEW_MAX = 512 * 1024;

// The browser already validated that the file exists on disk before calling
// us, so we can skip the getInfoAsync round-trip here.
export function FilePreviewModal({
  visible,
  fileUri,
  name,
  size,
  modTime,
  relPath,
  onClose,
}: Props) {
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const kind: FileKind = fileKind(name);

  return (
    <Modal
      visible={visible && !!fileUri}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Text style={styles.headerClose}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{name}</Text>
          <TouchableOpacity
            onPress={() => shareFile(fileUri ?? '', name)}
            hitSlop={10}
          >
            <Text style={styles.headerAction}>Share</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          {fileUri && (
            <PreviewBody
              kind={kind}
              fileUri={fileUri}
              maxWidth={winWidth}
              maxHeight={winHeight - 200}
            />
          )}
        </View>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) + 8 }]}>
          <Text style={styles.footerLine} numberOfLines={1}>
            <Text style={styles.footerLabel}>Path  </Text>
            <Text style={styles.footerMono}>{relPath}</Text>
          </Text>
          <Text style={styles.footerLine}>
            <Text style={styles.footerLabel}>Size  </Text>
            {formatBytes(size)}
            <Text style={styles.footerLabel}>    Modified  </Text>
            {formatPreviewTime(modTime)}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

function PreviewBody({
  kind,
  fileUri,
  maxWidth,
  maxHeight,
}: {
  kind: FileKind;
  fileUri: string;
  maxWidth: number;
  maxHeight: number;
}) {
  if (kind === 'image') {
    return <ImagePreview fileUri={fileUri} maxWidth={maxWidth} maxHeight={maxHeight} />;
  }

  if (kind === 'video') {
    return <VideoPreview fileUri={fileUri} />;
  }

  if (kind === 'audio') {
    // expo-video's player accepts audio too and gives us transport controls
    // without a separate audio dep.
    return <VideoPreview fileUri={fileUri} audioOnly />;
  }

  if (kind === 'pdf') {
    return <PdfPreview fileUri={fileUri} />;
  }

  if (kind === 'text') {
    return <TextPreview fileUri={fileUri} />;
  }

  return (
    <View style={styles.unsupportedWrap}>
      <Icon name="document" size={72} color="#555" />
      <Text style={styles.unsupportedText}>No in-app preview for this type.</Text>
      <Text style={styles.unsupportedHint}>Tap Share above to open it elsewhere.</Text>
    </View>
  );
}

function ImagePreview({
  fileUri,
  maxWidth,
  maxHeight,
}: {
  fileUri: string;
  maxWidth: number;
  maxHeight: number;
}) {
  const [error, setError] = useState<string | null>(null);

  if (error) {
    const isNoSuchFile = typeof error === 'string' && error.includes('no such file');
    return (
      <View style={styles.unsupportedWrap}>
        <Icon name={isNoSuchFile ? 'cloud' : 'image'} size={72} color="#555" />
        <Text style={styles.unsupportedText}>
          {isNoSuchFile
            ? 'This file hasn\'t been downloaded to this device yet.'
            : 'Could not load this image.'}
        </Text>
        <Text style={styles.unsupportedHint}>
          {isNoSuchFile
            ? 'It exists on a connected peer. Wait for the sync to complete, or check that the peer is online.'
            : String(error)}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.imageScroll}>
      <Image
        source={{ uri: fileUri }}
        style={{ width: maxWidth, height: maxHeight }}
        resizeMode="contain"
        onError={e => setError(e.nativeEvent?.error || 'Failed to load image')}
      />
    </View>
  );
}

function PdfPreview({ fileUri }: { fileUri: string }) {
  const { width } = useWindowDimensions();
  const [error, setError] = useState<string | null>(null);

  if (error) {
    return (
      <View style={styles.unsupportedWrap}>
        <Icon name="book" size={72} color="#555" />
        <Text style={styles.unsupportedText}>Could not load PDF.</Text>
        <Text style={styles.unsupportedHint}>{error}</Text>
      </View>
    );
  }

  return (
    <Pdf
      source={{ uri: fileUri, cache: true }}
      style={[styles.pdfView, { width }]}
      trustAllCerts={false}
      enablePaging
      onError={e => setError(String(e))}
    />
  );
}

function VideoPreview({ fileUri, audioOnly }: { fileUri: string; audioOnly?: boolean }) {
  const player = useVideoPlayer(fileUri, p => {
    p.loop = false;
    p.muted = false;
  });
  return (
    <View style={audioOnly ? styles.audioWrap : styles.videoWrap}>
      {audioOnly && <Icon name="musical-note" size={96} color="#888" />}
      <VideoView
        player={player}
        style={audioOnly ? styles.audioView : styles.videoView}
        contentFit="contain"
        allowsFullscreen
        allowsPictureInPicture
      />
    </View>
  );
}

function TextPreview({ fileUri }: { fileUri: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const info = await FileSystem.getInfoAsync(fileUri);
        if (!info.exists) {
          if (!cancelled) setError('File is not on this device. Sync it first.');
          return;
        }
        const tooBig = (info.size ?? 0) > TEXT_PREVIEW_MAX;
        const text = await FileSystem.readAsStringAsync(fileUri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        if (cancelled) return;
        if (tooBig) {
          setContent(text.slice(0, TEXT_PREVIEW_MAX));
          setTruncated(true);
        } else {
          setContent(text);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileUri]);

  if (error) {
    return (
      <View style={styles.unsupportedWrap}>
        <Text style={styles.unsupportedText}>{error}</Text>
      </View>
    );
  }

  if (content == null) {
    return (
      <View style={styles.unsupportedWrap}>
        <ActivityIndicator color={colors.textDim} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.textScroll} contentContainerStyle={styles.textContent}>
      <Text style={styles.textBody} selectable>{content}</Text>
      {truncated && (
        <Text style={styles.textTruncated}>
          … {formatBytes(TEXT_PREVIEW_MAX)} preview limit reached. Tap Share to open the full file.
        </Text>
      )}
    </ScrollView>
  );
}

async function shareFile(fileUri: string, _name: string) {
  if (!fileUri) return;
  try {
    const available = await Sharing.isAvailableAsync();
    if (available) {
      await Sharing.shareAsync(fileUri);
      return;
    }
    await Share.share({
      url: fileUri,
      message: Platform.OS === 'android' ? fileUri : undefined,
    });
  } catch (e) {
    Alert.alert('Share failed', e instanceof Error ? e.message : String(e));
  }
}

function formatPreviewTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString();
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 16,
    backgroundColor: '#000',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.15)',
  },
  headerClose: { color: '#fff', fontSize: 22, width: 36 },
  headerTitle: { color: '#fff', fontSize: 15, fontWeight: '600', flex: 1, textAlign: 'center' },
  headerAction: { color: colors.accent, fontSize: 15, fontWeight: '600', width: 56, textAlign: 'right' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  imageScroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  pdfView: { flex: 1, backgroundColor: '#1a1a1a' },
  videoWrap: { flex: 1, alignSelf: 'stretch' },
  videoView: { flex: 1 },
  audioWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  audioIcon: { fontSize: 96, marginBottom: 30 },
  audioView: { width: 320, height: 80 },
  unsupportedWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  unsupportedIcon: { fontSize: 72, marginBottom: 16, opacity: 0.4 },
  unsupportedText: { color: '#bbb', fontSize: 15, textAlign: 'center' },
  unsupportedHint: { color: '#777', fontSize: 12, marginTop: 8, textAlign: 'center' },
  textScroll: { flex: 1, alignSelf: 'stretch', backgroundColor: '#0e0e12' },
  textContent: { padding: 16 },
  textBody: { color: '#eee', fontSize: 12, fontFamily: 'Menlo' },
  textTruncated: { color: '#777', fontSize: 11, fontStyle: 'italic', marginTop: 20 },
  footer: {
    backgroundColor: '#000',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.15)',
  },
  footerLine: { color: '#ddd', fontSize: 11 },
  footerLabel: { color: '#888', fontSize: 11 },
  footerMono: { color: '#ddd', fontSize: 11, fontFamily: 'Menlo' },
});
