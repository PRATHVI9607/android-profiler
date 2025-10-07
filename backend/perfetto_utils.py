import hashlib
import json
from pathlib import Path
from typing import Dict, List, Any
from perfetto.trace_processor import TraceProcessor, TraceProcessorConfig
import sys
import os

# Setup paths for caching and custom queries
CACHE_DIR = Path(__file__).parent / ".cache"
QUERY_RESULTS_CACHE_FILE = CACHE_DIR / "query_results.json"
CUSTOM_QUERIES_FILE = CACHE_DIR / "custom_queries.json"

# --- Query Results Cache --- (for caching the output of a query on a trace)

def _load_query_results_cache() -> Dict[str, Any]:
    if not QUERY_RESULTS_CACHE_FILE.exists():
        return {}
    try:
        with open(QUERY_RESULTS_CACHE_FILE, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return {}

def _save_query_results_cache(cache_data: Dict[str, Any]):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    with open(QUERY_RESULTS_CACHE_FILE, "w") as f:
        json.dump(cache_data, f, indent=4)

# --- Custom Queries Store --- (for storing user-defined queries)

def _load_custom_queries() -> Dict[str, Dict]:
    if not CUSTOM_QUERIES_FILE.exists():
        return {}
    try:
        with open(CUSTOM_QUERIES_FILE, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return {}

def _save_custom_queries(queries: Dict[str, Dict]):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    with open(CUSTOM_QUERIES_FILE, "w") as f:
        json.dump(queries, f, indent=4)

def get_all_queries() -> Dict[str, str]:
    """Returns custom-saved queries."""
    custom_queries = {k: v['sql'] for k, v in _load_custom_queries().items()}
    return custom_queries

def add_custom_query(name: str, sql: str):
    """Adds a new query to the custom queries file."""
    queries = _load_custom_queries()
    query_id = name.lower().replace(" ", "_")
    queries[query_id] = {"name": name, "sql": sql, "custom": True}
    _save_custom_queries(queries)

def delete_custom_query(query_id: str):
    """Deletes a query from the custom queries file."""
    queries = _load_custom_queries()
    if query_id in queries:
        del queries[query_id]
        _save_custom_queries(queries)

def get_perfetto_binary_path() -> str:
    """Finds the path to the trace_processor_shell binary."""
    # This is a simplified path discovery. For a real application,
    # this might involve more robust searching or configuration.
    expected_path = Path(__file__).parent.parent / "perfetto_tools" / "trace_processor_shell"
    if not expected_path.exists():
        raise FileNotFoundError(f"Trace processor not found at {expected_path}")
    return str(expected_path)

def run_query_on_file(filepath: str, query_text: str, trace_id: str, query_id: str) -> Dict[str, List[Any]]:
    print(f"Executing query '{query_id}' on trace file '{filepath}'...")
    query_results_cache = _load_query_results_cache()
    # Create a cache key based on the trace file content and the query itself
    trace_hash = hashlib.sha256(Path(filepath).read_bytes()).hexdigest()
    cache_key = hashlib.sha256((trace_hash + query_text).encode()).hexdigest()

    if cache_key in query_results_cache:
        print("SUCCESS: Found query result in local file cache.")
        return query_results_cache[cache_key]

    perfetto_bin = get_perfetto_binary_path()
    config = TraceProcessorConfig(bin_path=perfetto_bin, verbose=False)

    try:
        with TraceProcessor(trace=filepath, config=config) as tp:
            query_iterator = tp.query(query_text)
            columns = query_iterator.column_names
            rows = [list(getattr(row, col) for col in columns) for row in query_iterator]
            result = {"columns": columns, "rows": rows}
            
            query_results_cache[cache_key] = result
            _save_query_results_cache(query_results_cache)
            print("SUCCESS: Query executed and result saved to cache.")
            return result
    except Exception as e:
        error_message = f"An error occurred during trace processing: {e}"
        print(f"ERROR: {error_message}")
        raise RuntimeError(error_message)
