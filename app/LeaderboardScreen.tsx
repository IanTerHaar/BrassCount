import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../constants/theme';

const MOCK_FRIENDS = [
  { id: '1', name: 'You', avgSplit: '0.38s', sessions: 12, rank: 1 },
  { id: '2', name: 'Jaco V.', avgSplit: '0.41s', sessions: 9, rank: 2 },
  { id: '3', name: 'Riaan M.', avgSplit: '0.44s', sessions: 15, rank: 3 },
  { id: '4', name: 'Stefan B.', avgSplit: '0.47s', sessions: 6, rank: 4 },
  { id: '5', name: 'Pieter N.', avgSplit: '0.51s', sessions: 8, rank: 5 },
];

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

export default function LeaderboardScreen() {
  const [tab, setTab] = useState<'friends' | 'global'>('friends');

  return (
    <View style={styles.container}>
      {/* Tab Toggle */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'friends' && styles.tabActive]}
          onPress={() => setTab('friends')}
        >
          <Text style={[styles.tabText, tab === 'friends' && styles.tabTextActive]}>Friends</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'global' && styles.tabActive]}
          onPress={() => setTab('global')}
        >
          <Text style={[styles.tabText, tab === 'global' && styles.tabTextActive]}>Global</Text>
        </TouchableOpacity>
      </View>

      {/* Leaderboard List */}
      <FlatList
        data={MOCK_FRIENDS}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={[styles.row, item.name === 'You' && styles.rowHighlight]}>
            <Text style={styles.rank}>{MEDAL[item.rank] ?? `#${item.rank}`}</Text>
            <View style={styles.info}>
              <Text style={[styles.name, item.name === 'You' && styles.nameYou]}>{item.name}</Text>
              <Text style={styles.sessions}>{item.sessions} sessions</Text>
            </View>
            <Text style={styles.split}>{item.avgSplit}</Text>
          </View>
        )}
      />

      {/* Invite Button */}
      <TouchableOpacity style={styles.inviteBtn}>
        <Text style={styles.inviteBtnText}>+ Invite Friends</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: SPACING.md },
  tabs: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.md,
    padding: 4,
  },
  tab: { flex: 1, paddingVertical: SPACING.sm, alignItems: 'center', borderRadius: RADIUS.sm },
  tabActive: { backgroundColor: COLORS.accent },
  tabText: { color: COLORS.textMuted, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  list: { gap: SPACING.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.md,
  },
  rowHighlight: { borderWidth: 1, borderColor: COLORS.accent },
  rank: { fontSize: 22, width: 36, textAlign: 'center' },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  nameYou: { color: COLORS.accent },
  sessions: { fontSize: 12, color: COLORS.textMuted },
  split: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  inviteBtn: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inviteBtnText: { color: COLORS.accent, fontWeight: '700', fontSize: 15 },
});
