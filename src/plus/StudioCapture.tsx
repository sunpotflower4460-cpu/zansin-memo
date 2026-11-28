import * as React from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { withCoreCommand, type GardenV3Writer } from '../data/gardenV3Writer';
import { captureAndConnect, captureSeed } from '../domain/gardenCommands';
import { showConfirm } from '../utils/confirm';
import { triggerSuccessFeedback } from '../utils/feedback';
import { createId } from '../utils/ids';
import { PlusInput } from './PlusUI';
import { IconButton, StudioAction, StudioTitle, studioColors, studioStyles } from './StudioUI';

export function StudioCapture({ writer, center, onClose, onSaved }: {
  writer: GardenV3Writer; center?: { id: string; label: string }; onClose: () => void; onSaved: () => void;
}) {
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [tags, setTags] = React.useState('');
  const [details, setDetails] = React.useState(false);
  const [notice, setNotice] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const saving = React.useRef(false);
  const [ids] = React.useState(() => ({ commandId: createId(), seedId: createId() }));
  const insets = useSafeAreaInsets();

  function close() {
    if (!(title.trim() || body.trim() || tags.trim())) { onClose(); return; }
    showConfirm('書きかけを破棄しますか？', '入力した内容はまだ保存されていません。',
      [{ text: '書き続ける', style: 'cancel' }, { text: '破棄する', style: 'destructive', onPress: onClose }]);
  }

  async function save() {
    if (saving.current || !body.trim()) return;
    saving.current = true; setBusy(true); setNotice('');
    try {
      const args = { ...ids, input: { title, body, tags: tags.split(/[、，,]/u) }, now: new Date().toISOString() };
      const command = center ? captureAndConnect({ ...args, centerId: center.id }) : captureSeed(args);
      const result = await writer.run(withCoreCommand(command));
      if (result.ok) { Keyboard.dismiss(); triggerSuccessFeedback(); onSaved(); }
      else setNotice(result.detail === 'missing_center' ? 'つなぎ先のメモを確認できません。' : 'メモを保存できませんでした。入力は残っています。');
    } finally { saving.current = false; setBusy(false); }
  }

  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top} style={studioStyles.root}>
    <ScrollView style={studioStyles.root} contentContainerStyle={studioStyles.content} keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}>
      <StudioTitle title="メモを書く" subtitle={center ? `「${center.label}」につなげる` : undefined}>
        <IconButton label="メモの入力を閉じる" icon="close" disabled={busy} onPress={close} />
      </StudioTitle>
      <PlusInput accessibilityLabel="比較メモの本文" placeholder="気づいたことを、ひとこと" multiline autoFocus
        value={body} onChangeText={setBody} editable={!busy} />
      <View style={studioStyles.wrap}>
        <StudioAction label="題名・カテゴリ" title={title.trim() || tags.trim() ? '題名・カテゴリを編集' : '題名・カテゴリ（任意）'}
          icon={details ? 'chevron-up' : 'chevron-down'} expanded={details} disabled={busy} onPress={() => setDetails(!details)} />
      </View>
      {details && <>
        <PlusInput accessibilityLabel="比較メモの題名" placeholder="題名（任意）" value={title} onChangeText={setTitle} editable={!busy} />
        <PlusInput accessibilityLabel="比較メモのカテゴリ" placeholder="カテゴリ（任意）" value={tags} onChangeText={setTags} editable={!busy} />
      </>}
      {notice !== '' && <Text accessibilityLiveRegion="polite" style={studioStyles.error}>{notice}</Text>}
    </ScrollView>
    <View style={styles.footer}>
      <StudioAction primary label={center ? '保存してつなぐ' : 'メモを保存'} icon="checkmark" disabled={busy || !body.trim()}
        onPress={() => void save()} />
    </View>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  footer: { width: '100%', maxWidth: 840, alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: studioColors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: studioColors.rule },
});
