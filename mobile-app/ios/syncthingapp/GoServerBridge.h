#import <React/RCTBridgeModule.h>
#import <ReactCommon/RCTTurboModule.h>
#include <jsi/jsi.h>

#ifdef RCT_NEW_ARCH_ENABLED
#include "GoServerBridgeSpecJSI.h"

class GoServerBridgeImpl : public facebook::react::NativeGoServerBridgeCxxSpec<GoServerBridgeImpl> {
public:
    GoServerBridgeImpl(std::shared_ptr<facebook::react::CallInvoker> jsInvoker);

    double startServer(facebook::jsi::Runtime &rt);
    bool stopServer(facebook::jsi::Runtime &rt);
    double getServerPort(facebook::jsi::Runtime &rt);
};
#endif

@interface GoServerBridge : NSObject <RCTBridgeModule, RCTTurboModule>

@end