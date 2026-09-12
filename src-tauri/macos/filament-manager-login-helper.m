#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>
#include <mach-o/dyld.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

// Give codesign a stable identity for this standalone nested executable.
__attribute__((used, section("__TEXT,__info_plist")))
static const char helperInfoPlist[] =
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
    "<plist version=\"1.0\"><dict>"
    "<key>CFBundleIdentifier</key><string>no.bliatun.filamentmanager.login-helper</string>"
    "<key>CFBundleName</key><string>Filament Manager</string>"
    "</dict></plist>";

static NSURL *containingApplication(void) {
    uint32_t size = 0;
    (void)_NSGetExecutablePath(NULL, &size);
    if (size == 0) return nil;
    char *buffer = malloc(size);
    if (buffer == NULL) return nil;
    if (_NSGetExecutablePath(buffer, &size) != 0) {
        free(buffer);
        return nil;
    }
    char *resolved = realpath(buffer, NULL);
    free(buffer);
    if (resolved == NULL) return nil;
    NSString *executable = [[NSFileManager defaultManager]
        stringWithFileSystemRepresentation:resolved length:strlen(resolved)];
    free(resolved);
    if (executable == nil) return nil;
    NSURL *helper = [NSURL fileURLWithPath:executable];
    NSURL *macos = [helper URLByDeletingLastPathComponent];
    NSURL *contents = [macos URLByDeletingLastPathComponent];
    NSURL *application = [contents URLByDeletingLastPathComponent];
    if (![helper.lastPathComponent isEqualToString:@"filament-manager-login-helper"] ||
        ![macos.lastPathComponent isEqualToString:@"MacOS"] ||
        ![contents.lastPathComponent isEqualToString:@"Contents"] ||
        ![application.pathExtension isEqualToString:@"app"]) return nil;

    // Read the containing app's plist explicitly: NSBundle may instead expose
    // this helper's embedded signing metadata as the process's main bundle.
    NSURL *infoURL = [contents URLByAppendingPathComponent:@"Info.plist"];
    struct stat status;
    if (lstat(infoURL.fileSystemRepresentation, &status) != 0 ||
        !S_ISREG(status.st_mode) || status.st_nlink != 1 ||
        status.st_size < 0 || status.st_size > 1024 * 1024) return nil;
    NSData *data = [NSData dataWithContentsOfURL:infoURL];
    if (data == nil || data.length > 1024 * 1024) return nil;
    id info = [NSPropertyListSerialization propertyListWithData:data
        options:NSPropertyListImmutable format:NULL error:NULL];
    if (![info isKindOfClass:[NSDictionary class]] ||
        ![info[@"CFBundleIdentifier"] isEqual:@"no.bliatun.filamentmanager"] ||
        ![info[@"CFBundleExecutable"] isEqual:@"bambu-filament-manager"]) return nil;
    NSURL *mainExecutable = [macos URLByAppendingPathComponent:@"bambu-filament-manager"];
    if (lstat(mainExecutable.fileSystemRepresentation, &status) != 0 ||
        !S_ISREG(status.st_mode) || status.st_nlink != 1 ||
        access(mainExecutable.fileSystemRepresentation, X_OK) != 0) return nil;
    return application;
}

int main(void) {
    @autoreleasepool {
        NSURL *application = containingApplication();
        if (application == nil) return 70;
#ifdef FILAMENT_MANAGER_LOGIN_HELPER_TEST
        // The compiled fixture validates its own bundle without opening any app.
        return 0;
#else
        NSURL *mainExecutable = [application
            URLByAppendingPathComponent:@"Contents/MacOS/bambu-filament-manager"];
        for (NSRunningApplication *running in NSWorkspace.sharedWorkspace.runningApplications) {
            if (running.processIdentifier != getpid() && !running.terminated &&
                [running.bundleURL.URLByResolvingSymlinksInPath.path isEqualToString:application.path] &&
                [running.executableURL.URLByResolvingSymlinksInPath.path isEqualToString:mainExecutable.path]) {
                // Sending another open event would expose an existing Tauri window.
                return 0;
            }
        }
        NSWorkspaceOpenConfiguration *configuration = [NSWorkspaceOpenConfiguration configuration];
        configuration.arguments = @[@"--background"];
        configuration.activates = NO;
        configuration.addsToRecentItems = NO;
        configuration.allowsRunningApplicationSubstitution = NO;
        configuration.createsNewApplicationInstance = NO;
        configuration.promptsUserIfNeeded = NO;

        NSLock *lock = [[NSLock alloc] init];
        __block BOOL completed = NO;
        __block BOOL succeeded = NO;
        [[NSWorkspace sharedWorkspace] openApplicationAtURL:application
            configuration:configuration completionHandler:^(NSRunningApplication *running, NSError *error) {
                BOOL matches = error == nil && running != nil &&
                    [running.bundleIdentifier isEqualToString:@"no.bliatun.filamentmanager"] &&
                    [running.bundleURL.URLByResolvingSymlinksInPath.path isEqualToString:application.path] &&
                    [running.executableURL.URLByResolvingSymlinksInPath.path isEqualToString:mainExecutable.path];
                [lock lock];
                succeeded = matches;
                completed = YES;
                [lock unlock];
            }];

        // Pump the main run loop, since launch completion may need its services.
        NSTimeInterval deadline = NSProcessInfo.processInfo.systemUptime + 15.0;
        while (NSProcessInfo.processInfo.systemUptime < deadline) {
            [lock lock];
            BOOL done = completed;
            BOOL success = succeeded;
            [lock unlock];
            if (done) return success ? 0 : 70;
            [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.05]];
        }
        return 70;
#endif
    }
}
