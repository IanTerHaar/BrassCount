import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../constants/theme';

export default function HomeScreen() {
  const recentSessions = [
    { id: '1', date: 'Jun 4, 2026', shots: 30, avgSplit: '0.42s', range: 'Cape Town Shooting Range' },
    { id: '2', date: 'Jun 1, 2026', shots: 50, avgSplit: '0.38s', range: 'Indoor Range SA' },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.greeting}>Welcome back 👋</Text>
      <Text style={styles.subtitle}>Ready to log a session?</Text>

      {/* Quick Start Button */}
      <TouchableOpacity style={styles.startButton}>
        <Text style={styles.startButtonText}>⏱ Start Shot Timer</Text>
      </TouchableOpacity>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>142</Text>
          <Text style={styles.statLabel}>Total Shots</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>0.40s</Text>
          <Text style={styles.statLabel}>Avg Split</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>#3</Text>
          <Text style={styles.statLabel}>Rank</Text>
        </View>
      </View>

      {/* Recent Sessions */}
      <Text style={styles.sectionTitle}>Recent Sessions</Text>
      {recentSessions.map((session) => (
        <TouchableOpacity key={session.id} style={styles.sessionCard}>
          <View>
            <Text style={styles.sessionDate}>{session.date}</Text>
            <Text style={styles.sessionRange}>{session.range}</Text>
          </View>
          <View style={styles.sessionStats}>
            <Text style={styles.sessionStat}>{session.shots} shots</Text>
            <Text style={styles.sessionSplit}>{session.avgSplit} avg</Text>
          </View>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.md },
  greeting: { fontSize: 26, fontWeight: '700', color: COLORS.text, marginTop: SPACING.sm },
  subtitle: { fontSize: 14, color: COLORS.textMuted, marginBottom: SPACING.lg },
  startButton: {
    backgroundColor: COLORS.accent,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  startButtonText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
  },
  statValue: { fontSize: 22, fontWeight: '800', color: COLORS.accent },
  statLabel: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.sm },
  sessionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sessionDate: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  sessionRange: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  sessionStats: { alignItems: 'flex-end' },
  sessionStat: { fontSize: 13, color: COLORS.text },
  sessionSplit: { fontSize: 12, color: COLORS.accent, fontWeight: '600' },
});
