import React, { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { SyncthingProvider } from './src/daemon/SyncthingContext';
import { EventsProvider } from './src/daemon/EventsContext';
import { RecentChangesProvider } from './src/daemon/RecentChangesContext';
import { SyncNotifier } from './src/daemon/SyncNotifier';
import { StatusScreen } from './src/screens/StatusScreen';
import { FoldersScreen } from './src/screens/FoldersScreen';
import { DevicesScreen } from './src/screens/DevicesScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { SearchModal } from './src/screens/SearchModal';
import { CoachProvider, useCoach, type CoachTabKey } from './src/onboarding/coach/CoachContext';
import { CoachOverlay } from './src/onboarding/coach/CoachOverlay';
import { useOnboarding } from './src/onboarding/useOnboarding';
import { colors } from './src/components/ui';

type Tab = 'status' | 'folders' | 'devices' | 'settings';

const TABS: readonly { key: Tab; label: string }[] = [
  { key: 'status', label: 'Status' },
  { key: 'folders', label: 'Folders' },
  { key: 'devices', label: 'Devices' },
  { key: 'settings', label: 'Settings' },
];

export default function App() {
  return (
    <SafeAreaProvider>
      <SyncthingProvider>
        <EventsProvider>
          <RecentChangesProvider>
            <SyncNotifier />
            <Shell />
          </RecentChangesProvider>
        </EventsProvider>
      </SyncthingProvider>
    </SafeAreaProvider>
  );
}

function Shell() {
  const [tab, setTab] = useState<Tab>('status');
  const [searchOpen, setSearchOpen] = useState(false);
  const onboarding = useOnboarding();

  const handleSetTab = useCallback((next: CoachTabKey) => setTab(next), []);
  const handleOnboardingDone = useCallback(() => {
    onboarding.complete();
  }, [onboarding]);

  return (
    <CoachProvider onSetTab={handleSetTab} onDone={handleOnboardingDone}>
      <CoachAutoStart pending={onboarding.state === 'pending'} />
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <Text style={styles.title}>SyncUp</Text>
          <TouchableOpacity onPress={() => setSearchOpen(true)} hitSlop={10}>
            <Text style={styles.searchIcon}>🔍</Text>
          </TouchableOpacity>
        </View>
        {searchOpen && <SearchModal visible onClose={() => setSearchOpen(false)} />}

        <View style={styles.screen}>
          {tab === 'status' && <StatusScreen />}
          {tab === 'folders' && <FoldersScreen />}
          {tab === 'devices' && <DevicesScreen />}
          {tab === 'settings' && <SettingsScreen />}
        </View>

        <SafeAreaView edges={['bottom']} style={styles.tabBarSafeArea}>
          <View style={styles.tabBar}>
            {TABS.map(t => (
              <TouchableOpacity
                key={t.key}
                style={[styles.tab, tab === t.key && styles.tabActive]}
                onPress={() => setTab(t.key)}
              >
                <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </SafeAreaView>
      </SafeAreaView>

      <CoachOverlay />
    </CoachProvider>
  );
}

/** Kicks the coach off once the onboarding gate resolves to 'pending'. */
function CoachAutoStart({ pending }: { pending: boolean }) {
  const coach = useCoach();
  const startedRef = React.useRef(false);
  useEffect(() => {
    if (pending && !startedRef.current && !coach.active) {
      startedRef.current = true;
      coach.start();
    }
  }, [pending, coach]);
  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
  },
  title: { color: colors.text, fontSize: 28, fontWeight: '700' },
  searchIcon: { fontSize: 20 },
  screen: { flex: 1 },
  tabBarSafeArea: {
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  tabBar: {
    flexDirection: 'row',
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderTopWidth: 2,
    borderTopColor: 'transparent',
  },
  tabActive: { borderTopColor: colors.accent },
  tabText: { color: colors.textDim, fontSize: 13, fontWeight: '500' },
  tabTextActive: { color: colors.accent, fontWeight: '600' },
});
