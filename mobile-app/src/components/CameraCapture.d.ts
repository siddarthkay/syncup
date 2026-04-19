import type { CameraView as ExpoCameraView } from 'expo-camera';

export type CameraView = ExpoCameraView;
export const CameraView: typeof ExpoCameraView;
export function useCameraPermissions(): [
  { granted: boolean; canAskAgain: boolean } | null,
  () => Promise<void>,
];
