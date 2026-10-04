import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Switch, Platform } from 'react-native';
import { Activity, X, ChevronDown, Trash2, CircleCheck, CircleAlert, Upload } from 'lucide-react-native';
import { theme } from '@/lib/theme';
import {
  subscribeToUploadEvents,
  clearUploadEvents,
  type UploadDebugEvent,
} from '@/lib/uploadDebugLogger';

interface UploadDebugOverlayProps {
  visible: boolean;
  onClose: () => void;
}

export function UploadDebugOverlay({ visible, onClose }: UploadDebugOverlayProps) {
  const [events, setEvents] = useState<UploadDebugEvent[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!visible) return;
    const unsub = subscribeToUploadEvents(setEvents);
    return unsub;
  }, [visible]);

  useEffect(() => {
    if (autoScroll && expanded && events.length > 0) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      });
    }
  }, [events, autoScroll, expanded]);

  const handleClear = useCallback(() => {
    clearUploadEvents();
  }, []);

  if (!visible) return null;

  const successCount = events.filter((e) => !e.error).length;
  const failCount = events.filter((e) => e.error).length;

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.panel}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Activity size={16} color={theme.colors.primary[400]} strokeWidth={2} />
            <Text style={styles.title}>Upload Network Debug</Text>
            <View style={styles.badgeRow}>
              <View style={[styles.badge, styles.badgeOk]}>
                <CircleCheck size={11} color="#10b981" strokeWidth={2.5} />
                <Text style={styles.badgeTextOk}>{successCount}</Text>
              </View>
              {failCount > 0 && (
                <View style={[styles.badge, styles.badgeFail]}>
                  <CircleAlert size={11} color="#ef4444" strokeWidth={2.5} />
                  <Text style={styles.badgeTextFail}>{failCount}</Text>
                </View>
              )}
            </View>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={handleClear} style={styles.iconBtn} hitSlop={8}>
              <Trash2 size={15} color={theme.colors.dark.textDim} strokeWidth={2} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setExpanded((v) => !v)} style={styles.iconBtn} hitSlop={8}>
              <ChevronDown
                size={16}
                color={theme.colors.dark.textDim}
                strokeWidth={2}
                style={{ transform: [{ rotate: expanded ? '0deg' : '180deg' }] }}
              />
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={styles.iconBtn} hitSlop={8}>
              <X size={16} color={theme.colors.dark.textDim} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        </View>

        {expanded && (
          <>
            <View style={styles.controls}>
              <View style={styles.autoScrollRow}>
                <Text style={styles.autoScrollLabel}>Auto-scroll</Text>
                <Switch
                  value={autoScroll}
                  onValueChange={setAutoScroll}
                  trackColor={{ false: theme.colors.dark.border, true: theme.colors.primary[600] }}
                />
              </View>
              <Text style={styles.eventCount}>{events.length} events</Text>
            </View>

            <ScrollView
              ref={scrollRef}
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {events.length === 0 ? (
                <View style={styles.emptyState}>
                  <Upload size={24} color={theme.colors.dark.textFaint} strokeWidth={1.5} />
                  <Text style={styles.emptyText}>No uploads yet</Text>
                  <Text style={styles.emptyHint}>Upload events will appear here in real-time</Text>
                </View>
              ) : (
                events.map((event) => <EventRow key={event.id} event={event} />)
              )}
            </ScrollView>
          </>
        )}
      </View>
    </View>
  );
}

function EventRow({ event }: { event: UploadDebugEvent }) {
  const [expanded, setExpanded] = useState(false);
  const isError = !!event.error;
  const statusColor = isError ? '#ef4444' : event.status && event.status < 300 ? '#10b981' : '#f59e0b';
  const sizeStr = event.fileSize ? `${(event.fileSize / 1024).toFixed(1)}KB` : '?';

  return (
    <TouchableOpacity
      onPress={() => setExpanded((v) => !v)}
      style={styles.eventRow}
      activeOpacity={0.7}
    >
      <View style={styles.eventTop}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <Text style={styles.eventMethod}>{event.method}</Text>
        <Text style={styles.eventPath} numberOfLines={1}>{event.path}</Text>
        <Text style={styles.eventSize}>{sizeStr}</Text>
        {event.latencyMs !== undefined && (
          <Text style={styles.eventLatency}>{event.latencyMs}ms</Text>
        )}
        {event.status !== undefined && (
          <Text style={[styles.eventStatus, { color: statusColor }]}>{event.status}</Text>
        )}
        {event.attempt !== undefined && event.attempt > 0 && (
          <Text style={styles.eventAttempt}>#{event.attempt + 1}</Text>
        )}
      </View>
      <Text style={styles.eventUrl} numberOfLines={expanded ? undefined : 1}>{event.url}</Text>
      {expanded && (
        <View style={styles.eventDetails}>
          <Text style={styles.eventDetailText}>Time: {event.timestamp}</Text>
          {event.fileUri && <Text style={styles.eventDetailText}>File: {event.fileUri}</Text>}
          {event.mimeType && <Text style={styles.eventDetailText}>MIME: {event.mimeType}</Text>}
          {event.requestHeaders && (
            <Text style={styles.eventDetailText}>
              Headers: {JSON.stringify(event.requestHeaders)}
            </Text>
          )}
          {event.responseBody && (
            <Text style={styles.eventDetailText}>Body: {event.responseBody}</Text>
          )}
          {event.error && (
            <Text style={[styles.eventDetailText, styles.eventErrorText]}>
              Error: {event.error}
            </Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 360,
    zIndex: 9999,
    elevation: 9999,
  },
  panel: {
    position: 'absolute',
    top: 60,
    right: 8,
    bottom: 80,
    width: 344,
    backgroundColor: 'rgba(10, 12, 20, 0.96)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    color: '#e5e7eb',
    letterSpacing: 0.3,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 4,
    marginLeft: 4,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeOk: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  badgeFail: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  badgeTextOk: {
    fontSize: 10,
    fontWeight: '700',
    color: '#10b981',
  },
  badgeTextFail: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ef4444',
  },
  iconBtn: {
    padding: 4,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  autoScrollRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  autoScrollLabel: {
    fontSize: 11,
    color: '#9ca3af',
  },
  eventCount: {
    fontSize: 11,
    color: '#6b7280',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 8,
    gap: 4,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 6,
  },
  emptyText: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '600',
  },
  emptyHint: {
    fontSize: 11,
    color: '#4b5563',
  },
  eventRow: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    padding: 8,
    gap: 4,
  },
  eventTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexWrap: 'wrap',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  eventMethod: {
    fontSize: 10,
    fontWeight: '700',
    color: '#a78bfa',
  },
  eventPath: {
    fontSize: 10,
    color: '#60a5fa',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  eventSize: {
    fontSize: 10,
    color: '#9ca3af',
  },
  eventLatency: {
    fontSize: 10,
    color: '#fbbf24',
  },
  eventStatus: {
    fontSize: 10,
    fontWeight: '700',
  },
  eventAttempt: {
    fontSize: 10,
    color: '#f59e0b',
    fontWeight: '600',
  },
  eventUrl: {
    fontSize: 10,
    color: '#4b5563',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  eventDetails: {
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    gap: 2,
  },
  eventDetailText: {
    fontSize: 10,
    color: '#6b7280',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  eventErrorText: {
    color: '#ef4444',
  },
});
