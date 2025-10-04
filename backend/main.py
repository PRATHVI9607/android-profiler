from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import uuid

import adb_utils
import perfetto_utils

app = FastAPI()

origins = ["http://localhost:5173", "http://localhost:3000"]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

TRACES_DIR = "traces"
os.makedirs(TRACES_DIR, exist_ok=True)

class TraceRequest(BaseModel):
    device_id: str

class QueryRequest(BaseModel):
    trace_id: str
    query_key: str

@app.get("/api/devices")
def get_devices():
    devices = adb_utils.find_devices()
    if not devices:
        raise HTTPException(status_code=404, detail="No devices found. Is your device connected?")
    return {"devices": devices}

@app.post("/api/traces/start")
async def start_trace_endpoint(req: TraceRequest, background_tasks: BackgroundTasks):
    trace_id = str(uuid.uuid4())
    config_path = "trace_config.pbtxt"
    local_trace_path = os.path.join(TRACES_DIR, f"{trace_id}.pftrace")
    
    # Simplified background task
    background_tasks.add_task(adb_utils.capture_trace_to_file, req.device_id, config_path, local_trace_path)
    
    return {"message": "Trace started. Output is streaming directly to the server.", "trace_id": trace_id}

@app.get("/api/queries")
def get_queries():
    return perfetto_utils.get_predefined_queries()

@app.post("/api/queries/run")
def run_query_endpoint(req: QueryRequest):
    trace_path = os.path.join(TRACES_DIR, f"{req.trace_id}.pftrace")
    if not os.path.exists(trace_path):
        raise HTTPException(status_code=404, detail=f"Trace file not ready or trace failed. Check backend logs.")

    queries = perfetto_utils.get_predefined_queries()
    if req.query_key not in queries:
        raise HTTPException(status_code=400, detail="Invalid query key.")

    query = queries[req.query_key]
    result = perfetto_utils.run_query(trace_path, query)

    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    return {"query_key": req.query_key, "results": result}