import React, { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../components/ui';
import { Icon } from '../components/Icon';
import type { FolderConfig } from '../api/types';

interface Props {
  folder: FolderConfig;
  onBack: () => void;
}

interface SharingConfig {
  enabled: boolean;
  baseUrl: string;
}

const storageKey = (folderId: string) => `sharing:${folderId}`;

export function ExternalSharingSettings({ folder, onBack }: Props) {
  const [config, setConfig] = useState<SharingConfig>({ enabled: false, baseUrl: '' });
  const [testPath, setTestPath] = useState('');

  useEffect(() => {
    AsyncStorage.getItem(storageKey(folder.id))
      .then(raw => {
        if (raw) setConfig(JSON.parse(raw));
      })
      .catch(() => {});
  }, [folder.id]);

  const save = (patch: Partial<SharingConfig>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    AsyncStorage.setItem(storageKey(folder.id), JSON.stringify(next)).catch(() => {});
  };

  const generateLink = (filePath: string): string => {
    const base = config.baseUrl.replace(/\/+$/, '');
    const path = filePath.replace(/^\/+/, '');
    return `${base}/${path}`;
  };

  const shareTestLink = () => {
    if (!config.baseUrl.trim()) {
      Alert.alert('No base URL', 'Enter the base URL of your web server first.');
      return;
    }
    if (!testPath.trim()) {
      Alert.alert('No file path', 'Enter a relative file path to generate a link for.');
      return;
    }
    const link = generateLink(testPath.trim());
    Share.share({ url: link, message: link }).catch(() => {});
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={8}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>External sharing</Text>
        <View style={{ width: 56 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.description}>
          Generate shareable web links for files in this folder. You need a web
          server (nginx, Caddy, etc.) serving the folder contents at a public URL.
        </Text>

        <Text style={styles.sectionLabel}>Base URL</Text>
        <TextInput
          style={styles.input}
          value={config.baseUrl}
          onChangeText={text => save({ baseUrl: text })}
          placeholder="https://files.example.com/myfolder"
          placeholderTextColor={colors.textDim}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Text style={styles.hint}>
          The root URL where this folder's contents are served. File paths are
          appended to this URL to generate links.
        </Text>

        {config.baseUrl.trim() ? (
          <>
            <Text style={styles.sectionLabel}>Test a link</Text>
            <TextInput
              style={styles.input}
              value={testPath}
              onChangeText={setTestPath}
              placeholder="path/to/file.jpg"
              placeholderTextColor={colors.textDim}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {testPath.trim() ? (
              <Text style={styles.previewUrl} selectable>
                {generateLink(testPath.trim())}
              </Text>
            ) : null}
            <TouchableOpacity style={styles.shareBtn} onPress={shareTestLink}>
              <Icon name="share-outline" size={18} color={colors.accent} />
              <Text style={styles.shareBtnText}>Share link</Text>
            </TouchableOpacity>

            <Text style={styles.usageHint}>
              To share a file link from the file browser, long-press any file
              and select "Copy link" (available when a base URL is configured).
            </Text>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

// used by the file browser to check if sharing links are configured
export async function getSharingBaseUrl(folderId: string): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(folderId));
    if (!raw) return null;
    const config: SharingConfig = JSON.parse(raw);
    return config.baseUrl?.trim() || null;
  } catch {
    return null;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 8,
  },
  back: { color: colors.accent, fontSize: 15, minWidth: 56 },
  title: { color: colors.text, fontSize: 16, fontWeight: '600', flex: 1, textAlign: 'center' },
  body: { padding: 20, paddingBottom: 40 },
  description: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 20,
  },
  sectionLabel: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 20,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  hint: {
    color: colors.textDim,
    fontSize: 11,
    marginTop: 6,
    lineHeight: 16,
  },
  previewUrl: {
    color: colors.accent,
    fontSize: 12,
    fontFamily: 'Menlo',
    marginTop: 8,
    lineHeight: 17,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  shareBtnText: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  usageHint: {
    color: colors.textDim,
    fontSize: 11,
    marginTop: 20,
    lineHeight: 16,
    fontStyle: 'italic',
  },
});
