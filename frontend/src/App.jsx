import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
    AppBar, Toolbar, Typography, Container, Select, MenuItem, Button,
    Card, CardContent, CircularProgress, Box, Snackbar, Alert,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
    createTheme, ThemeProvider, CssBaseline, LinearProgress
} from '@mui/material';
import AdbIcon from '@mui/icons-material/Adb';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ScienceIcon from '@mui/icons-material/Science';

const API_URL = 'http://localhost:8000/api';

const darkTheme = createTheme({
    palette: { mode: 'dark', primary: { main: '#90caf9' }, secondary: { main: '#f48fb1' } },
});

function App() {
    // State for devices and traces
    const [devices, setDevices] = useState([]);
    const [selectedDevice, setSelectedDevice] = useState('');
    const [traceId, setTraceId] = useState(null);

    // State for queries and results
    const [queries, setQueries] = useState([]); // <-- FIX: Initialize as an Array
    const [selectedQuery, setSelectedQuery] = useState('');
    const [queryResult, setQueryResult] = useState(null);

    // State for loading and notifications
    const [isTracing, setIsTracing] = useState(false);
    const [isQuerying, setIsQuerying] = useState(false);
    const [notification, setNotification] = useState({ open: false, message: '', severity: 'info' });

    // Ref to hold the polling interval
    const pollingIntervalRef = useRef(null);

    // --- Data Fetching on Load ---
    useEffect(() => {
        fetchDevices();
        fetchQueries();
        // Clear any running intervals when the component unmounts
        return () => {
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
            }
        };
    }, []);

    const fetchDevices = async () => {
        try {
            const response = await axios.get(`${API_URL}/devices`);
            setDevices(response.data.devices);
            if (response.data.devices.length > 0) {
                setSelectedDevice(response.data.devices[0]);
            }
        } catch (error) {
            showNotification(error.response?.data?.detail || 'Could not fetch devices.', 'error');
        }
    };

    const fetchQueries = async () => {
        try {
            const response = await axios.get(`${API_URL}/queries`);
            setQueries(response.data); // <-- FIX: API now returns an array of objects
            if (response.data.length > 0) {
                setSelectedQuery(response.data[0].query_id); // <-- FIX: Use query_id
            }
        } catch (error) {
            showNotification('Could not fetch predefined queries.', 'error');
        }
    };

    // --- Button Click Handlers ---
    const handleStartTrace = async () => {
        if (!selectedDevice) return showNotification('Please select a device.', 'warning');
        setIsTracing(true);
        setTraceId(null);
        setQueryResult(null);
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);

        try {
            const response = await axios.post(`${API_URL}/traces/start`, { device_id: selectedDevice });
            setTraceId(response.data.trace_id);
            showNotification('Trace started. Please wait ~15 seconds for capture to complete.', 'success');
        } catch (error) {
            showNotification(error.response?.data?.detail || 'Failed to start trace.', 'error');
        } finally {
            // Give time for trace to complete before enabling query button
            setTimeout(() => setIsTracing(false), 15000);
        }
    };

    const handleExecuteQuery = async () => {
        if (!traceId || !selectedQuery) return showNotification('Start a trace and select a query first.', 'warning');

        // Clear previous interval and results
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        setQueryResult(null);
        setIsQuerying(true);

        try {
            const response = await axios.post(`${API_URL}/query/execute`, {
                trace_id: traceId,
                query_id: selectedQuery,
            });

            // Start polling the data endpoint
            const dataEndpoint = response.data.data_endpoint;
            pollingIntervalRef.current = setInterval(async () => {
                try {
                    const pollResponse = await axios.get(`http://localhost:8000${dataEndpoint}`);
                    if (pollResponse.data.status === 'complete') {
                        clearInterval(pollingIntervalRef.current);
                        setIsQuerying(false);
                        setQueryResult(pollResponse.data.data);
                        showNotification('Query complete!', 'success');
                    }
                } catch (pollError) {
                    clearInterval(pollingIntervalRef.current);
                    setIsQuerying(false);
                    showNotification('Failed to fetch query results.', 'error');
                }
            }, 2000); // Poll every 2 seconds

        } catch (error) {
            setIsQuerying(false);
            showNotification(error.response?.data?.detail || 'Failed to start query execution.', 'error');
        }
    };

    // --- UI Rendering ---
    const showNotification = (message, severity = 'info') => {
        setNotification({ open: true, message, severity });
    };

    const renderResultsTable = () => {
        if (isQuerying) {
            return (
                <Box sx={{ width: '100%', textAlign: 'center' }}>
                    <Typography>Processing query in background...</Typography>
                    <LinearProgress sx={{ mt: 2 }} />
                </Box>
            );
        }
        if (!queryResult || !queryResult.rows || queryResult.rows.length === 0) {
            return <Typography>Run a query to see results.</Typography>;
        }

        return (
            <TableContainer component={Paper} sx={{ maxHeight: '60vh' }}>
                <Table stickyHeader>
                    <TableHead>
                        <TableRow>{queryResult.columns.map((col) => <TableCell key={col}><b>{col.toUpperCase()}</b></TableCell>)}</TableRow>
                    </TableHead>
                    <TableBody>
                        {queryResult.rows.map((row, index) => (
                            <TableRow key={index} hover>
                                {row.map((cell, cellIndex) => <TableCell key={cellIndex}>{cell}</TableCell>)}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        );
    };

    return (
        <ThemeProvider theme={darkTheme}>
            <CssBaseline />
            <AppBar position="static"><Toolbar><AdbIcon sx={{ mr: 2 }} /><Typography variant="h6">Perfetto Automation UI</Typography></Toolbar></AppBar>
            <Container sx={{ mt: 4, mb: 4 }}>
                <Card sx={{ mb: 4 }}>
                    <CardContent>
                        <Typography variant="h5" gutterBottom>1. Capture Trace</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Select value={selectedDevice} onChange={(e) => setSelectedDevice(e.target.value)} sx={{ minWidth: 200 }}>
                                {devices.length > 0 ? devices.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>) : <MenuItem disabled>No Devices Found</MenuItem>}
                            </Select>
                            <Button variant="contained" onClick={handleStartTrace} startIcon={isTracing ? <CircularProgress size={20} color="inherit" /> : <PlayArrowIcon />} disabled={isTracing}>
                                {isTracing ? 'Capturing...' : 'Start 10s Trace'}
                            </Button>
                        </Box>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent>
                        <Typography variant="h5" gutterBottom>2. Run Query</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                            {/* --- FIX IS HERE --- */}
                            <Select value={selectedQuery} onChange={(e) => setSelectedQuery(e.target.value)} sx={{ minWidth: 240 }} disabled={!traceId || isQuerying}>
                                {queries.map((q) => (
                                    <MenuItem key={q.query_id} value={q.query_id}>{q.query_name}</MenuItem>
                                ))}
                            </Select>
                            <Button variant="contained" color="secondary" onClick={handleExecuteQuery} startIcon={<ScienceIcon />} disabled={!traceId || isQuerying || isTracing}>
                                Execute Query
                            </Button>
                        </Box>
                        {renderResultsTable()}
                    </CardContent>
                </Card>
            </Container>

            <Snackbar open={notification.open} autoHideDuration={6000} onClose={() => setNotification({ ...notification, open: false })}>
                <Alert severity={notification.severity} variant="filled" sx={{ width: '100%' }} onClose={() => setNotification({ ...notification, open: false })}>
                    {notification.message}
                </Alert>
            </Snackbar>
        </ThemeProvider>
    );
}

export default App;