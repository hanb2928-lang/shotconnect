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

export function useCameraPermissionsSafe(): PermissionHookReturn {
  if (Platform.OS === 'web') {
    return [webPermission, webRequest, webRequest];
  }
  return useCameraPermissions() as PermissionHookReturn;
}
