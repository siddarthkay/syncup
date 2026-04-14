#import <Foundation/Foundation.h>

@interface GoBridgeWrapper : NSObject

+ (NSNumber *)startServer;
+ (NSNumber *)stopServer;
+ (NSNumber *)getServerPort;
+ (NSString *)getApiKey;
+ (NSString *)getDeviceId;
+ (NSString *)getGuiAddress;
+ (NSString *)getDataDir;
+ (NSString *)listSubdirs:(NSString *)path;
+ (NSString *)mkdirSubdir:(NSString *)parent name:(NSString *)name;
+ (NSString *)removeDir:(NSString *)path;
+ (NSString *)copyFile:(NSString *)src dst:(NSString *)dst;
+ (NSString *)resolvePath:(NSString *)path;
+ (NSString *)zipDir:(NSString *)srcDir dstPath:(NSString *)dstPath;
+ (void)setSuspended:(BOOL)suspended;
+ (BOOL)getWifiOnlySync;
+ (BOOL)setWifiOnlySync:(BOOL)enabled;
+ (BOOL)getChargingOnlySync;
+ (BOOL)setChargingOnlySync:(BOOL)enabled;
+ (BOOL)openBatteryOptimizationSettings;
+ (BOOL)openFolderInFileManager:(NSString *)path;
+ (NSString *)getFoldersRoot;
+ (BOOL)setFoldersRoot:(NSString *)path;
+ (BOOL)hasAllFilesAccess;
+ (BOOL)requestAllFilesAccess;

/// Deduped folder error notify. Posts only when count > last-notified; count==0 clears the entry.
/// Compare-and-store is @synchronized, both JS and BG threads land here.
+ (BOOL)maybeNotifyFolderErrorsWithFolderId:(NSString *)folderId
                                      count:(NSInteger)count
                                      label:(NSString *)label
                                     sample:(NSString *)sample;

@end
