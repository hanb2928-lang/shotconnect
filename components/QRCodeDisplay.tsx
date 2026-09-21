import { useMemo } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { theme } from '@/lib/theme';

interface QRCodeDisplayProps {
  value: string;
  size?: number;
}

const QR_SIZE = 25;

const FINDER_PATTERNS = [
  [0, 0],
  [QR_SIZE - 7, 0],
  [0, QR_SIZE - 7],
];

function isFinderArea(row: number, col: number): boolean {
  for (const [fr, fc] of FINDER_PATTERNS) {
    if (row >= fr && row < fr + 7 && col >= fc && col < fc + 7) {
      const lr = row - fr;
      const lc = col - fc;
      const isOuter = lr === 0 || lr === 6 || lc === 0 || lc === 6;
      const isInner = lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4;
      return isOuter || isInner;
    }
  }
  return false;
}

function generateQRMatrix(data: string): boolean[][] {
  const matrix: boolean[][] = [];
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash + data.charCodeAt(i)) | 0;
  }
  let seed = Math.abs(hash) || 1;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  for (let r = 0; r < QR_SIZE; r++) {
    matrix[r] = [];
    for (let c = 0; c < QR_SIZE; c++) {
      if (isFinderArea(r, c)) {
        matrix[r][c] = true;
      } else {
        matrix[r][c] = rand() > 0.5;
      }
    }
  }
  return matrix;
}

export function QRCodeDisplay({ value, size = 160 }: QRCodeDisplayProps) {
  const matrix = useMemo(() => generateQRMatrix(value), [value]);
  const cellSize = size / QR_SIZE;

  return (
    <View style={[styles.container, { width: size + 16, height: size + 16 }]}>
      <View style={[styles.qrWrap, { width: size, height: size }]}>
        {matrix.map((row, r) => (
          <View key={r} style={{ flexDirection: 'row', height: cellSize }}>
            {row.map((isDark, c) => (
              <View
                key={c}
                style={{
                  width: cellSize,
                  height: cellSize,
                  backgroundColor: isDark ? theme.colors.dark.text : 'transparent',
                }}
              />
            ))}
          </View>
        ))}
      </View>
      <Text style={styles.hint} numberOfLines={1}>
        {value.length > 40 ? value.slice(0, 37) + '...' : value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.dark.surface,
    borderRadius: theme.radius.lg,
    padding: 8,
  },
  qrWrap: {
    backgroundColor: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
  },
  hint: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.regular,
    color: theme.colors.dark.textDim,
    marginTop: 6,
    textAlign: 'center',
  },
});
