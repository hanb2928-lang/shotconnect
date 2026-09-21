import { useState, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Link2, Copy, Check, CircleAlert as AlertCircle } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { theme } from '@/lib/theme';
import { createShortLink } from '@/lib/shortUrl';

interface ShortLinkCopyBarProps {
  url: string;
  scanId?: string;
  label?: string;
}

export function ShortLinkCopyBar({ url, scanId, label = '단축 링크' }: ShortLinkCopyBarProps) {
  const [shortUrl, setShortUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!url.trim()) {
      setShortUrl(null);
      return;
    }
    setLoading(true);
    setError(false);
    setShortUrl(null);
    createShortLink(url.trim(), scanId)
      .then((result) => {
        if (cancelled) return;
        if (result) {
          setShortUrl(result);
        } else {
          setError(true);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url, scanId]);

  const handleCopy = useCallback(async () => {
    if (!shortUrl) return;
    try {
      if (Platform.OS === 'web' && navigator.clipboard) {
        await navigator.clipboard.writeText(shortUrl);
      } else {
        await Clipboard.setStringAsync(shortUrl);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // clipboard failed
    }
  }, [shortUrl]);

  if (!url.trim()) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Link2 size={15} color={theme.colors.accent[400]} strokeWidth={2} />
        <Text style={styles.label}>{label}</Text>
      </View>

      <View style={styles.body}>
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={theme.colors.accent[400]} />
            <Text style={styles.loadingText}>단축 링크 생성 중...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorRow}>
            <AlertCircle size={13} color={theme.colors.error[400]} strokeWidth={2} />
            <Text style={styles.errorText}>단축 링크 생성에 실패했어요</Text>
          </View>
        ) : shortUrl ? (
          <View style={styles.linkRow}>
            <Text style={styles.linkText} numberOfLines={1}>{shortUrl}</Text>
            <TouchableOpacity
              style={[styles.copyBtn, copied && styles.copyBtnDone]}
              onPress={handleCopy}
              activeOpacity={0.7}
            >
              {copied ? (
                <Check size={14} color={theme.colors.success[400]} strokeWidth={2.5} />
              ) : (
                <Copy size={14} color={theme.colors.accent[300]} strokeWidth={2} />
              )}
              <Text style={[styles.copyBtnText, copied && { color: theme.colors.success[400] }]}>
                {copied ? '복사됨' : '복사'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.accent[500] + '10',
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm + 2,
    borderWidth: 1,
    borderColor: theme.colors.accent[400] + '25',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  label: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.accent[400],
  },
  body: {
    minHeight: 24,
    justifyContent: 'center',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  errorText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.error[400],
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  linkText: {
    flex: 1,
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.medium,
    color: theme.colors.dark.text,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.accent[500] + '20',
    borderWidth: 1,
    borderColor: theme.colors.accent[400] + '40',
  },
  copyBtnDone: {
    backgroundColor: theme.colors.success[500] + '15',
    borderColor: theme.colors.success[400] + '40',
  },
  copyBtnText: {
    fontSize: 11,
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.accent[300],
  },
});
