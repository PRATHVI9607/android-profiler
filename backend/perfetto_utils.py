import subprocess
import json

# IMPORTANT: Make sure this path is correct relative to where you run the backend
TRACE_PROCESSOR_PATH = "../perfetto_tools/trace_processor"

def run_query(trace_path: str, query: str) -> dict:
    """Runs a Perfetto SQL query on a trace file using trace_processor."""
    command = [
        TRACE_PROCESSOR_PATH, 
        trace_path, 
        '--query', 
        query, 
        '--output', 
        'json'
    ]
    try:
        result = subprocess.run(
            command,
            capture_output=True, text=True, check=True
        )
        return json.loads(result.stdout)
    except (subprocess.CalledProcessError, FileNotFoundError, json.JSONDecodeError) as e:
        # Provide more detail on error
        error_output = e.stderr if hasattr(e, 'stderr') else str(e)
        return {"error": error_output}

def get_predefined_queries() -> dict:
    """Returns a dictionary of useful, predefined Perfetto SQL queries."""
    return {
        "cpu_usage_per_core": "SELECT cpu, SUM(dur) as total_duration_ns FROM sched GROUP BY cpu ORDER BY cpu;",
        "top_10_processes_by_cpu": "SELECT process.name, SUM(dur) as total_cpu_time_ns FROM sched JOIN thread ON sched.utid = thread.utid JOIN process ON thread.upid = process.upid WHERE process.name IS NOT NULL GROUP BY process.name ORDER BY total_cpu_time_ns DESC LIMIT 10;",
        "thread_states_summary": "SELECT thread.name as thread_name, state, SUM(dur) as total_duration_ns FROM sched JOIN thread ON sched.utid = thread.utid WHERE thread.name IS NOT NULL GROUP BY thread.name, state ORDER BY total_duration_ns DESC LIMIT 20;",
        "f_trace_event_counts": "SELECT name, COUNT(*) AS count FROM ftrace_event GROUP BY name ORDER BY count DESC;"
    }