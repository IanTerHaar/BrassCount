import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../constants/theme';

export default function TimerScreen() {
  const [isRunning, setIsRunning] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [splits, setSplits] = useState<number[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = () => {
    const now = Date.now();
    setStartTime(now);
    setSplits([]);
    setIsRunning(true);
    intervalRef.current = setInterval(() => {
      setElapsed(Date.now() - now);
    }, 50);
  };

  const recordShot = () => {
    if (!isRunning || !startTime) return;
    const now = Date.now();
    const lastTime = splits.length === 0 ? startTime : startTime + splits.reduce((a, b) => a + b, 0);
    setSplits((prev) => [...prev, now - lastTime]);
  };

  const stop = () => {
    setIsRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  const reset = () => {
    stop();
    setSplits([]);
    setElapsed(0);
    setStartTime(null);
  };

  const formatTime = (ms: number) => (ms / 1000).toFixed(2) + 's';

  const avgSplit =
    splits.length > 1
      ? formatTime(splits.slice(1).reduce((a, b) => a + b, 0) / (splits.length - 1))
      : '--';

  return (
    <View style={styles.container}>
      {/* Timer Display */}
      <View style={styles.timerDisplay}>
        <Text style={styles.timerText}>{formatTime(elapsed)}</Text>
        <Text style={styles.timerLabel}>{isRunning ? 'Running...' : 'Ready'}</Text>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        {!isRunning ? (
          <TouchableOpacity style={styles.startBtn} onPress={start}>
            <Text style={styles.startBtnText}>START</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.shotBtn} onPress={recordShot}>
            <Text style={styles.shotBtnText}>SHOT</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.secondaryControls}>
        <TouchableOpacity style={styles.secondaryBtn} onPress={stop}>
          <Text style={styles.secondaryBtnText}>Stop</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={reset}>
          <Text style={styles.secondaryBtnText}>Reset</Text>
        </TouchableOpacity>
      </View>

      {/* Stats */}
      {splits.length > 0 && (
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statVal}>{splits.length}</Text>
            <Text style={styles.statLbl}>Shots</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statVal}>{avgSplit}</Text>
            <Text style={styles.statLbl}>Avg Split</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statVal}>{formatTime(Math.min(...splits))}</Text>
            <Text style={styles.statLbl}>Best Split</Text>
          </View>
        </View>
      )}

      {/* Split Log */}
      <ScrollView style={styles.splitLog}>
        {splits.map((split, i) => (
          <View key={i} style={styles.splitRow}>
            <Text style={styles.splitIndex}>#{i + 1}</Text>
            <Text style={styles.splitTime}>{formatTime(split)}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: SPACING.md },
  timerDisplay: { alignItems: 'center', paddingVertical: SPACING.xl },
  timerText: { fontSize: 64, fontWeight: '800', color: COLORS.accent, fontVariant: ['tabular-nums'] },
  timerLabel: { fontSize: 14, color: COLORS.textMuted, marginTop: SPACING.xs },
  controls: { alignItems: 'center', marginBottom: SPACING.md },
  startBtn: {
    backgroundColor: COLORS.success,
    width: 140,
    height: 140,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startBtnText: { color: '#fff', fontSize: 22, fontWeight: '800' },
  shotBtn: {
    backgroundColor: COLORS.accent,
    width: 140,
    height: 140,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shotBtnText: { color: '#fff', fontSize: 22, fontWeight: '800' },
  secondaryControls: { flexDirection: 'row', justifyContent: 'center', gap: SPACING.md, marginBottom: SPACING.lg },
  secondaryBtn: {
    backgroundColor: COLORS.surface,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
  },
  secondaryBtnText: { color: COLORS.textMuted, fontSize: 14 },
  statsRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  statBox: { flex: 1, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.sm, alignItems: 'center' },
  statVal: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  statLbl: { fontSize: 11, color: COLORS.textMuted },
  splitLog: { flex: 1 },
  splitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  splitIndex: { color: COLORS.textMuted, fontSize: 14 },
  splitTime: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
});
