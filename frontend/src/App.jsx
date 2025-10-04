import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
    AppBar, Toolbar, Typography, Container, Select, MenuItem, Button,
    Card, CardContent, CircularProgress, Box, Snackbar, Alert,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
    createTheme, ThemeProvider, CssBaseline
} from '@mui/material';
import AdbIcon from '@mui/icons-material/Adb';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ScienceIcon from '@mui/icons-material/Science';

const API_URL = 'http://localhost:8000/api'; // Your FastAPI backend URL

// A nice dark theme for the UI
const darkTheme = createTheme({
    palette: {
        mode: 'dark',
        primary: { main: '#90caf9' },
        secondary: { main: '#f48fb1' },
    },
});

function App() {
    const [devices, setDevices] = useState([]);
    const [selectedDevice, setSelectedDevice] = useState('');
    const [queries, setQueries] = useState({});
    const [selectedQuery, setSelectedQuery] = useState('');
    const [traceId, setTraceId] = useState(null);
    const [queryResult, setQueryResult] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [notification, setNotification] = useState({ open: false, message: '', severity: 'info' });

    useEffect(() => {
        fetchDevices();
        fetchQueries();
    }, []);

    const fetchDevices = async () => {
        try {
            const response = await axios.get(`${API_URL}/devices`);
            setDevices(response.data.devices);
            if (response.data.devices.length > 0) {
                setSelectedDevice(response.data.devices[0]);
            }
        } catch (error) {
            showNotification(error.response?.data?.detail || 'Could not fetch devices. Is ADB running?', 'error');
        }
    };

    const fetchQueries = async () => {
        try {
            const response = await axios.get(`${API_URL}/queries`);
            setQueries(response.data);
            if (Object.keys(response.data).length > 0) {
                setSelectedQuery(Object.keys(response.data)[0]);
            }
        } catch (error) {
            showNotification('Could not fetch predefined queries.', 'error');
        }
    };

    const showNotification = (message, severity = 'info') => {
        setNotification({ open: true, message, severity });
    };

    const handleStartTrace = async () => {
        if (!selectedDevice) return showNotification('Please select a device.', 'warning');
        setIsLoading(true);
        setQueryResult(null);
        setTraceId(null);
        try {
            const response = await axios.post(`${API_URL}/traces/start`, { device_id: selectedDevice });
            setTraceId(response.data.trace_id);
            showNotification(response.data.message, 'success');
        } catch (error) {
            showNotification(error.response?.data?.detail || 'Failed to start trace.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleRunQuery = async () => {
        if (!traceId) return showNotification('Please start a trace first.', 'warning');
        setIsLoading(true);
        try {
            const response = await axios.post(`${API_URL}/queries/run`, { trace_id: traceId, query_key: selectedQuery });
            setQueryResult(response.data.results.rows); // Perfetto output is in a 'rows' array
        } catch (error) {
            showNotification(error.response?.data?.detail || 'Failed to run query. The trace file might not be ready yet.', 'error');
            setQueryResult(null);
        } finally {
            setIsLoading(false);
        }
    };

    const renderResultsTable = () => {
        if (!queryResult) return <Typography>Run a query to see results.</Typography>;
        if (queryResult.length === 0) return <Typography>Query returned no rows.</Typography>;
        const headers = Object.keys(queryResult[0]);
        return (
            <TableContainer component={Paper} sx={{ maxHeight: '60vh' }}>
                <Table stickyHeader>
                    <TableHead>
                        <TableRow>
                            {headers.map((header) => <TableCell key={header}><b>{header.replace(/_/g, ' ').toUpperCase()}</b></TableCell>)}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {queryResult.map((row, index) => (
                            <TableRow key={index} hover>
                                {headers.map((header) => <TableCell key={header}>{row[header]}</TableCell>)}
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
            <AppBar position="static">
                <Toolbar><AdbIcon sx={{ mr: 2 }} /><Typography variant="h6">Perfetto Automation UI</Typography></Toolbar>
            </AppBar>
            <Container sx={{ mt: 4, mb: 4 }}>
                <Card sx={{ mb: 4 }}>
                    <CardContent>
                        <Typography variant="h5" gutterBottom>Controls</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                            <Select value={selectedDevice} onChange={(e) => setSelectedDevice(e.target.value)} sx={{ minWidth: 200 }}>
                                {devices.length > 0 ? devices.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>) : <MenuItem disabled>No devices found</MenuItem>}
                            </Select>
                            <Button variant="contained" onClick={handleStartTrace} startIcon={isLoading && !traceId ? <CircularProgress size={20} color="inherit" /> : <PlayArrowIcon /> } disabled={isLoading}>Start Trace</Button>
                            <Select value={selectedQuery} onChange={(e) => setSelectedQuery(e.target.value)} sx={{ minWidth: 240 }}>
                                {Object.keys(queries).map((key) => (<MenuItem key={key} value={key}>{key.replace(/_/g, ' ')}</MenuItem>))}
                            </Select>
                            <Button variant="contained" color="secondary" onClick={handleRunQuery} startIcon={isLoading && traceId ? <CircularProgress size={20} color="inherit" /> : <ScienceIcon />} disabled={isLoading || !traceId}>Run Query</Button>
                        </Box>
                        {traceId && <Typography sx={{mt: 2, color: 'text.secondary'}}>Current Trace ID: {traceId}</Typography>}
                    </CardContent>
                </Card>

                <Card>
                    <CardContent>
                        <Typography variant="h5" gutterBottom>Query Results</Typography>
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