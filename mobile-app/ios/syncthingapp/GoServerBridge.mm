#import "GoServerBridge.h"
#import "GoBridgeWrapper.h"
#import <react/bridging/Bridging.h>

#ifdef RCT_NEW_ARCH_ENABLED
GoServerBridgeImpl::GoServerBridgeImpl(std::shared_ptr<facebook::react::CallInvoker> jsInvoker)
    : NativeGoServerBridgeCxxSpec(std::move(jsInvoker)) {}

double GoServerBridgeImpl::startServer(facebook::jsi::Runtime &rt) {
    NSNumber *result = [GoBridgeWrapper startServer];
    return [result doubleValue];
}

bool GoServerBridgeImpl::stopServer(facebook::jsi::Runtime &rt) {
    NSNumber *result = [GoBridgeWrapper stopServer];
    return [result boolValue];
}

double GoServerBridgeImpl::getServerPort(facebook::jsi::Runtime &rt) {
    NSNumber *result = [GoBridgeWrapper getServerPort];
    return [result doubleValue];
}
#endif

@implementation GoServerBridge

RCT_EXPORT_MODULE()

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

#ifdef RCT_NEW_ARCH_ENABLED
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<GoServerBridgeImpl>(params.jsInvoker);
}
#endif

@end