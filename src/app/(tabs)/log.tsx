import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useRef, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import BottomSheet from '../../components/BottomSheet';
import Disclosure from '../../components/Disclosure';
import { Button, Card, Meta, Screen, Section, T } from '../../components/ui';
import { scanTimeLabel } from '../../domain/dates';
import { EMPTY_FOOD, FoodDetails, FoodEntry, FoodSignal, PhotoKind } from '../../domain/food';
import { readFoodPhoto } from '../../domain/readFoodPhoto';
import { useFoodLog } from '../../state/foodLog';
import { colors, font, radius, space } from '../../theme/tokens';

export default function Log() {
  const { entries, loading, error, save, remove } = useFoodLog();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FoodDetails>({ ...EMPTY_FOOD });
  const [editing, setEditing] = useState<FoodEntry | null>(null);
  const [source, setSource] = useState<'manual' | PhotoKind>('manual');
  const [minutes, setMinutes] = useState('');
  const [atLeast, setAtLeast] = useState(false);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [deleted, setDeleted] = useState<FoodEntry | null>(null);
  const working = useRef(false);
  const cancelReading = useRef<(() => void) | null>(null);
  useEffect(() => () => {
    if (Platform.OS === 'web' && preview.startsWith('blob:')) URL.revokeObjectURL(preview);
  }, [preview]);
  const duration = Number(minutes);
  const validDuration = /^\d{1,3}$/.test(minutes) && duration >= 1 && duration <= 720;
  const start = (kind: 'manual' | PhotoKind, entry?: FoodEntry) => {
    setDraft(entry ? { name: entry.name, sugar: entry.sugar, acidic: entry.acidic, sticky: entry.sticky, note: entry.note } : { ...EMPTY_FOOD });
    setEditing(entry ?? null);
    setSource(entry?.source ?? kind);
    setMinutes(entry ? String(entry.durationMinutes) : '');
    setAtLeast(entry?.durationAtLeast ?? false);
    setPreview(''); setMessage(''); setProgress(''); setOpen(true);
  };
  const photo = async (camera: boolean) => {
    if (working.current || source === 'manual') return;
    working.current = true; setBusy(true); setMessage('');
    try {
      if (camera && Platform.OS !== 'web') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) { setMessage('Camera access is off. Choose an existing photo or type the food name.'); return; }
      }
      // On web this call stays in the button gesture so mobile capture/file pickers open reliably.
      const result = await (camera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync)({ mediaTypes: ['images'], cameraType: ImagePicker.CameraType.back, quality: 0.85, exif: false, allowsMultipleSelection: false });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if ((asset.fileSize ?? 0) > 25000000 || asset.width * asset.height > 60000000) throw new Error('Choose a smaller photo (under 25 MB) or type the food name.');
      const context = ImageManipulator.manipulate(asset.uri);
      const edge = source === 'label' ? 1600 : 1024;
      if (asset.width > edge || asset.height > edge) context.resize(asset.width >= asset.height ? { width: edge } : { height: edge });
      const rendered = await context.renderAsync();
      const output = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
      rendered.release(); context.release();
      setPreview(output.uri);
      let timer: ReturnType<typeof setTimeout> | undefined;
      let reading = true;
      try {
        const suggestion = await Promise.race([
          readFoodPhoto(output.uri, source, text => { if (reading) setProgress(text); }),
          new Promise<never>((_, reject) => {
            cancelReading.current = () => reject(new Error('Photo reading stopped. Type the food name to keep going.'));
            timer = setTimeout(() => reject(new Error('Photo reading took too long. Type the food name or try again on a faster connection.')), 45000);
          }),
        ]);
        setDraft(suggestion);
      } finally { reading = false; clearTimeout(timer); cancelReading.current = null; }
      setMessage('Check the suggestion, then add your eating or sipping time.');
    } catch (err) {
      setMessage(err instanceof Error && /couldn’t identify|label is hard|Photo suggestions|Photo reading|Choose a smaller/i.test(err.message) ? err.message : 'The photo reader couldn’t load. Check your connection or type the food name to keep going.');
    } finally { working.current = false; setBusy(false); setProgress(''); }
  };
  const persist = async () => {
    if (working.current || !draft.name.trim() || !validDuration) return;
    working.current = true; setBusy(true); setMessage('');
    try {
      const now = new Date();
      await save({ ...draft, name: draft.name.trim(), id: editing?.id ?? `food-${now.getTime()}-${Math.random().toString(36).slice(2, 10)}`, at: editing?.at ?? now.toISOString(), durationMinutes: duration, durationAtLeast: atLeast, source });
      setOpen(false); setPreview(''); setNotice(editing ? 'Entry updated.' : 'Added to your log.'); setDeleted(null);
    } catch { setMessage('Couldn’t save this entry. Your draft is still here; please try again. Your device may be out of storage.'); }
    finally { working.current = false; setBusy(false); }
  };
  const erase = async () => {
    if (!editing || working.current) return;
    working.current = true; setBusy(true);
    try { await remove(editing.id); setDeleted(editing); setNotice('Entry deleted.'); setOpen(false); }
    catch { setMessage('Couldn’t delete this entry. Please try again.'); }
    finally { working.current = false; setBusy(false); }
  };
  const recent = entries.filter((entry, index, all) => all.findIndex(item => item.name.toLowerCase() === entry.name.toLowerCase()) === index).slice(0, 3);
  return (
    <>
      <Screen>
        <View style={{ paddingHorizontal: space.lg }}>
          <T v="display">Log</T>
        </View>
        <Section>
          <Card>
            <Button label="Type a quick entry" icon="log" onPress={() => start('manual')} disabled={loading || !!error} />
            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
              <Button label="Meal photo" icon="camera" kind="secondary" style={{ flex: 1, paddingHorizontal: 8 }} onPress={() => start('meal')} disabled={loading || !!error} />
              <Button label="Label photo" icon="label" kind="secondary" style={{ flex: 1, paddingHorizontal: 8 }} onPress={() => start('label')} disabled={loading || !!error} />
            </View>
          </Card>
          {loading ? <Meta style={{ marginTop: space.sm }}>Opening your log…</Meta> : null}
          {error ? <T v="small" style={{ marginTop: space.sm }}>{error}</T> : null}
          {notice ? <View accessibilityLiveRegion="polite" style={{ marginTop: space.md }}><T v="small">{notice}</T>{deleted ? <Button kind="ghost" label="Undo deletion" onPress={async () => { try { await save(deleted); setDeleted(null); setNotice('Entry restored.'); } catch { setNotice('Couldn’t restore the entry. Please try again.'); } }} /> : null}</View> : null}
        </Section>
        {recent.length ? <Section title="Have it again?">
          <View style={{ gap: space.sm }}>{recent.map(entry => <Button key={entry.id} label={`${entry.name} +`} kind="secondary" onPress={() => { start('manual'); setDraft({ name: entry.name, sugar: entry.sugar, acidic: entry.acidic, sticky: entry.sticky, note: entry.note }); }} />)}</View>
        </Section> : null}
        <Section title="Your entries">
          {!entries.length ? <Card><T v="body">No entries yet.</T></Card> : <View style={{ gap: space.sm }}>{entries.slice(0, 15).map(entry => <Card key={entry.id} onPress={() => start(entry.source, entry)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}><T v="bodyStrong" style={{ flex: 1 }}>{entry.name}</T><T v="body" style={{ fontSize: 14 }}>Edit ›</T></View>
            <Meta style={{ marginTop: 4 }}>{scanTimeLabel(entry.at)} · {entry.durationAtLeast ? 'at least ' : ''}{entry.durationMinutes} min</Meta>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm }}>
              {entry.sugar === 'yes' ? <T v="small">Sugar noted</T> : null}
              {entry.acidic === 'yes' ? <T v="small">Possible acid exposure</T> : null}
              {entry.sticky === 'yes' ? <T v="small">Sticky texture</T> : null}
            </View>
          </Card>)}{entries.length > 15 ? <Disclosure title={`Older entries (${entries.length - 15})`}>{entries.slice(15).map(entry => <Button key={entry.id} label={`${entry.name} · ${entry.durationMinutes} min`} kind="ghost" onPress={() => start(entry.source, entry)} />)}</Disclosure> : null}</View>}
          <View style={{ marginTop: space.lg }}><Disclosure title="Storage & privacy"><T v="body">Entries stay on this device; photos aren’t saved in your log. Clearing app or browser storage deletes your entries.</T></Disclosure></View>
        </Section>
      </Screen>
      <BottomSheet open={open} onClose={() => { if (!busy) setOpen(false); }} maxHeight={0.92}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><T v="title">{editing ? 'Edit entry' : source === 'label' ? 'Read a label' : source === 'meal' ? 'Log from a photo' : 'Quick entry'}</T><Button label="Close" compact kind="ghost" disabled={busy} onPress={() => setOpen(false)} /></View>
        {source !== 'manual' ? <View style={{ marginTop: space.md }}>
          <T v="small">{source === 'label' ? 'Include the product name, sugars and ingredients.' : 'Review the food name before saving.'}</T>
          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}><Button label="Take photo" icon="camera" style={{ flex: 1, paddingHorizontal: 8 }} disabled={busy} onPress={() => photo(true)} /><Button label="Choose photo" kind="secondary" style={{ flex: 1, paddingHorizontal: 8 }} disabled={busy} onPress={() => photo(false)} /></View>
          <Meta style={{ marginTop: space.sm }}>{Platform.OS === 'web' ? 'Read on your device. Internet needed on first use.' : 'Photo suggestions work in the web demo.'}</Meta>
          {preview ? <Image source={{ uri: preview }} accessibilityLabel="Selected food or label photo" style={{ height: 110, borderRadius: radius.sm, marginTop: space.sm }} resizeMode="contain" /> : null}
        </View> : null}
        {busy && progress ? <View style={{ marginTop: space.md }}><T v="small" accessibilityLiveRegion="polite">{progress}</T><Button label="Type it instead" kind="ghost" onPress={() => cancelReading.current?.()} /></View> : null}
        {message ? <T v="small" accessibilityLiveRegion="polite" style={{ marginTop: space.md }}>{message}</T> : null}
        <T v="bodyStrong" style={{ marginTop: space.lg }}>Food or drink</T>
        <TextInput autoFocus={source === 'manual'} returnKeyType="done" editable={!busy} value={draft.name} onChangeText={name => setDraft(current => ({ ...current, name }))} placeholder="e.g. coffee with sugar, toast" placeholderTextColor={colors.textMuted} maxLength={120} accessibilityLabel="Food or drink name" style={styles.input} />
        <T v="bodyStrong" style={{ marginTop: space.lg }}>How long did you eat or sip?</T>
        <T v="small" style={{ marginTop: 4 }}>First bite or sip to last.</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md }}>{[5, 15, 30, 60].map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: duration === value && (value !== 60 || atLeast), disabled: busy }} disabled={busy} onPress={() => { setMinutes(String(value)); setAtLeast(value === 60); }} style={[styles.chip, duration === value && (value !== 60 || atLeast) && styles.selected]}><T v="small">{value === 60 ? '60+ min' : `${value} min`}</T></Pressable>)}</View>
        <TextInput editable={!busy} value={minutes} onChangeText={value => { setMinutes(value.replace(/\D/g, '')); setAtLeast(false); }} keyboardType="number-pad" maxLength={3} placeholder="Or enter minutes" placeholderTextColor={colors.textMuted} accessibilityLabel="Eating or sipping duration in minutes" style={styles.input} />
        {minutes && !validDuration ? <T v="small">Enter 1–720 minutes.</T> : null}
        <View style={{ marginTop: space.md }}><Disclosure title="Sugar, acid & texture">
          {(['sugar', 'acidic', 'sticky'] as const).map(key => <View key={key} style={{ marginTop: space.md }}><T v="small">{key === 'sugar' ? 'Contains sugar?' : key === 'acidic' ? 'Possibly acidic?' : 'Sticky texture?'}</T><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm }}>{(['yes', 'no', 'unknown'] as FoodSignal[]).map(signal => <Pressable key={signal} accessibilityRole="button" accessibilityState={{ selected: draft[key] === signal, disabled: busy }} disabled={busy} onPress={() => setDraft(current => ({ ...current, [key]: signal }))} style={[styles.chip, draft[key] === signal && styles.selected]}><T v="small">{signal === 'unknown' ? 'Unsure' : signal === 'yes' ? 'Yes' : 'No'}</T></Pressable>)}</View></View>)}
          <TextInput editable={!busy} multiline maxLength={240} value={draft.note} onChangeText={note => setDraft(current => ({ ...current, note }))} placeholder="Optional note" placeholderTextColor={colors.textMuted} accessibilityLabel="Optional food note" style={[styles.input, { minHeight: 70 }]} />
        </Disclosure></View>
        <Button style={{ marginTop: space.md }} label={busy ? progress ? 'Reading photo…' : 'Saving…' : !validDuration ? 'Choose eating time to save' : editing ? 'Save changes' : 'Save to log'} disabled={busy || loading || !!error || !draft.name.trim() || !validDuration} onPress={persist} />
        {editing ? <Button label="Delete entry" kind="ghost" disabled={busy} onPress={erase} style={{ marginTop: space.sm }} /> : null}
      </BottomSheet>
    </>
  );
}
const styles = StyleSheet.create({
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.bg2, color: colors.text, padding: space.md, marginTop: space.sm, minHeight: 48, fontFamily: font.family, fontSize: 15 },
  chip: { minHeight: 44, paddingHorizontal: space.md, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg2 },
  selected: { borderColor: colors.textSecondary, backgroundColor: colors.surfaceRaised },
});
