import { NativeModules } from 'react-native';

interface GoBridgeInterface {
  getGreeting(name: string): string;
  getCurrentTime(): string;
  calculate(a: number, b: number): number;
  getSystemInfo(): string;
  startServer(): number;
  stopServer(): boolean;
  getServerPort(): number;
}

export default NativeModules.GoBridge as GoBridgeInterface;