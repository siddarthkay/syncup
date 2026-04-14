#import <Foundation/Foundation.h>

@interface GoBridgeWrapper : NSObject

+ (NSNumber *)startServer;
+ (NSNumber *)stopServer;
+ (NSNumber *)getServerPort;

@end