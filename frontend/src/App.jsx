import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
    Select, MenuItem, Button, CircularProgress, Box, Snackbar, Alert,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
    TextField, IconButton, Grid, Typography, Card, CardContent
} from '@mui/material';
import {
    Adb as AdbIcon,
    PlayArrow as PlayArrowIcon,
    Science as ScienceIcon,
    Delete as DeleteIcon,
    Add as AddIcon,
    Dashboard as DashboardIcon,
    Assessment as AssessmentIcon,
    Storage as StorageIcon,
    Timeline as TimelineIcon,
    Input as InputIcon
} from '@mui/icons-material';
import './index.css';

const API_URL = 'http://localhost:8000/api';

// --- Main App Component --- //
function App() {
    const [view, setView] = useState('trace');

    return (
        <div className="app-container">
            <Sidebar currentView={view} setView={setView} />
            <MainContent currentView={view} />
        </div>
    );
}

// --- Sidebar Component --- //
const Sidebar = ({ currentView, setView }) => (
    <aside className="sidebar">
        <div className="sidebar-header">
            <div className="sidebar-logo"><AssessmentIcon /></div>
            <h1 className="sidebar-title">Android Profiler</h1>
        </div>
        <ul className="sidebar-nav">
            <li className={`nav-item ${currentView === 'trace' ? 'active' : ''}`} onClick={() => setView('trace')}>
                <PlayArrowIcon />
                <span>Start Trace</span>
            </li>
            <li className={`nav-item ${currentView === 'query' ? 'active' : ''}`} onClick={() => setView('query')}>
                <ScienceIcon />
                <span>Run Queries</span>
            </li>
            <li className={`nav-item ${currentView === 'manage' ? 'active' : ''}`} onClick={() => setView('manage')}>
                <StorageIcon />
                <span>Manage Queries</span>
            </li>
            <li className={`nav-item ${currentView === 'viewer' ? 'active' : ''}`} onClick={() => setView('viewer')}>
                <TimelineIcon />
                <span>Trace Viewer</span>
            </li>
        </ul>
    </aside>
);

// --- Main Content Area Component --- //
const MainContent = ({ currentView }) => {
    const titles = {
        trace: 'Start Trace',
        query: 'Run Queries & View Results',
        manage: 'Manage Custom Queries',
        viewer: 'Perfetto Trace Viewer'
    };

    return (
        <main className="main-content">
            <header className="main-header">
                <h2 className="main-title">{titles[currentView]}</h2>
            </header>
            {currentView === 'trace' && <StartTraceView />}
            {currentView === 'query' && <RunQueryView />}
            {currentView === 'manage' && <ManageQueriesView />}
            {currentView === 'viewer' && <TraceView />}
        </main>
    );
};

// --- Notification Hook --- //
const useNotification = () => {
    const [notification, setNotification] = useState({ open: false, message: '', severity: 'info' });
    const showNotification = (message, severity = 'info') => setNotification({ open: true, message, severity });
    const NotificationComponent = () => (
        <Snackbar open={notification.open} autoHideDuration={6000} onClose={() => setNotification({ ...notification, open: false })}>
            <Alert severity={notification.severity} variant="filled" sx={{ width: '100%' }}>{notification.message}</Alert>
        </Snackbar>
    );
    return { showNotification, NotificationComponent };
};

// --- Start Trace View --- //
const StartTraceView = () => {
    const [devices, setDevices] = useState([]);
    const [selectedDevice, setSelectedDevice] = useState('');
    const [isTracing, setIsTracing] = useState(false);
    const [traceId, setTraceId] = useState(null);
    const { showNotification, NotificationComponent } = useNotification();

    useEffect(() => {
        fetchDevices();
    }, []);

    const fetchDevices = async () => {
        try {
            const response = await axios.get(`${API_URL}/devices`);
            setDevices(response.data.devices);
            if (response.data.devices.length > 0) setSelectedDevice(response.data.devices[0]);
        } catch (error) { showNotification(error.response?.data?.detail || 'Could not fetch devices.', 'error'); }
    };

    const handleStartTrace = async () => {
        if (!selectedDevice) return showNotification('Please select a device.', 'warning');
        setIsTracing(true);
        setTraceId(null);

        try {
            const response = await axios.post(`${API_URL}/traces/start`, { device_id: selectedDevice });
            setTraceId(response.data.trace_id);
            showNotification(`Trace ${response.data.trace_id} started. Please wait ~15 seconds.`, 'success');
        } catch (error) {
            showNotification(error.response?.data?.detail || 'Failed to start trace.', 'error');
        } finally {
            setTimeout(() => setIsTracing(false), 15000);
        }
    };

    return (
        <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
                <Card>
                    <CardContent>
                        <Typography variant="h6" sx={{ mb: 2 }}>1. Select Device & Capture Trace</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                            <AdbIcon color="primary" />
                            <Select value={selectedDevice} onChange={(e) => setSelectedDevice(e.target.value)} fullWidth size="small">{devices.length > 0 ? devices.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>) : <MenuItem disabled>No Devices</MenuItem>}</Select>
                        </Box>
                        <Button fullWidth variant="contained" onClick={handleStartTrace} startIcon={isTracing ? <CircularProgress size={20} /> : <PlayArrowIcon />} disabled={isTracing}> {isTracing ? 'Capturing...' : 'Start Trace (10s)'}</Button>
                        {traceId && <Typography sx={{mt: 2}}>Last Trace ID: {traceId}</Typography>}
                    </CardContent>
                </Card>
            </Grid>
             <NotificationComponent />
        </Grid>
    );
};

