//! Register the app bundle named by a legacy LaunchAgent with Launch Services.
//! This does not launch the app or change background-item authorization.

use std::ffi::c_void;
use std::os::unix::ffi::OsStrExt;
use std::path::Path;

#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C" {
    fn CFURLCreateFromFileSystemRepresentation(
        allocator: *const c_void,
        buffer: *const u8,
        length: isize,
        is_directory: u8,
    ) -> *const c_void;
    fn CFRelease(value: *const c_void);
}

#[link(name = "CoreServices", kind = "framework")]
unsafe extern "C" {
    fn LSRegisterURL(url: *const c_void, update: u8) -> i32;
}

pub(crate) fn register(executable: &Path) -> Result<(), String> {
    let executable = crate::macos_autostart::validate_installed_executable(executable)?;
    let bundle = executable
        .ancestors()
        .nth(3)
        .ok_or_else(|| "The application bundle path is unavailable".to_string())?;
    let path = bundle.as_os_str().as_bytes();
    let length = isize::try_from(path.len())
        .map_err(|_| "The application bundle path is too long".to_string())?;
    // Core Foundation copies the path bytes; the returned owned CFURL must be
    // released after the synchronous Launch Services call, including failure.
    let url = unsafe {
        CFURLCreateFromFileSystemRepresentation(std::ptr::null(), path.as_ptr(), length, 1)
    };
    if url.is_null() {
        return Err("Could not create the application bundle URL".to_string());
    }
    let status = unsafe { LSRegisterURL(url, 1) };
    unsafe { CFRelease(url) };
    if status != 0 {
        return Err(format!(
            "Could not register the application with Launch Services ({status})"
        ));
    }
    Ok(())
}
