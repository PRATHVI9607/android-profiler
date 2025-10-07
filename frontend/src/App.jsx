import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
    AppBar, Toolbar, Typography, Container, Select, MenuItem, Button,
    Card, CardContent, CircularProgress, Box, Snackbar, Alert,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
    createTheme, ThemeProvider, CssBaseline, LinearProgress, TextField, IconButton,
    Grid
} from '@mui/material';
import {
    Adb as AdbIcon,
    PlayArrow as PlayArrowIcon,
    Science as ScienceIcon,
    Delete as DeleteIcon,
    Add as AddIcon,
    Dashboard as DashboardIcon
} from '@mui/icons-material';
import './index.css';

const API_URL = 'http://localhost:8000/api';

const darkTheme = createTheme({
    palette: {
        mode: 'dark',
        primary: { main: '#0096FF' }, // A brighter blue
        secondary: { main: '#50C878' }, // A complementary green
        background: {
            default: '#121212',
            paper: '#1E1E1E',
        },
        text: {
            primary: '#E0E0E0',
            secondary: '#B0B0B0',
        }
    },
    typography: {
        fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
        h4: { fontWeight: 700, color: '#FFFFFF' },
        h5: { fontWeight: 600, color: '#0096FF' },
    },
});

function App() {
    // State for devices and traces
    const [devices, setDevices] = useState([]);
    const [selectedDevice, setSelectedDevice] = useState('');
    const [traceId, setTraceId] = useState(null);

    // State for queries and results
    const [queries, setQueries] = useState([]);
    const [selectedQuery, setSelectedQuery] = useState('');
    const [queryResult, setQueryResult] = useState(null);
    const [newQueryName, setNewQueryName] = useState('');
    const [newQuerySql, setNewQuerySql] = useState('');

    // State for loading and notifications
    const [isTracing, setIsTracing] = useState(false);
    const [isQuerying, setIsQuerying] = useState(false);
    const [notification, setNotification] = useState({ open: false, message: '', severity: 'info' });

    const pollingIntervalRef = useRef(null);

    useEffect(() => {
        fetchDevices();
        fetchQueries();
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
            setQueries(response.data);
            if (response.data.length > 0 && !selectedQuery) {
                setSelectedQuery(response.data[0].query_id);
            }
        } catch (error) {
            showNotification('Could not fetch queries.', 'error');
        }
    };

    const handleStartTrace = async () => {
        if (!selectedDevice) return showNotification('Please select a device.', 'warning');
        setIsTracing(true);
        setTraceId(null);
        setQueryResult(null);
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);

        try {
            const response = await axios.post(`${API_URL}/traces/start`, { device_id: selectedDevice });
            setTraceId(response.data.trace_id);
            showNotification('Trace started. Please wait ~15 seconds.', 'success');
        } catch (error) {
            showNotification(error.response?.data?.detail || 'Failed to start trace.', 'error');
        } finally {
            setTimeout(() => setIsTracing(false), 15000);
        }
    };

    const handleExecuteQuery = async () => {
        if (!traceId || !selectedQuery) return showNotification('Start a trace and select a query first.', 'warning');
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        setQueryResult(null);
        setIsQuerying(true);

        try {
            const response = await axios.post(`${API_URL}/query/execute`, {
                trace_id: traceId,
                query_id: selectedQuery,
            });

            const dataEndpoint = response.data.data_endpoint;
            pollingIntervalRef.current = setInterval(async () => {
                try {
                    const pollResponse = await axios.get(`http://localhost:8000${dataEndpoint}`);
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

    const handleAddQuery = async () => {
        if (!newQueryName || !newQuerySql) return showNotification('Query Name and SQL cannot be empty.', 'warning');
        try {
            const newQuery = { name: newQueryName, sql: newQuerySql };
            await axios.post(`${API_URL}/queries`, newQuery);
            setNewQueryName('');
            setNewQuerySql('');
            fetchQueries(); // Refresh the list
            showNotification('Custom query added successfully!', 'success');
        } catch (error) {
            showNotification(error.response?.data?.detail || 'Failed to add custom query.', 'error');
        }
    };

    const handleDeleteQuery = async (queryId) => {
        try {
            await axios.delete(`${API_URL}/queries/${queryId}`);
            fetchQueries(); // Refresh the list
            showNotification('Custom query deleted.', 'success');
        } catch (error) {
            showNotification(error.response?.data?.detail || 'Failed to delete custom query.', 'error');
        }
    };

    const showNotification = (message, severity = 'info') => {
        setNotification({ open: true, message, severity });
    };

    const renderResultsTable = () => {
        if (isQuerying) {
            return (
                <Box sx={{ width: '100%', textAlign: 'center', p: 4 }}>
                    <Typography variant="h6" gutterBottom>Processing query...</Typography>
                    <LinearProgress color="primary" />
                    <Typography sx={{ mt: 2, color: 'text.secondary' }}>This may take a moment.</Typography>
                </Box>
            );
        }
        if (!queryResult || !queryResult.rows || queryResult.rows.length === 0) {
            return (
                <Box sx={{ textAlign: 'center', p: 4 }}>
                    <ScienceIcon sx={{ fontSize: 60, color: 'text.secondary' }} />
                    <Typography variant="h6">No Results</Typography>
                    <Typography sx={{ color: 'text.secondary' }}>Run a query to see the output here.</Typography>
                </Box>
            );
        }

        return (
            <TableContainer component={Paper} sx={{ maxHeight: '70vh' }}>
                <Table stickyHeader>
                    <TableHead>
                        <TableRow>{queryResult.columns.map((col) => <TableCell key={col} className="table-header-cell">{col.toUpperCase()}</TableCell>)}</TableRow>
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
            <div className="main-container">
                <AppBar position="static" className="app-bar">
                    <Toolbar>
                        <DashboardIcon sx={{ mr: 2, fontSize: 30 }} />
                        <Typography variant="h4">Android Profiler Dashboard</Typography>
                    </Toolbar>
                </AppBar>

                <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
                    <Grid container spacing={4}>
                        {/* Left Column: Controls */}
                        <Grid item xs={12} md={4}>
                            <Card className="control-card gradient-border">
                                <CardContent>
                                    <Typography variant="h5" gutterBottom>1. Capture Trace</Typography>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                                        <AdbIcon sx={{ color: 'primary.main' }} />
                                        <Select value={selectedDevice} onChange={(e) => setSelectedDevice(e.target.value)} sx={{ flexGrow: 1 }}>
                                            {devices.length > 0 ? devices.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>) : <MenuItem disabled>No Devices Found</MenuItem>}
                                        </Select>
                                    </Box>
                                    <Button fullWidth variant="contained" onClick={handleStartTrace} startIcon={isTracing ? <CircularProgress size={20} /> : <PlayArrowIcon />} disabled={isTracing}>
                                        {isTracing ? 'Capturing (10s)...' : 'Start Trace'}
                                    </Button>
                                </CardContent>
                            </Card>

                            <Card className="control-card gradient-border" sx={{ mt: 4 }}>
                                <CardContent>
                                    <Typography variant="h5" gutterBottom>2. Run Query</Typography>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                                        <ScienceIcon sx={{ color: 'primary.main' }} />
                                        <Select value={selectedQuery} onChange={(e) => setSelectedQuery(e.target.value)} sx={{ flexGrow: 1 }} disabled={!traceId || isQuerying}>
                                            {queries.map((q) => (
                                                <MenuItem key={q.query_id} value={q.query_id}>{q.query_name}</MenuItem>
                                            ))}
                                        </Select>
                                    </Box>
                                    <Button fullWidth variant="contained" color="secondary" onClick={handleExecuteQuery} disabled={!traceId || isQuerying || isTracing}>
                                        Execute Query
                                    </Button>
                                </CardContent>
                            </Card>

                            <Card className="control-card gradient-border" sx={{ mt: 4 }}>
                                <CardContent>
                                    <Typography variant="h5" gutterBottom>3. Custom Queries</Typography>
                                    <TextField label="Query Name" value={newQueryName} onChange={(e) => setNewQueryName(e.target.value)} fullWidth margin="normal" />
                                    <TextField label="SQL Query" value={newQuerySql} onChange={(e) => setNewQuerySql(e.target.value)} fullWidth multiline rows={3} margin="normal" />
                                    <Button fullWidth variant="outlined" onClick={handleAddQuery} startIcon={<AddIcon />}>Add Query</Button>
                                    <Box sx={{ mt: 3 }}>
                                        {queries.filter(q => q.custom).map(q => (
                                            <Paper key={q.query_id} sx={{ p: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, background: '#2a2a2a' }}>
                                                <Typography sx={{ flexGrow: 1 }}>{q.query_name}</Typography>
                                                <IconButton size="small" onClick={() => handleDeleteQuery(q.query_id)}><DeleteIcon /></IconButton>
                                            </Paper>
                                        ))}
                                    </Box>
                                </CardContent>
                            </Card>
                        </Grid>

                        {/* Right Column: Results */}
                        <Grid item xs={12} md={8}>
                            <Card className="results-card gradient-border">
                                <CardContent>
                                    {renderResultsTable()}
                                </CardContent>
                            </Card>
                        </Grid>
                    </Grid>
                </Container>

                <Snackbar open={notification.open} autoHideDuration={6000} onClose={() => setNotification({ ...notification, open: false })}>
                    <Alert severity={notification.severity} variant="filled" sx={{ width: '100%' }} onClose={() => setNotification({ ...notification, open: false })}>
                        {notification.message}
                    </Alert>
                </Snackbar>
            </div>
        </ThemeProvider>
    );
}

export default App;
