import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FormModal } from '../components/FormModal';
import { Field } from '../components/Field';
import { colors } from '../components/ui';
import { useSyncthing, useSyncthingClient } from '../daemon/SyncthingContext';
import type { DeviceConfig, FolderConfig } from '../api/types';
import { FolderPicker } from './FolderPicker';
import { FolderTypePicker } from '../components/FolderTypePicker';
import {
  filesystemTypeForExternal,
  pickExternalFolderWithICloudWarning,
} from '../fs/externalFolder';
import {
  applyPresetToFolder,
  presetDefaults,
  type FolderPreset,
} from '../utils/folderPresets';
import { markAsVault } from '../utils/vaultRegistry';

const FOLDER_ID_RE = /^[a-z0-9][a-z0-9-_.]*$/;

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function basename(p: string): string {
  const clean = p.replace(/\/+$/, '');
  const idx = clean.lastIndexOf('/');
  return idx >= 0 ? clean.slice(idx + 1) : clean;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onAdded: () => void;
}

export function AddFolderModal({ visible, onClose, onAdded }: Props) {
  const { info } = useSyncthing();
  const client = useSyncthingClient();

  const [path, setPath] = useState('');
  const [isExternal, setIsExternal] = useState(false);
  const [externalDisplayName, setExternalDisplayName] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const [label, setLabel] = useState('');
  const [labelDirty, setLabelDirty] = useState(false);
  const [id, setId] = useState('');
  const [idDirty, setIdDirty] = useState(false);

  const [devices, setDevices] = useState<DeviceConfig[]>([]);
  const [selectedPeers, setSelectedPeers] = useState<Set<string>>(new Set());
  const [folderType, setFolderType] = useState<FolderConfig['type']>('sendreceive');

  const [preset, setPreset] = useState<FolderPreset>('generic');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    client.devices().then(setDevices).catch(e => setError(String(e)));
  }, [visible, client]);

  // auto-fill label/id from path unless the user's already typed in them
  useEffect(() => {
    if (!path) return;
    const name = isExternal ? (externalDisplayName || 'folder') : basename(path);
    if (!labelDirty) setLabel(name);
    if (!idDirty) setId(slugify(name));
  }, [path, labelDirty, idDirty, isExternal, externalDisplayName]);

  const peerDevices = useMemo(
    () => devices.filter(d => d.deviceID !== info?.deviceId),
    [devices, info?.deviceId],
  );

  const pickerRoot = info?.foldersRoot ?? '';

  const displayPath = useMemo(() => {
    if (!path) return '';
    if (isExternal) return externalDisplayName || 'Device folder';
    if (pickerRoot && path.startsWith(pickerRoot)) {
      const rel = path.slice(pickerRoot.length) || '';
      return rel ? `folders${rel}` : 'folders/';
    }
    return path;
  }, [path, pickerRoot, isExternal, externalDisplayName]);

  const effectiveId = id || slugify(basename(path));
  const effectiveLabel = label || basename(path);
  const idValid = FOLDER_ID_RE.test(effectiveId);
  const canSubmit = path.length > 0 && idValid;

  const pickExternal = () => {
    try {
      pickExternalFolderWithICloudWarning(folder => {
        if (!folder) return;
        setPath(folder.path);
        setIsExternal(true);
        setExternalDisplayName(folder.displayName || 'Device folder');
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const reset = () => {
    setPath('');
    setIsExternal(false);
    setExternalDisplayName('');
    setLabel('');
    setLabelDirty(false);
    setId('');
    setIdDirty(false);
    setSelectedPeers(new Set());
    setFolderType('sendreceive');
    setPreset('generic');
    setShowAdvanced(false);
    setError(null);
    setSubmitting(false);
  };

  const cancel = () => {
    reset();
    onClose();
  };

  const togglePeer = (deviceId: string) => {
    setSelectedPeers(prev => {
      const next = new Set(prev);
      if (next.has(deviceId)) next.delete(deviceId);
      else next.add(deviceId);
      return next;
    });
  };

  const submit = async () => {
    if (!canSubmit || !info) return;
    setSubmitting(true);
    setError(null);
    try {
      const folderDevices = [
        { deviceID: info.deviceId, introducedBy: '', encryptionPassword: '' },
        ...Array.from(selectedPeers).map(d => ({
          deviceID: d,
          introducedBy: '',
          encryptionPassword: '',
        })),
      ];
      // On Android, external folders use the 'saf' filesystem driver, which
      // can't be watched via inotify — rely on 60s rescans. On iOS, external
      // folders are plain POSIX once scope is held, so the regular watcher
      // works and we can stay on the slower default rescan cadence.
      const fsType = isExternal ? filesystemTypeForExternal() : 'basic';
      const usesSaf = fsType === 'saf';
      const baseFolder: FolderConfig = {
        id: effectiveId,
        label: effectiveLabel,
        filesystemType: fsType,
        path,
        type: folderType,
        devices: folderDevices,
        rescanIntervalS: usesSaf ? 60 : 3600,
        fsWatcherEnabled: !usesSaf,
        fsWatcherDelayS: 10,
        ignorePerms: true,
        autoNormalize: true,
        paused: false,
        markerName: '.stfolder',
        order: 'random',
        minDiskFree: { value: 1, unit: '%' },
        syncOwnership: false,
        sendOwnership: false,
        syncXattrs: false,
        sendXattrs: false,
        versioning: {
          type: '',
          params: {},
          cleanupIntervalS: 3600,
          fsPath: '',
          fsType: 'basic',
        },
      };
      const folder = applyPresetToFolder(baseFolder, preset, { isSaf: usesSaf });
      await client.putFolder(folder);
      const presetIgnores = presetDefaults(preset).ignoreLines;
      if (presetIgnores.length > 0) {
        // Best-effort: a preset that fails to seed ignores is still a usable
        // folder, just noisier. Surface nothing — the ignores editor lets
        // the user re-apply manually.
        try {
          await client.setIgnores(folder.id, presetIgnores);
        } catch {
          // ignore
        }
      }
      if (preset === 'obsidian') {
        markAsVault(folder.id).catch(() => {});
      }
      reset();
      onAdded();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <FormModal
        visible={visible && !pickerOpen}
        title="Add folder"
        onCancel={cancel}
        onSubmit={submit}
        submitLabel="Add"
        submitting={submitting}
        submitDisabled={!canSubmit}
      >
        <Text style={styles.sectionLabel}>Location</Text>
        <TouchableOpacity
          style={[styles.pickerBtn, !path && styles.pickerBtnEmpty]}
          onPress={isExternal ? pickExternal : pickExternal}
        >
          <Text style={[styles.pickerBtnText, !path && styles.pickerBtnTextEmpty]} numberOfLines={2}>
            {displayPath || 'Pick a folder on this device…'}
          </Text>
          <Text style={styles.pickerArrow}>›</Text>
        </TouchableOpacity>
        <Text style={styles.hint}>
          {isExternal
            ? 'Syncing directly with this device folder.'
            : path
              ? 'This folder lives inside the app sandbox and appears in the Files app.'
              : 'Pick any folder on your device, or tap below to use app storage.'}
        </Text>
        {isExternal ? (
          <TouchableOpacity
            style={styles.safBtn}
            onPress={() => {
              setIsExternal(false);
              setPath('');
              setExternalDisplayName('');
            }}
          >
            <Text style={styles.safBtnText}>Use app storage instead</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.safBtn}
            onPress={() => setPickerOpen(true)}
            disabled={!pickerRoot}
          >
            <Text style={styles.safBtnText}>Use app storage instead</Text>
          </TouchableOpacity>
        )}

        {path && (
          <View style={styles.summary}>
            <SummaryRow label="Label" value={effectiveLabel} />
            <SummaryRow label="ID" value={effectiveId} />
          </View>
        )}

        {path && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Folder kind</Text>
            <View style={styles.presetRow}>
              <PresetChip
                label="Generic"
                hint="Default settings"
                active={preset === 'generic'}
                onPress={() => setPreset('generic')}
              />
              <PresetChip
                label="Obsidian vault"
                hint="Watcher on, vault ignores"
                active={preset === 'obsidian'}
                onPress={() => setPreset('obsidian')}
              />
            </View>
          </>
        )}

        {peerDevices.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Share with</Text>
            {peerDevices.map(d => {
              const on = selectedPeers.has(d.deviceID);
              return (
                <TouchableOpacity
                  key={d.deviceID}
                  style={[styles.peer, on && styles.peerOn]}
                  onPress={() => togglePeer(d.deviceID)}
                >
                  <View style={styles.peerMain}>
                    <Text style={styles.peerName}>{d.name || '(unnamed)'}</Text>
                    <Text style={styles.peerId} numberOfLines={1}>{d.deviceID}</Text>
                  </View>
                  <View style={[styles.checkbox, on && styles.checkboxOn]}>
                    {on && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {path && (
          <TouchableOpacity
            style={styles.advancedToggle}
            onPress={() => setShowAdvanced(v => !v)}
          >
            <Text style={styles.advancedToggleText}>
              {showAdvanced ? '▾ Advanced' : '▸ Advanced'}
            </Text>
          </TouchableOpacity>
        )}

        {showAdvanced && (
          <View style={styles.advanced}>
            <Field
              label="Label"
              placeholder={basename(path) || 'Documents'}
              value={label}
              onChangeText={text => {
                setLabel(text);
                setLabelDirty(true);
              }}
              hint="Shown in the folder list. Defaults to the folder name."
            />
            <Field
              label="Folder ID"
              placeholder={slugify(basename(path)) || 'documents'}
              value={id}
              onChangeText={text => {
                setId(text);
                setIdDirty(true);
              }}
              hint="Must match on every peer. Defaults to a slug of the folder name."
              error={id && !FOLDER_ID_RE.test(id) ? 'Use lowercase letters, digits, dashes' : undefined}
            />
            <Text style={[styles.sectionLabel, { marginTop: 12 }]}>Folder type</Text>
            <FolderTypePicker value={folderType} onChange={setFolderType} />
          </View>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
      </FormModal>

      <FolderPicker
        visible={pickerOpen}
        rootPath={pickerRoot}
        initialPath={path || pickerRoot}
        onCancel={() => setPickerOpen(false)}
        onPick={chosen => {
          setPath(chosen);
          setPickerOpen(false);
        }}
      />
    </>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function PresetChip({
  label,
  hint,
  active,
  onPress,
}: {
  label: string;
  hint: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.presetChip, active && styles.presetChipOn]}
      onPress={onPress}
    >
      <Text style={[styles.presetChipLabel, active && styles.presetChipLabelOn]}>
        {label}
      </Text>
      <Text style={[styles.presetChipHint, active && styles.presetChipHintOn]}>
        {hint}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  pickerBtn: {
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  pickerBtnEmpty: { borderStyle: 'dashed' },
  pickerBtnText: { color: colors.text, fontSize: 14, flex: 1, fontFamily: 'Menlo' },
  pickerBtnTextEmpty: { color: colors.textDim, fontStyle: 'italic', fontFamily: undefined },
  pickerArrow: { color: colors.textDim, fontSize: 20 },
  hint: { color: colors.textDim, fontSize: 11, marginTop: 6, marginBottom: 16 },
  summary: {
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  summaryLabel: { color: colors.textDim, fontSize: 12 },
  summaryValue: { color: colors.text, fontSize: 13, flex: 1, textAlign: 'right' },
  peer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
  },
  peerOn: { borderColor: colors.accent },
  peerMain: { flex: 1 },
  peerName: { color: colors.text, fontSize: 14, fontWeight: '500' },
  peerId: { color: colors.textDim, fontSize: 11, fontFamily: 'Menlo', marginTop: 2 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { borderColor: colors.accent, backgroundColor: colors.accent },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '700' },
  advancedToggle: { marginTop: 18, paddingVertical: 8 },
  advancedToggleText: { color: colors.textDim, fontSize: 13, fontWeight: '500' },
  advanced: { marginTop: 8 },
  safBtn: {
    marginTop: 4,
    marginBottom: 12,
    paddingVertical: 8,
  },
  safBtnText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '500',
  },
  error: { color: colors.error, fontSize: 13, marginTop: 8 },
  presetRow: { flexDirection: 'row', gap: 10 },
  presetChip: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  presetChipOn: { borderColor: colors.accent, backgroundColor: colors.card },
  presetChipLabel: { color: colors.text, fontSize: 14, fontWeight: '600' },
  presetChipLabelOn: { color: colors.accent },
  presetChipHint: { color: colors.textDim, fontSize: 11, marginTop: 4 },
  presetChipHintOn: { color: colors.textDim },
});
