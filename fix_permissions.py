import os
import stat
import glob
import sys

# We need to find the location of the installed 'perfetto' package
try:
    import perfetto
    # Get the top-level directory of the installed 'perfetto' package
    package_dir = os.path.dirname(perfetto.__file__)
    print(f"Found 'perfetto' package directory at: {package_dir}")
except ImportError:
    print("FATAL: The 'perfetto' library is not installed. Please run 'pip install perfetto' first.")
    sys.exit(1)

# The binary is located in a subdirectory like 'bin/linux-amd64/'
# We use glob to find it without needing to know the exact architecture
search_pattern = os.path.join(package_dir, 'bin', '*', 'trace_processor_shell')
found_files = glob.glob(search_pattern)

if not found_files:
    print(f"FATAL: Could not find 'trace_processor_shell' inside {package_dir}. The library might be corrupted.")
    sys.exit(1)

# There should only be one
binary_path = found_files[0]
print(f"Found the trace processor binary at: {binary_path}")

try:
    # --- THIS IS THE FIX ---
    # Get the current permissions
    current_permissions = os.stat(binary_path).st_mode
    
    # Add the 'execute' permission for the owner (user)
    print("Setting executable permission...")
    os.chmod(binary_path, current_permissions | stat.S_IXUSR)
    
    print("\n✅ SUCCESS: The Perfetto binary is now executable.")
    print("You can now restart your backend server. It should work perfectly.")

except Exception as e:
    print(f"An error occurred while setting permissions: {e}")
    print("Please try running this script with sudo: 'sudo python3 fix_permissions.py'")