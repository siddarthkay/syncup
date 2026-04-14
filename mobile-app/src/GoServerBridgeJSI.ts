import NativeGoServerBridge from './NativeGoServerBridge';

export interface GoServerBridgeInterface {
  startServer(): number;
  stopServer(): boolean;
  getServerPort(): number;
}

class GoServerBridgeJSI implements GoServerBridgeInterface {
  startServer(): number {
    return NativeGoServerBridge.startServer();
  }

  stopServer(): boolean {
    return NativeGoServerBridge.stopServer();
  }

  getServerPort(): number {
    return NativeGoServerBridge.getServerPort();
  }
}

export default new GoServerBridgeJSI();