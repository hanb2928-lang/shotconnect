import { Platform } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import type { PermissionResponse } from 'expo-modules-core';

type PermissionHookReturn = [
  PermissionResponse | null,
  () => Promise<PermissionResponse>,
  () => Promise<PermissionResponse>,
];

const webPermission: PermissionResponse = {
  granted: false,
  status: 'undetermined',
  canAskAgain: false,
  expires: 'never',
} as unknown as PermissionResponse;

const webRequest = () => Promise.resolve(webPermission);

const unsupportedPermission: PermissionResponse = {
  granted: false,
  status: 'denied',
  canAskAgain: false,
  expires: 'never',
} as unknown as PermissionResponse;

const unsupportedRequest = () => Promise.resolve(unsupportedPermission);

export function useCameraPermissionsSafe(): PermissionHookReturn {
  const nativeResult = useCameraPermissions();

  if (Platform.OS === 'web') {
    return [webPermission, webRequest, webRequest];
  }

  const requestPermission = nativeResult?.[1] ?? unsupportedRequest;
  return [nativeResult?.[0] ?? null, requestPermission, requestPermission];
}
