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
    facebook::jsi::String getApiKey(facebook::jsi::Runtime &rt);
    facebook::jsi::String getDeviceId(facebook::jsi::Runtime &rt);
    facebook::jsi::String getGuiAddress(facebook::jsi::Runtime &rt);
    facebook::jsi::String getDataDir(facebook::jsi::Runtime &rt);
    facebook::jsi::String listSubdirs(facebook::jsi::Runtime &rt, facebook::jsi::String path);
    facebook::jsi::String mkdirSubdir(facebook::jsi::Runtime &rt, facebook::jsi::String parent, facebook::jsi::String name);
    facebook::jsi::String removeDir(facebook::jsi::Runtime &rt, facebook::jsi::String path);
    facebook::jsi::String copyFile(facebook::jsi::Runtime &rt, facebook::jsi::String src, facebook::jsi::String dst);
    facebook::jsi::String resolvePath(facebook::jsi::Runtime &rt, facebook::jsi::String path);
    facebook::jsi::String zipDir(facebook::jsi::Runtime &rt, facebook::jsi::String srcDir, facebook::jsi::String dstPath);
    void setSuspended(facebook::jsi::Runtime &rt, bool suspended);
    bool getWifiOnlySync(facebook::jsi::Runtime &rt);
    bool setWifiOnlySync(facebook::jsi::Runtime &rt, bool enabled);
    bool getChargingOnlySync(facebook::jsi::Runtime &rt);
    bool setChargingOnlySync(facebook::jsi::Runtime &rt, bool enabled);
    bool getAllowMeteredWifi(facebook::jsi::Runtime &rt);
    bool setAllowMeteredWifi(facebook::jsi::Runtime &rt, bool enabled);
    bool getAllowMobileData(facebook::jsi::Runtime &rt);
    bool setAllowMobileData(facebook::jsi::Runtime &rt, bool enabled);
    bool openBatteryOptimizationSettings(facebook::jsi::Runtime &rt);
    bool openFolderInFileManager(facebook::jsi::Runtime &rt, facebook::jsi::String path);
    facebook::jsi::String getFoldersRoot(facebook::jsi::Runtime &rt);
    bool setFoldersRoot(facebook::jsi::Runtime &rt, facebook::jsi::String path);
    bool hasAllFilesAccess(facebook::jsi::Runtime &rt);
    bool requestAllFilesAccess(facebook::jsi::Runtime &rt);
    bool maybeNotifyFolderErrors(facebook::jsi::Runtime &rt,
                                 facebook::jsi::String folderId,
                                 double count,
                                 facebook::jsi::String label,
                                 facebook::jsi::String sampleError);
    // SAF stubs (Android-only; no-ops on iOS)
    facebook::jsi::String pickSafFolder(facebook::jsi::Runtime &rt);
    facebook::jsi::String getSafPersistedUris(facebook::jsi::Runtime &rt);
    bool revokeSafPermission(facebook::jsi::Runtime &rt, facebook::jsi::String uri);
    facebook::jsi::String getSafDisplayName(facebook::jsi::Runtime &rt, facebook::jsi::String uri);
    bool validateSafPermission(facebook::jsi::Runtime &rt, facebook::jsi::String uri);
    facebook::jsi::String copySafFileToCache(facebook::jsi::Runtime &rt, facebook::jsi::String treeURI, facebook::jsi::String relativePath);
};
#endif

@interface GoServerBridge : NSObject <RCTBridgeModule, RCTTurboModule>

@end
