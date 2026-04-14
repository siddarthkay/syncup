import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  readonly startServer: () => number;
  readonly stopServer: () => boolean;
  readonly getServerPort: () => number;
}

export default TurboModuleRegistry.getEnforcing<Spec>('GoServerBridge');