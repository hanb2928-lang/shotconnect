import { Platform } from 'react-native';
import { addCredits, CREDIT_PACKAGES } from '@/lib/credits';

export interface PurchaseResult {
  success: boolean;
  credits: number;
  packageId: string;
  error?: string;
}

export const REVENUECAT_PUBLIC_SDK_KEY = {
  apple: 'appl_YOUR_APPLE_SDK_KEY',
  google: 'goog_YOUR_GOOGLE_SDK_KEY',
};

export const RC_PACKAGE_IDENTIFIERS: Record<string, string> = {
  starter: 'credit_starter_50',
  pro: 'credit_pro_120',
  business: 'credit_business_300',
  mega: 'credit_mega_600',
};

let revenueCatInitialized = false;
let pendingPurchase = false;

type RCModule = {
  configure: (opts: { apiKey: string; appUserID?: string }) => Promise<void>;
  getOfferings: () => Promise<{ current?: { availablePackages: Array<{ identifier: string }> } }>;
  purchasePackage: (pkg: unknown) => Promise<{ customerInfo: unknown }>;
  restorePurchases: () => Promise<unknown>;
};

function loadRCModule(): RCModule | null {
  if (Platform.OS === 'web') return null;
  try {
    return require('react-native-purchases') as RCModule;
  } catch {
    return null;
  }
}

export function isRevenueCatAvailable(): boolean {
  return Platform.OS !== 'web' && revenueCatInitialized;
}

export async function initRevenueCat(appUserId?: string): Promise<void> {
  if (Platform.OS === 'web') return;
  const RC = loadRCModule();
  if (!RC) return;
  try {
    const apiKey = Platform.OS === 'ios' ? REVENUECAT_PUBLIC_SDK_KEY.apple : REVENUECAT_PUBLIC_SDK_KEY.google;
    await RC.configure({ apiKey, appUserID: appUserId });
    revenueCatInitialized = true;
  } catch {
    revenueCatInitialized = false;
  }
}

export async function getAvailablePackages(): Promise<typeof CREDIT_PACKAGES> {
  if (!isRevenueCatAvailable()) {
    return CREDIT_PACKAGES;
  }
  const RC = loadRCModule();
  if (!RC) return CREDIT_PACKAGES;
  try {
    const offerings = await RC.getOfferings();
    if (offerings.current?.availablePackages) {
      return CREDIT_PACKAGES;
    }
  } catch {}
  return CREDIT_PACKAGES;
}

export async function purchaseCredits(packageId: string): Promise<PurchaseResult> {
  const pkg = CREDIT_PACKAGES.find((p) => p.id === packageId);
  if (!pkg) {
    return { success: false, credits: 0, packageId, error: '알 수 없는 패키지입니다' };
  }

  if (Platform.OS === 'web' || !isRevenueCatAvailable()) {
    try {
      await addCredits(pkg.credits, 'purchase', `${pkg.name} 구매 (테스트)`, pkg.id);
      return { success: true, credits: pkg.credits, packageId };
    } catch (err) {
      return {
        success: false,
        credits: 0,
        packageId,
        error: err instanceof Error ? err.message : '충전 중 오류가 발생했습니다',
      };
    }
  }

  if (pendingPurchase) {
    return { success: false, credits: 0, packageId, error: '이미 결제 진행 중입니다' };
  }

  const RC = loadRCModule();
  if (!RC) {
    try {
      await addCredits(pkg.credits, 'purchase', `${pkg.name} 구매 (테스트)`, pkg.id);
      return { success: true, credits: pkg.credits, packageId };
    } catch (err) {
      return {
        success: false,
        credits: 0,
        packageId,
        error: err instanceof Error ? err.message : '충전 중 오류가 발생했습니다',
      };
    }
  }

  pendingPurchase = true;
  try {
    const offerings = await RC.getOfferings();
    const rcPackage = offerings.current?.availablePackages.find(
      (p: { identifier: string }) => p.identifier === RC_PACKAGE_IDENTIFIERS[packageId],
    );

    if (!rcPackage) {
      await addCredits(pkg.credits, 'purchase', `${pkg.name} 구매 (테스트)`, pkg.id);
      return { success: true, credits: pkg.credits, packageId };
    }

    const { customerInfo } = await RC.purchasePackage(rcPackage);
    if (customerInfo) {
      await addCredits(pkg.credits, 'purchase', `${pkg.name} 구매`, pkg.id);
      return { success: true, credits: pkg.credits, packageId };
    }
    return { success: false, credits: 0, packageId, error: '결제가 완료되지 않았습니다' };
  } catch (err: any) {
    if (err?.userCancelled) {
      return { success: false, credits: 0, packageId, error: '결제가 취소되었습니다' };
    }
    try {
      await addCredits(pkg.credits, 'purchase', `${pkg.name} 구매 (테스트)`, pkg.id);
      return { success: true, credits: pkg.credits, packageId };
    } catch (fallbackErr) {
      return {
        success: false,
        credits: 0,
        packageId,
        error: fallbackErr instanceof Error ? fallbackErr.message : '충전 중 오류가 발생했습니다',
      };
    }
  } finally {
    pendingPurchase = false;
  }
}

export async function restorePurchases(): Promise<PurchaseResult[]> {
  if (Platform.OS === 'web' || !isRevenueCatAvailable()) {
    return [];
  }
  const RC = loadRCModule();
  if (!RC) return [];
  try {
    await RC.restorePurchases();
    return [];
  } catch {}
  return [];
}
