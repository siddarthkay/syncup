#import "GoBridgeWrapper.h"
#import <UserNotifications/UserNotifications.h>

static NSString * const kNotifiedErrorCountsKey = @"com.siddarthkay.syncup.notifiedErrorCounts";

@interface GoBridgeWrapper ()
+ (void)deliverNotificationTitle:(NSString *)title body:(NSString *)body;
+ (void)postFolderErrorsNotificationWithLabel:(NSString *)label
                                         count:(NSInteger)count
                                        sample:(NSString *)sample;
@end

@interface GobridgeMobileAPI : NSObject
- (long)startServer:(NSString *)dataDir;
- (void)stopServer;
- (long)getServerPort;
- (NSString *)getAPIKey;
- (NSString *)getDeviceID;
- (NSString *)getGUIAddress;
- (NSString *)getDataDir;
- (NSString *)getFoldersRoot;
- (BOOL)setFoldersRoot:(NSString *)path;
- (NSString *)listSubdirs:(NSString *)path;
- (NSString *)mkdirSubdir:(NSString *)parent name:(NSString *)name;
- (NSString *)removeDir:(NSString *)path;
- (void)setSuspended:(BOOL)suspended;
@end

static Class GobridgeMobileAPIClass;

@implementation GoBridgeWrapper

+ (void)initialize {
  if (self == [GoBridgeWrapper class]) {
    GobridgeMobileAPIClass = NSClassFromString(@"GobridgeMobileAPI");
  }
}

+ (id)api {
  if (!GobridgeMobileAPIClass) {
    return nil;
  }
  return [[GobridgeMobileAPIClass alloc] init];
}

+ (NSString *)dataDir {
  // Documents/ so Files.app can see it (needs UIFileSharingEnabled + LSSupportsOpeningDocumentsInPlace).
  NSArray<NSURL *> *urls = [[NSFileManager defaultManager]
      URLsForDirectory:NSDocumentDirectory
             inDomains:NSUserDomainMask];
  NSURL *base = urls.firstObject;
  if (!base) {
    return NSTemporaryDirectory();
  }
  NSURL *dir = [base URLByAppendingPathComponent:@"syncthing" isDirectory:YES];
  [[NSFileManager defaultManager] createDirectoryAtURL:dir
                           withIntermediateDirectories:YES
                                            attributes:nil
                                                 error:nil];
  return dir.path;
}

+ (NSNumber *)startServer {
  @try {
    id api = [self api];
    if (!api) return @(0);
    NSString *dataDir = [self dataDir];
    return @([api startServer:dataDir]);
  } @catch (NSException *exception) {
    return @(0);
  }
}

+ (NSNumber *)stopServer {
  @try {
    id api = [self api];
    if (!api) return @(NO);
    [api stopServer];
    return @(YES);
  } @catch (NSException *exception) {
    return @(NO);
  }
}

+ (NSNumber *)getServerPort {
  @try {
    id api = [self api];
    if (!api) return @(0);
    return @([api getServerPort]);
  } @catch (NSException *exception) {
    return @(0);
  }
}

+ (NSString *)getApiKey {
  @try {
    id api = [self api];
    if (!api) return @"";
    return [api getAPIKey] ?: @"";
  } @catch (NSException *exception) {
    return @"";
  }
}

+ (NSString *)getDeviceId {
  @try {
    id api = [self api];
    if (!api) return @"";
    return [api getDeviceID] ?: @"";
  } @catch (NSException *exception) {
    return @"";
  }
}

+ (NSString *)getGuiAddress {
  @try {
    id api = [self api];
    if (!api) return @"";
    return [api getGUIAddress] ?: @"";
  } @catch (NSException *exception) {
    return @"";
  }
}

+ (NSString *)getDataDir {
  @try {
    id api = [self api];
    if (!api) return @"";
    return [api getDataDir] ?: @"";
  } @catch (NSException *exception) {
    return @"";
  }
}

+ (NSString *)listSubdirs:(NSString *)path {
  @try {
    id api = [self api];
    if (!api) return @"{\"error\":\"bridge not initialized\"}";
    return [api listSubdirs:(path ?: @"")] ?: @"{\"error\":\"nil result\"}";
  } @catch (NSException *exception) {
    return @"{\"error\":\"exception\"}";
  }
}

+ (NSString *)mkdirSubdir:(NSString *)parent name:(NSString *)name {
  @try {
    id api = [self api];
    if (!api) return @"{\"error\":\"bridge not initialized\"}";
    return [api mkdirSubdir:(parent ?: @"") name:(name ?: @"")] ?: @"{\"error\":\"nil result\"}";
  } @catch (NSException *exception) {
    return @"{\"error\":\"exception\"}";
  }
}

+ (NSString *)removeDir:(NSString *)path {
  @try {
    id api = [self api];
    if (!api) return @"{\"error\":\"bridge not initialized\"}";
    return [api removeDir:(path ?: @"")] ?: @"{\"error\":\"nil result\"}";
  } @catch (NSException *exception) {
    return @"{\"error\":\"exception\"}";
  }
}

+ (NSString *)copyFile:(NSString *)src dst:(NSString *)dst {
  @try {
    id api = [self api];
    if (!api) return @"{\"error\":\"bridge not initialized\"}";
    return [api copyFile:(src ?: @"") dst:(dst ?: @"")] ?: @"{\"error\":\"nil result\"}";
  } @catch (NSException *exception) {
    return @"{\"error\":\"exception\"}";
  }
}

