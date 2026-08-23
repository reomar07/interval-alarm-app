import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  Switch,
  ScrollView,
  StatusBar,
  Alert,
  Vibration
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    priority: Notifications.AndroidNotificationPriority.MAX,
  }),
});

const TONES = [
  { id: 'default', name: 'Standard Bell' },
  { id: 'radar', name: 'Radar Pulse' },
  { id: 'chime', name: 'Gentle Chime' },
  { id: 'siren', name: 'Heavy Alarm' }
];

export default function App() {
  const [alarms, setAlarms] = useState([]);
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('08:00');
  const [intervalDays, setIntervalDays] = useState('20');
  const [startOffset, setStartOffset] = useState(0);
  const [selectedTone, setSelectedTone] = useState('default');
  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    loadAlarms();
    setupNotificationChannel();
    const interval = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const setupNotificationChannel = async () => {
    await Notifications.requestPermissionsAsync();
    await Notifications.setNotificationChannelAsync('interval-alarm-channel', {
      name: 'Interval Alarms',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500, 250, 1000],
      sound: 'default',
      enableLights: true,
      lightColor: '#6366F1',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
    });
  };

  const loadAlarms = async () => {
    const data = await AsyncStorage.getItem('@interval_alarms_v2');
    if (data) setAlarms(JSON.parse(data));
  };

  const calculateFirstTarget = (timeStr, offsetDays) => {
    const [h, m] = timeStr.split(':').map(Number);
    const target = new Date();
    target.setDate(target.getDate() + offsetDays);
    target.setHours(h || 8, m || 0, 0, 0);

    if (offsetDays === 0 && target <= new Date()) {
      target.setDate(target.getDate() + 1);
    }
    return target;
  };

  const scheduleNotification = async (alarm) => {
    const target = new Date(alarm.nextTriggerDate);
    const triggerSeconds = Math.max(1, Math.floor((target.getTime() - Date.now()) / 1000));

    const notifId = await Notifications.scheduleNotificationAsync({
      content: {
        title: `🚨 ${alarm.title || 'Interval Alarm'}`,
        body: `Interval Target reached! Recurring every ${alarm.intervalDays} days.`,
        sound: 'default',
        channelId: 'interval-alarm-channel',
        priority: Notifications.AndroidNotificationPriority.MAX,
        vibrate: [0, 500, 250, 500, 250, 1000],
      },
      trigger: { seconds: triggerSeconds },
    });
    return notifId;
  };

  const addAlarm = async () => {
    const days = parseInt(intervalDays, 10);
    if (isNaN(days) || days <= 0) return;

    const firstTarget = calculateFirstTarget(time, startOffset);
    const newAlarm = {
      id: Date.now().toString(),
      title: title.trim() || `Routine (${days}d loop)`,
      time: time.trim() || '08:00',
      intervalDays: days,
      tone: selectedTone,
      nextTriggerDate: firstTarget.toISOString(),
      enabled: true,
    };

    const notifId = await scheduleNotification(newAlarm);
    newAlarm.notifId = notifId;

    const updated = [newAlarm, ...alarms];
    setAlarms(updated);
    await AsyncStorage.setItem('@interval_alarms_v2', JSON.stringify(updated));
    setTitle('');
  };

  const toggleAlarm = async (id) => {
    const updated = await Promise.all(alarms.map(async (item) => {
      if (item.id === id) {
        const nextState = !item.enabled;
        if (!nextState && item.notifId) {
          await Notifications.cancelScheduledNotificationAsync(item.notifId);
        } else if (nextState) {
          const newNotifId = await scheduleNotification(item);
          return { ...item, enabled: nextState, notifId: newNotifId };
        }
        return { ...item, enabled: nextState };
      }
      return item;
    }));

    setAlarms(updated);
    await AsyncStorage.setItem('@interval_alarms_v2', JSON.stringify(updated));
  };

  const testAlarmNow = async () => {
    Vibration.vibrate([0, 500, 250, 500]);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🔔 Test Alarm Triggered',
        body: 'Audio and heavy vibration pattern are active!',
        channelId: 'interval-alarm-channel',
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
      trigger: { seconds: 1 },
    });
  };

  const deleteAlarm = async (id) => {
    const target = alarms.find(a => a.id === id);
    if (target?.notifId) await Notifications.cancelScheduledNotificationAsync(target.notifId);
    const filtered = alarms.filter((a) => a.id !== id);
    setAlarms(filtered);
    await AsyncStorage.setItem('@interval_alarms_v2', JSON.stringify(filtered));
  };

  const getRemainingTime = (isoString) => {
    const diff = new Date(isoString).getTime() - currentTime;
    if (diff <= 0) return 'Due now';
    const d = Math.floor(diff / (1000 * 60 * 60 * 24));
    const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const m = Math.floor((diff / (1000 * 60)) % 60);
    const s = Math.floor((diff / 1000) % 60);
    return `${d}d ${h}h ${m}m ${s}s`;
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.header}>Interval<Text style={{ color: '#6366F1' }}>Sync</Text></Text>
          <Text style={styles.subHeader}>Precision Multi-Day Scheduler</Text>
        </View>
        <TouchableOpacity style={styles.testBtn} onPress={testAlarmNow}>
          <Text style={styles.testBtnText}>⚡ Test</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>CREATE RECURRING ALARM</Text>

          <TextInput
            placeholder="Label (e.g., Workout Cycle, Filter Change)"
            placeholderTextColor="#64748B"
            value={title}
            onChangeText={setTitle}
            style={styles.input}
          />

          <View style={styles.inlineInputs}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.fieldLabel}>Time (24h)</Text>
              <TextInput
                placeholder="08:00"
                placeholderTextColor="#64748B"
                value={time}
                onChangeText={setTime}
                style={styles.inputCompact}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Interval (Days)</Text>
              <TextInput
                placeholder="20"
                placeholderTextColor="#64748B"
                value={intervalDays}
                keyboardType="numeric"
                onChangeText={setIntervalDays}
                style={styles.inputCompact}
              />
            </View>
          </View>

          <View style={styles.chipsRow}>
            {[3, 7, 14, 21, 30].map((d) => (
              <TouchableOpacity
                key={d}
                style={[styles.chip, intervalDays === d.toString() && styles.chipActive]}
                onPress={() => setIntervalDays(d.toString())}
              >
                <Text style={[styles.chipText, intervalDays === d.toString() && styles.chipTextActive]}>{d}d</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Alarm Tone Preset</Text>
          <View style={styles.chipsRow}>
            {TONES.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={[styles.chip, selectedTone === t.id && styles.chipActive]}
                onPress={() => setSelectedTone(t.id)}
              >
                <Text style={[styles.chipText, selectedTone === t.id && styles.chipTextActive]}>{t.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>First Ring</Text>
          <View style={styles.startSegment}>
            {[
              { label: 'Today', val: 0 },
              { label: 'Tomorrow', val: 1 },
              { label: '+2 Days', val: 2 },
            ].map((opt) => (
              <TouchableOpacity
                key={opt.val}
                style={[styles.segmentBtn, startOffset === opt.val && styles.segmentBtnActive]}
                onPress={() => setStartOffset(opt.val)}
              >
                <Text style={[styles.segmentText, startOffset === opt.val && styles.segmentTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.primaryButton} onPress={addAlarm}>
            <Text style={styles.primaryButtonText}>Set Interval Alarm</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionLabel, { marginTop: 24, marginBottom: 12 }]}>SCHEDULED ALARMS</Text>
        {alarms.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No active interval alarms yet.</Text>
          </View>
        ) : (
          alarms.map((item) => (
            <View key={item.id} style={[styles.alarmCard, !item.enabled && styles.alarmCardDisabled]}>
              <View style={{ flex: 1 }}>
                <View style={styles.tagRow}>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>Every {item.intervalDays} Days</Text>
                  </View>
                  <View style={styles.countdownBadge}>
                    <Text style={styles.countdownText}>⏳ {getRemainingTime(item.nextTriggerDate)}</Text>
                  </View>
                </View>
                <Text style={[styles.alarmTime, !item.enabled && { color: '#64748B' }]}>{item.time}</Text>
                <Text style={styles.alarmTitle}>{item.title}</Text>
              </View>

              <View style={styles.actionsColumn}>
                <Switch
                  value={item.enabled}
                  onValueChange={() => toggleAlarm(item.id)}
                  trackColor={{ false: '#334155', true: '#4F46E5' }}
                  thumbColor={item.enabled ? '#818CF8' : '#94A3B8'}
                />
                <TouchableOpacity onPress={() => deleteAlarm(item.id)} style={styles.deleteBtn}>
                  <Text style={styles.deleteText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090D16', paddingHorizontal: 20, paddingTop: 50 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  header: { fontSize: 26, fontWeight: '800', color: '#F8FAFC', letterSpacing: -0.5 },
  subHeader: { color: '#64748B', fontSize: 12, marginTop: 2 },
  testBtn: { backgroundColor: '#1E1B4B', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#4338CA' },
  testBtnText: { color: '#C7D2FE', fontWeight: '700', fontSize: 13 },
  card: { backgroundColor: '#111827', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#1F2937' },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: '#64748B', letterSpacing: 1, marginBottom: 12 },
  input: { backgroundColor: '#0B0F19', color: '#F8FAFC', padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#1E293B', marginBottom: 14, fontSize: 15 },
  inlineInputs: { flexDirection: 'row', marginBottom: 12 },
  fieldLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '600', marginBottom: 6 },
  inputCompact: { backgroundColor: '#0B0F19', color: '#F8FAFC', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#1E293B', fontSize: 16, fontWeight: '600' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: { backgroundColor: '#1E293B', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8 },
  chipActive: { backgroundColor: '#4338CA' },
  chipText: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: '#EEF2FF' },
  startSegment: { flexDirection: 'row', backgroundColor: '#0B0F19', borderRadius: 10, padding: 4, marginBottom: 16, borderWidth: 1, borderColor: '#1E293B' },
  segmentBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  segmentBtnActive: { backgroundColor: '#312E81' },
  segmentText: { color: '#64748B', fontSize: 12, fontWeight: '700' },
  segmentTextActive: { color: '#C7D2FE' },
  primaryButton: { backgroundColor: '#4F46E5', paddingVertical: 14, borderRadius: 10, alignItems: 'center', elevation: 4 },
  primaryButtonText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: '#475569', fontSize: 14 },
  alarmCard: { backgroundColor: '#111827', borderRadius: 14, padding: 16, marginBottom: 12, flexDirection: 'row', borderWidth: 1, borderColor: '#1F2937', alignItems: 'center' },
  alarmCardDisabled: { opacity: 0.5 },
  tagRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  badge: { backgroundColor: '#1E1B4B', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeText: { color: '#818CF8', fontSize: 11, fontWeight: '700' },
  countdownBadge: { backgroundColor: '#0B0F19', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#1E293B' },
  countdownText: { color: '#38BDF8', fontSize: 11, fontWeight: '600' },
  alarmTime: { fontSize: 28, fontWeight: '800', color: '#F8FAFC' },
  alarmTitle: { color: '#94A3B8', fontSize: 13, marginTop: 2 },
  actionsColumn: { alignItems: 'flex-end', justifyContent: 'space-between', height: 65 },
  deleteBtn: { marginTop: 8 },
  deleteText: { color: '#EF4444', fontSize: 12, fontWeight: '600' }
});