// --- Run Query View --- //
const RunQueryView = () => {
    const [queries, setQueries] = useState([]);
    const [selectedQuery, setSelectedQuery] = useState('');
    const [queryResult, setQueryResult] = useState(null);
    const [isQuerying, setIsQuerying] = useState(false);
    const [traceId, setTraceId] = useState('');
    const { showNotification, NotificationComponent } = useNotification();
    const pollingIntervalRef = useRef(null);

    useEffect(() => {
        fetchQueries();
        return () => { if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current); };
    }, []);

    const fetchQueries = async () => {
        try {
            const response = await axios.get(`${API_URL}/queries`);
            const queryList = Object.entries(response.data).map(([query_id, query_name]) => ({ query_id, query_name }));
            setQueries(queryList);
            if (queryList.length > 0) {
                setSelectedQuery(queryList[0].query_id);
            }
        } catch (error) {
            showNotification('Could not fetch queries.', 'error');
        }
    };

    const handleExecuteQuery = async () => {
        if (!traceId || !selectedQuery) return showNotification('Enter a Trace ID and select a query first.', 'warning');
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        setQueryResult(null);
        setIsQuerying(true);

        try {
            const response = await axios.post(`${API_URL}/query/execute`, { trace_id: traceId, query_id: selectedQuery });
            const dataEndpoint = response.data.data_endpoint;
            pollingIntervalRef.current = setInterval(async () => {
                try {
                    const pollResponse = await axios.get(`${new URL(API_URL).origin}${dataEndpoint}`);
                    if (pollResponse.data.status === 'complete') {
                        clearInterval(pollingIntervalRef.current);
                        setIsQuerying(false);
                        setQueryResult(pollResponse.data.data);
                        showNotification('Query complete!', 'success');
                    } else if (pollResponse.data.status === 'error') {
                        clearInterval(pollingIntervalRef.current);
                        setIsQuerying(false);
                        showNotification('Query processing failed.', 'error');
                    }
                } catch (pollError) {
                    clearInterval(pollingIntervalRef.current);
                    setIsQuerying(false);
                    showNotification('Failed to fetch query results.', 'error');
                }
            }, 2000);
        } catch (error) {
            setIsQuerying(false);
            showNotification(error.response?.data?.detail || 'Failed to start query execution.', 'error');
        }
    };

    const renderResultsTable = () => {
        if (isQuerying) return <Box sx={{ textAlign: 'center', p: 4 }}><Typography>Processing query...</Typography><CircularProgress sx={{ mt: 2 }} /></Box>;
        if (!queryResult || !queryResult.rows || queryResult.rows.length === 0) {
            return (
                <Box sx={{ textAlign: 'center', p: 4, color: 'var(--text-dark-secondary)' }}>
                    <ScienceIcon sx={{ fontSize: 60 }} />
                    <Typography variant="h6">No Results</Typography>
                    <Typography>Run a query to see the output here.</Typography>
                </Box>
            );
        }
        return (
            <TableContainer component={Paper}>
                <Table stickyHeader>
                    <TableHead><TableRow>{queryResult.columns.map((col) => <TableCell key={col} className="table-header-cell">{col.toUpperCase()}</TableCell>)}</TableRow></TableHead>
                    <TableBody>
                        {queryResult.rows.map((row, index) => (
                            <TableRow key={index} hover>{row.map((cell, cellIndex) => <TableCell key={cellIndex}>{String(cell)}</TableCell>)}</TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        );
    };

    return (
        <Grid container spacing={3}>
            <Grid item xs={12} md={4}>
                <Card>
                    <CardContent>
                        <Typography variant="h6" sx={{ mb: 2 }}>2. Run Query</Typography>
                        <TextField label="Trace ID" value={traceId} onChange={(e) => setTraceId(e.target.value)} fullWidth margin="dense" size="small" sx={{mb: 2}} />
                        <Select value={selectedQuery} onChange={(e) => setSelectedQuery(e.target.value)} fullWidth size="small" disabled={!queries.length || isQuerying} sx={{ mb: 2 }}>{queries.map((q) => (<MenuItem key={q.query_id} value={q.query_id}>{q.query_name}</MenuItem>))}</Select>
                        <Button fullWidth variant="contained" color="secondary" onClick={handleExecuteQuery} disabled={!traceId || isQuerying}>Execute Query</Button>
                    </CardContent>
                </Card>
            </Grid>
            <Grid item xs={12} md={8}>
                <Card sx={{ height: 'calc(100% - 1rem)' }}>
                    <CardContent>
                        {renderResultsTable()}
                    </CardContent>
                </Card>
            </Grid>
            <NotificationComponent />
        </Grid>
    );
};

// --- Manage Queries View --- //
const ManageQueriesView = () => {
    const [queries, setQueries] = useState([]);
    const [newQueryName, setNewQueryName] = useState('');
    const [newQuerySql, setNewQuerySql] = useState('');
    const { showNotification, NotificationComponent } = useNotification();

    useEffect(() => {
        fetchQueries();
    }, []);

    const fetchQueries = async () => {
        try {
            const response = await axios.get(`${API_URL}/queries`);
            setQueries(Object.entries(response.data).map(([query_id, query_name]) => ({ query_id, query_name })));
        } catch (error) {
            showNotification('Could not fetch queries.', 'error');
        }
    };

    const handleAddQuery = async () => {
        if (!newQueryName || !newQuerySql) return showNotification('Query Name and SQL cannot be empty.', 'warning');
        try {
            await axios.post(`${API_URL}/queries`, { name: newQueryName, sql: newQuerySql });
            setNewQueryName('');
            setNewQuerySql('');
            fetchQueries();
            showNotification('Custom query added successfully!', 'success');
        } catch (error) { showNotification(error.response?.data?.detail || 'Failed to add custom query.', 'error'); }
    };

    const handleDeleteQuery = async (queryId) => {
        try {
            await axios.delete(`${API_URL}/queries/${queryId}`);
            fetchQueries();
            showNotification('Custom query deleted.', 'success');
        } catch (error) { showNotification(error.response?.data?.detail || 'Failed to delete custom query.', 'error'); }
    };

    return (
        <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
                <Card>
                    <CardContent>
                        <Typography variant="h6" sx={{ mb: 2 }}>Add New Query</Typography>
                        <TextField label="Query Name" value={newQueryName} onChange={(e) => setNewQueryName(e.target.value)} fullWidth margin="dense" size="small" />
                        <TextField label="SQL Query" value={newQuerySql} onChange={(e) => setNewQuerySql(e.target.value)} fullWidth multiline rows={4} margin="dense" size="small" sx={{ mt: 1 }} />
                        <Button fullWidth variant="contained" onClick={handleAddQuery} startIcon={<AddIcon />} sx={{ mt: 2 }}>Add Query</Button>
                    </CardContent>
                </Card>
            </Grid>
            <Grid item xs={12} md={6}>
                <Card>
                    <CardContent>
                        <Typography variant="h6" sx={{ mb: 2 }}>Existing Custom Queries</Typography>
                        <Box sx={{ mt: 1 }}>
                            {queries.map(q => (
                                <Paper key={q.query_id} sx={{ p: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                                    <Typography sx={{ flexGrow: 1, fontSize: '0.9rem', fontWeight: 500 }}>{q.query_name}</Typography>
                                    <IconButton size="small" onClick={() => handleDeleteQuery(q.query_id)}><DeleteIcon fontSize="small" /></IconButton>
                                </Paper>
                            ))}
                             {queries.length === 0 && <Typography>No custom queries yet.</Typography>}
                        </Box>
                    </CardContent>
                </Card>
            </Grid>
            <NotificationComponent />
        </Grid>
    );
};

// --- Trace Viewer --- //
const TraceView = () => {
    const [traceFileUrl, setTraceFileUrl] = useState('');
    const fileInputRef = useRef(null);

    const handleFileChange = (event) => {
        const file = event.target.files[0];
        if (file) {
            const url = URL.createObjectURL(file);
            setTraceFileUrl(url);
        }
    };

    const handleButtonClick = () => {
        fileInputRef.current.click();
    };

    return (
        <Box>
            <Card sx={{mb: 2}}>
                <CardContent>
                     <Typography variant="h6" sx={{ mb: 2 }}>Load a trace file</Typography>
                    <input
                        type="file"
                        accept=".pftrace,.trace,application/octet-stream"
                        onChange={handleFileChange}
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                    />
                    <Button variant="contained" onClick={handleButtonClick} startIcon={<InputIcon />}>
                        Open Trace File
                    </Button>
                     <Typography variant="body2" sx={{mt: 1}}>Select a trace file from your computer to view it in the Perfetto UI.</Typography>
                </CardContent>
            </Card>

            {traceFileUrl && (
                <iframe
                    src={`https://ui.perfetto.dev/#!/?url=${traceFileUrl}`}
                    style={{ width: '100%', height: '80vh', border: '1px solid #ccc', borderRadius: '8px' }}
                />
            )}
        </Box>
    );
};

export default App;
