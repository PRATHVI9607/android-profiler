import subprocess
from typing import List

def find_devices() -> List[str]:
    """Finds connected Android devices using ADB."""
    try:
        result = subprocess.run(['adb', 'devices'], capture_output=True, text=True, check=True)
        lines = result.stdout.strip().split('\n')
        devices = [line.split('\t')[0] for line in lines[1:] if '\tdevice' in line]
        return devices
    except (subprocess.CalledProcessError, FileNotFoundError):
        return []

def _format_error(tool: str, e: subprocess.CalledProcessError) -> str:
    """Creates a user-friendly error message."""
    RED = '\033[91m'
    YELLOW = '\033[93m'
    RESET = '\033[0m'
    stderr = e.stderr.decode('utf-8', errors='ignore').strip() if e.stderr else "No stderr output from ADB."
    
    suggestion = f"💡 {YELLOW}Suggestion: This is a low-level error. Ensure your device is connected, unlocked, and that no other profiling tools (like Android Studio) are interfering.{RESET}"

    return (f"\n{RED}ERROR executing '{tool}' command!{RESET}\n"
            f"  - ADB Stderr: {stderr}\n"
            f"  {suggestion}\n")

def capture_trace_to_file(device_id: str, config_path: str, local_path: str) -> bool:
    """
    Starts a trace and streams the output directly to a local file,
    bypassing all on-device filesystem permissions.
    """
    try:
        with open(config_path, 'r') as f:
            config_content = f.read()

        print("Starting 10-second trace and streaming output directly... (This will block)")
        # --- THE STREAMING METHOD ---
        # -o - tells perfetto to write the trace to stdout
        # The output is captured in proc.stdout
        proc = subprocess.run(
            ['adb', '-s', device_id, 'shell', 'perfetto -c - -o - --txt'],
            input=config_content.encode('utf-8'), # stdin must be bytes
            capture_output=True, # Capture stdout and stderr
            check=True
        )

        # The raw binary trace data is in proc.stdout. Write it to our local file.
        with open(local_path, 'wb') as f_out:
            f_out.write(proc.stdout)
        
        print(f"Trace data streamed and saved successfully to {local_path}")
        return True
        
    except FileNotFoundError:
        print(f"ERROR: The config file '{config_path}' was not found.")
        return False
    except subprocess.CalledProcessError as e:
        print(_format_error('perfetto stream', e))
        return False