from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os, uuid, adb_utils, perfetto_utils

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

QUERY_STATUS_CACHE = {}
TRACES_DIR = "traces"
os.makedirs(TRACES_DIR, exist_ok=True)
QUERIES_DB = perfetto_utils.get_predefined_queries()

class TraceRequest(BaseModel):
    device_id: str

class QueryExecuteRequest(BaseModel):
    trace_id: str
    query_id: str

@app.get("/api/devices")
def get_devices():
    return {"devices": adb_utils.find_devices()}

@app.post("/api/traces/start")
async def start_trace_endpoint(req: TraceRequest, bg: BackgroundTasks):
    trace_id = str(uuid.uuid4())
    path = os.path.join(TRACES_DIR, f"{trace_id}.pftrace")
    bg.add_task(adb_utils.capture_trace_to_file, req.device_id, "trace_config.pbtxt", path)
    return {"message": "Trace capture started for 10s.", "trace_id": trace_id}

@app.get("/api/queries")
def list_available_queries():
    return [{"query_id": k, "query_name": k.replace("_", " ").title()} for k in QUERIES_DB.keys()]

@app.post("/api/query/execute")
async def execute_query(req: QueryExecuteRequest, bg: BackgroundTasks):
    path = os.path.join(TRACES_DIR, f"{req.trace_id}.pftrace")
    if not os.path.exists(path):
        raise HTTPException(404, "Trace file not found.")
    query = QUERIES_DB.get(req.query_id)
    if not query:
        raise HTTPException(404, "Query ID not found.")

    key = f"{req.trace_id}_{req.query_id}"
    QUERY_STATUS_CACHE[key] = {"status": "processing", "data": None}

    def task():
        try:
            res = perfetto_utils.run_query_on_file(path, query, req.trace_id, req.query_id)
            QUERY_STATUS_CACHE[key] = {"status": "complete", "data": res}
        except Exception as e:
            QUERY_STATUS_CACHE[key] = {"status": "error", "data": str(e)}

    bg.add_task(task)
    return {"message": "Query started.", "data_endpoint": f"/api/query/data/{req.trace_id}/{req.query_id}"}

@app.get("/api/query/data/{trace_id}/{query_id}")
async def get_query_data(trace_id: str, query_id: str):
    key = f"{trace_id}_{query_id}"
    res = QUERY_STATUS_CACHE.get(key)
    if not res:
        raise HTTPException(404, "Query status not found.")
    return res
