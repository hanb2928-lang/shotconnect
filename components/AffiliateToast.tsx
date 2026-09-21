import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { Platform, Linking } from 'react-native';

interface AffiliateToastContextValue {
  showAffiliateToast: (url: string) => void;
}

const AffiliateToastContext = createContext<AffiliateToastContextValue | null>(null);

export function AffiliateToastProvider({ children }: { children: ReactNode }) {
  const showAffiliateToast = useCallback((url: string) => {
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url).catch(() => {});
    }
  }, []);

  return (
    <AffiliateToastContext.Provider value={{ showAffiliateToast }}>
      {children}
    </AffiliateToastContext.Provider>
  );
}

export function useAffiliateToast(): AffiliateToastContextValue {
  const ctx = useContext(AffiliateToastContext);
  if (!ctx) {
    return {
      showAffiliateToast: (url: string) => {
        if (Platform.OS === 'web') {
          window.open(url, '_blank');
        } else {
          Linking.openURL(url).catch(() => {});
        }
      },
    };
  }
  return ctx;
}