+ (NSString *)resolvePath:(NSString *)path {
  @try {
    id api = [self api];
    if (!api) return @"{\"error\":\"bridge not initialized\"}";
    return [api resolvePath:(path ?: @"")] ?: @"{\"error\":\"nil result\"}";
  } @catch (NSException *exception) {
    return @"{\"error\":\"exception\"}";
  }
}

+ (NSString *)zipDir:(NSString *)srcDir dstPath:(NSString *)dstPath {
  @try {
    id api = [self api];
    if (!api) return @"{\"error\":\"bridge not initialized\"}";
    return [api zipDir:(srcDir ?: @"") dstPath:(dstPath ?: @"")] ?: @"{\"error\":\"nil result\"}";
  } @catch (NSException *exception) {
    return @"{\"error\":\"exception\"}";
  }
}

+ (void)setSuspended:(BOOL)suspended {
  @try {
    id api = [self api];
    if (!api) return;
    [api setSuspended:suspended];
  } @catch (NSException *exception) {
  }
}

// Android-only shims; JS uses Linking.openURL with shareddocuments:// on iOS.
+ (BOOL)getWifiOnlySync { return NO; }
+ (BOOL)setWifiOnlySync:(BOOL)enabled { return NO; }
+ (BOOL)getChargingOnlySync { return NO; }
+ (BOOL)setChargingOnlySync:(BOOL)enabled { return NO; }
+ (BOOL)openBatteryOptimizationSettings { return NO; }
+ (BOOL)openFolderInFileManager:(NSString *)path { return NO; }

+ (NSString *)getFoldersRoot {
  @try {
    id api = [self api];
    if (!api) return @"";
    return [api getFoldersRoot] ?: @"";
  } @catch (NSException *exception) {
    return @"";
  }
}

+ (BOOL)setFoldersRoot:(NSString *)path {
  @try {
    id api = [self api];
    if (!api) return NO;
    return [api setFoldersRoot:(path ?: @"")];
  } @catch (NSException *exception) {
    return NO;
  }
}

// Single entry for fg (TurboModule) and bg (BackgroundErrorNotifier); @synchronized so a BG task
// firing mid-foreground can't race the dedup map. Permission prompt is lazy, fires in context.
+ (BOOL)maybeNotifyFolderErrorsWithFolderId:(NSString *)folderId
                                      count:(NSInteger)count
                                      label:(NSString *)label
                                     sample:(NSString *)sample {
  if (folderId.length == 0) return NO;

  @synchronized (self) {
    NSDictionary<NSString *, NSNumber *> *existing =
        [[NSUserDefaults standardUserDefaults] dictionaryForKey:kNotifiedErrorCountsKey]
            ?: @{};
    NSInteger last = [existing[folderId] integerValue];

    // went healthy, clear so next failure fires fresh.
    if (count <= 0) {
      if (last != 0) {
        NSMutableDictionary *next = [existing mutableCopy];
        [next removeObjectForKey:folderId];
        [[NSUserDefaults standardUserDefaults] setObject:next forKey:kNotifiedErrorCountsKey];
      }
      return NO;
    }

    if (count <= last) return NO;

    // record new high-water mark under the lock, post outside it.
    NSMutableDictionary *next = [existing mutableCopy];
    next[folderId] = @(count);
    [[NSUserDefaults standardUserDefaults] setObject:next forKey:kNotifiedErrorCountsKey];
  }

  [self postFolderErrorsNotificationWithLabel:(label ?: folderId) count:count sample:(sample ?: @"")];
  return YES;
}

+ (void)postFolderErrorsNotificationWithLabel:(NSString *)label
                                         count:(NSInteger)count
                                        sample:(NSString *)sample {
  NSString *title = [NSString stringWithFormat:@"Sync errors in \"%@\"", label];
  NSString *body;
  if (count == 1) {
    body = sample.length > 0 ? sample : @"1 file failed to sync.";
  } else {
    NSString *prefix = [NSString stringWithFormat:@"%ld files failed to sync.", (long)count];
    body = sample.length > 0 ? [NSString stringWithFormat:@"%@ %@", prefix, sample] : prefix;
  }

  UNUserNotificationCenter *center = [UNUserNotificationCenter currentNotificationCenter];
  [center getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings * _Nonnull settings) {
    if (settings.authorizationStatus == UNAuthorizationStatusNotDetermined) {
      UNAuthorizationOptions opts =
          UNAuthorizationOptionAlert | UNAuthorizationOptionSound | UNAuthorizationOptionBadge;
      [center requestAuthorizationWithOptions:opts completionHandler:^(BOOL granted, NSError * _Nullable error) {
        if (granted) {
          [self deliverNotificationTitle:title body:body];
        }
      }];
      return;
    }
    if (settings.authorizationStatus == UNAuthorizationStatusAuthorized ||
        settings.authorizationStatus == UNAuthorizationStatusProvisional) {
      [self deliverNotificationTitle:title body:body];
    }
  }];
}

+ (void)deliverNotificationTitle:(NSString *)title body:(NSString *)body {
  UNMutableNotificationContent *content = [[UNMutableNotificationContent alloc] init];
  content.title = title ?: @"";
  content.body = body ?: @"";
  content.sound = [UNNotificationSound defaultSound];
  NSString *identifier = [[NSUUID UUID] UUIDString];
  UNNotificationRequest *request =
      [UNNotificationRequest requestWithIdentifier:identifier content:content trigger:nil];
  [[UNUserNotificationCenter currentNotificationCenter] addNotificationRequest:request withCompletionHandler:nil];
}

@end
