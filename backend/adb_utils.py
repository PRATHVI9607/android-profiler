import subprocess
from typing import List

def find_devices() -> List[str]:
    print("Searching for ADB devices...")
    try:
        result = subprocess.run(['adb', 'devices'], capture_output=True, text=True, check=True)
        lines = result.stdout.strip().split('\n')
        devices = [line.split('\t')[0] for line in lines[1:] if '\tdevice' in line]
        if devices: print(f"SUCCESS: Found devices: {devices}")
        else: print("WARNING: 'adb devices' ran but found no connected devices.")
        return devices
    except FileNotFoundError:
        print("FATAL ERROR: 'adb' command not found. Is platform-tools in your PATH?")
        return []
    except subprocess.CalledProcessError as e:
        print(f"ERROR: 'adb devices' command failed. Stderr: {e.stderr.strip()}")
        return []

def capture_trace_to_file(device_id: str, config_path: str, local_path: str) -> bool:
    try:
        with open(config_path, 'r') as f:
            config_content = f.read()

        print(f"Starting 10-second trace on device '{device_id}'...")

        proc = subprocess.run(
            ['adb', '-s', device_id, 'shell', 'perfetto', '-c', '-', '-o', '-', '--txt'],
            input=config_content.encode('utf-8'),
            capture_output=True,
            check=True,
            timeout=20,
        )

        with open(local_path, 'wb') as f_out:
            f_out.write(proc.stdout)

        print(f"SUCCESS: Trace saved to {local_path}")
        return True
    except Exception as e:
        print(f"FATAL ERROR during trace capture: {e}")
        return False
