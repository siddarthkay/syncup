import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Focusable } from '../components/Focusable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import type { WebViewNavigation } from 'react-native-webview';
import { colors, ErrorBox } from '../components/ui';

interface Props {
  visible: boolean;
  // Loopback URL of the daemon's web GUI, e.g. http://127.0.0.1:8384
  url: string;
  onClose: () => void;
}

export function WebGuiModal({ visible, url, onClose }: Props) {
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const origin = useMemo(() => {
    const m = url.match(/^[a-z]+:\/\/[^/]+/i);
    return m ? m[0] : url;
  }, [url]);

  const onShouldStart = (req: WebViewNavigation) => {
    const u = req.url;
    if (u.startsWith(origin) || u === 'about:blank' || u.startsWith('data:')) {
      return true;
    }
    Linking.openURL(u).catch(() => {});
    return false;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Focusable onPress={onClose} hitSlop={8}>
            <Text style={styles.action}>Done</Text>
          </Focusable>
          <Text style={styles.title} numberOfLines={1}>
            Web GUI
          </Text>
          <Focusable
            onPress={() => {
              setError(null);
              webRef.current?.reload();
            }}
            hitSlop={8}
          >
            <Text style={styles.action}>Reload</Text>
          </Focusable>
        </View>

        {error ? (
          <View style={styles.errorWrap}>
            <ErrorBox title="Couldn't load the web GUI" message={error} />
            <Text style={styles.hint}>{url}</Text>
          </View>
        ) : (
          <View style={styles.body}>
            <WebView
              ref={webRef}
              source={{ uri: url }}
              style={styles.web}
              onShouldStartLoadWithRequest={onShouldStart}
              onLoadStart={() => setLoading(true)}
              onLoadEnd={() => setLoading(false)}
              onError={({ nativeEvent }) => {
                setLoading(false);
                setError(nativeEvent.description || 'The page failed to load.');
              }}
              // The daemon binds loopback only; let it answer before giving up.
              startInLoadingState
            />
            {loading && (
              <View style={styles.loading} pointerEvents="none">
                <ActivityIndicator color={colors.text} />
              </View>
            )}
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: { color: colors.text, fontSize: 16, fontWeight: '600', flex: 1, textAlign: 'center' },
  action: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  body: { flex: 1 },
  web: { flex: 1, backgroundColor: colors.bg },
  loading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  errorWrap: { padding: 20, gap: 10 },
  hint: { color: colors.textDim, fontSize: 12, fontFamily: 'Menlo' },
});
