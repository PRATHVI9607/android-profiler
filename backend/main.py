from fastapi import FastAPI, HTTPException, BackgroundTasks, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os, uuid, adb_utils, perfetto_utils

app = FastAPI()

# CORS middleware for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"], # Adjust for your frontend URL
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

# In-memory cache for query status and basic app state
QUERY_STATUS_CACHE = {}
TRACES_DIR = "traces"
os.makedirs(TRACES_DIR, exist_ok=True)

# --- Pydantic Models for API requests ---
class TraceRequest(BaseModel):
    device_id: str

class QueryExecuteRequest(BaseModel):
    trace_id: str
    query_id: str

class CustomQueryRequest(BaseModel):
    name: str
    sql: str

# --- API Endpoints ---

@app.get("/api/devices")
def get_devices():
    """Lists all connected Android devices."""
    return {"devices": adb_utils.find_devices()}

@app.post("/api/traces/start")
async def start_trace_endpoint(req: TraceRequest, bg: BackgroundTasks):
    """Starts a new Perfetto trace capture on a specified device."""
    trace_id = str(uuid.uuid4())
    path = os.path.join(TRACES_DIR, f"{trace_id}.pftrace")
    # Run the trace capture in the background to not block the API
    bg.add_task(adb_utils.capture_trace_to_file, req.device_id, "trace_config.pbtxt", path)
    return {"message": "Trace capture started for 10s.", "trace_id": trace_id}

@app.get("/api/queries")
def list_available_queries():
    """Lists all available queries, both predefined and custom."""
    # Load custom queries to enrich the response
    custom_queries = perfetto_utils._load_custom_queries()
    all_queries = perfetto_utils.get_all_queries()
    
    response = []
    for query_id, _ in all_queries.items():
        is_custom = query_id in custom_queries
        # Use the proper name for custom queries, otherwise format the ID
        query_name = custom_queries.get(query_id, {}).get('name', query_id.replace("_", " ").title())
        response.append({"query_id": query_id, "query_name": query_name, "custom": is_custom})
        
    return response

@app.post("/api/queries", status_code=status.HTTP_201_CREATED)
async def add_query_endpoint(query: CustomQueryRequest):
    """Adds a new custom query."""
    try:
        perfetto_utils.add_custom_query(query.name, query.sql)
        return {"message": f"Query '{query.name}' added successfully."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.delete("/api/queries/{query_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_query_endpoint(query_id: str):
    """Deletes a custom query by its ID."""
    try:
        perfetto_utils.delete_custom_query(query_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/query/execute")
async def execute_query(req: QueryExecuteRequest, bg: BackgroundTasks):
    """Executes a query against a captured trace file."""
    path = os.path.join(TRACES_DIR, f"{req.trace_id}.pftrace")
    if not os.path.exists(path):
        raise HTTPException(404, "Trace file not found.")
    
    # Reload queries to ensure custom ones are available
    queries_db = perfetto_utils.get_all_queries()
    query_sql = queries_db.get(req.query_id)
    if not query_sql:
        raise HTTPException(404, "Query ID not found.")

    key = f"{req.trace_id}_{req.query_id}"
    QUERY_STATUS_CACHE[key] = {"status": "processing", "data": None}

    def task():
        """The actual query execution task that runs in the background."""
        try:
            res = perfetto_utils.run_query_on_file(path, query_sql, req.trace_id, req.query_id)
            QUERY_STATUS_CACHE[key] = {"status": "complete", "data": res}
        except Exception as e:
            QUERY_STATUS_CACHE[key] = {"status": "error", "data": str(e)}

    bg.add_task(task)
    return {"message": "Query started.", "data_endpoint": f"/api/query/data/{req.trace_id}/{req.query_id}"}

@app.get("/api/query/data/{trace_id}/{query_id}")
async def get_query_data(trace_id: str, query_id: str):
    """Pollable endpoint to get the status and results of a query."""
    key = f"{trace_id}_{query_id}"
    res = QUERY_STATUS_CACHE.get(key)
    if not res:
        raise HTTPException(404, "Query status not found.")
    return res
