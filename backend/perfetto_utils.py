import hashlib
import json
from pathlib import Path
from typing import Dict, List, Any
from perfetto.trace_processor import TraceProcessor, TraceProcessorConfig
import sys
import os

CACHE_DIR = Path(__file__).parent / ".cache"
QUERY_CACHE_FILE = CACHE_DIR / "queries.json"

def _load_query_cache() -> Dict[str, Any]:
    if not QUERY_CACHE_FILE.exists(): 
        return {}
    try:
        with open(QUERY_CACHE_FILE, "r") as f: 
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return {}

def _save_query_cache(cache_data: Dict[str, Any]):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    with open(QUERY_CACHE_FILE, "w") as f:
        json.dump(cache_data, f, indent=4)

def get_perfetto_binary_path() -> str:
    """Finds the path to the trace_processor_shell binary."""
    try:
        home_dir = Path.home()
    except RuntimeError:
        home_dir = None

    if not home_dir:
        raise FileNotFoundError("Perfetto binary could not be found because the home directory is not set.")

    binary_path = home_dir / ".local" / "share" / "perfetto" / "prebuilts" / "trace_processor_shell"

    if not binary_path.exists():
        raise FileNotFoundError(f"Perfetto binary not found at the expected path: {binary_path}")

    return str(binary_path)

def run_query_on_file(filepath: str, query_text: str, trace_id: str, query_id: str) -> Dict[str, List[Any]]:
    print(f"Executing query '{query_id}' on trace file '{filepath}'...")
    query_cache = _load_query_cache()
    cache_key = hashlib.sha256((trace_id + query_text).encode()).hexdigest()

    if cache_key in query_cache:
        print("SUCCESS: Found query result in local file cache.")
        return query_cache[cache_key]

    perfetto_bin = get_perfetto_binary_path()
    config = TraceProcessorConfig(bin_path=perfetto_bin, verbose=True)

    try:
        with TraceProcessor(trace=filepath, config=config) as tp:
            query_iterator = tp.query(query_text)
            columns = query_iterator.column_names
            rows = [list(getattr(row, col) for col in columns) for row in query_iterator]
            result = {"columns": columns, "rows": rows}
            
            query_cache[cache_key] = result
            _save_query_cache(query_cache)
            print("SUCCESS: Query executed and result saved to cache.")
            return result
    except Exception as e:
        error_message = f"An error occurred during trace processing: {e}"
        print(f"ERROR: {error_message}")
        raise RuntimeError(error_message)

def get_predefined_queries() -> Dict[str, str]:
    return {
        "cpu_usage_per_core": "SELECT cpu, SUM(dur) as total_duration_ns FROM sched GROUP BY cpu ORDER BY cpu;",
        "top_10_processes_by_cpu": "SELECT process.name, SUM(dur) as total_cpu_time_ns FROM sched JOIN thread ON sched.utid = thread.utid JOIN process ON thread.upid = process.upid WHERE process.name IS NOT NULL GROUP BY process.name ORDER BY total_cpu_time_ns DESC LIMIT 10;",
        "android_janky_frames": "SELECT dur as duration_ns, name FROM slice WHERE name LIKE 'Choreographer#doFrame%' AND dur > 16600000 ORDER BY dur DESC LIMIT 20;",
    }
