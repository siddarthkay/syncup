import React from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from 'react-native';
import { colors } from './ui';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';

interface FormModalProps {
  visible: boolean;
  title: string;
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel?: string;
  submitting?: boolean;
  submitDisabled?: boolean;
  children: React.ReactNode;
}

export function FormModal({
  visible,
  title,
  onCancel,
  onSubmit,
  submitLabel = 'Save',
  submitting = false,
  submitDisabled = false,
  children,
}: FormModalProps) {
  const keyboardHeight = useKeyboardHeight();
  const { height: winHeight } = useWindowDimensions();
  const maxSheetHeight = Math.max(240, (winHeight - keyboardHeight) * 0.92);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <View style={[styles.backdrop, { paddingBottom: keyboardHeight }]}>
        {/* sibling (not ancestor) so child scrollables aren't fighting a parent Pressable */}
        <TouchableWithoutFeedback onPress={onCancel}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>
        <View style={[styles.sheet, { maxHeight: maxSheetHeight }]}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onCancel}>
              <Text style={styles.cancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onSubmit} disabled={submitDisabled || submitting}>
              {submitting ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <Text style={[styles.submit, submitDisabled && styles.submitDisabled]}>
                  {submitLabel}
                </Text>
              )}
            </TouchableOpacity>
          </View>
          <ScrollView
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    minHeight: 240,
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
  cancel: { color: colors.textDim, fontSize: 15 },
  submit: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  submitDisabled: { color: colors.border },
  body: { padding: 20, paddingBottom: 40 },
});
