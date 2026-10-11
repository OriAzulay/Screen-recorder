// ==========================================
// File: ClientApp/src/App.jsx
// ==========================================
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as signalR from '@microsoft/signalr';
import CommandCenterHeader from './components/Layout/CommandCenterHeader';
import GlobalJobIndicator from './components/Layout/GlobalJobIndicator';
import DashboardGrid from './components/Dashboard/DashboardGrid';
import SettingsModal from './components/Settings/SettingsModal';
import './App.scss';

const LOCAL_WALLPAPERS = {
    dawn: '/images/wallpapers/dawn.jpg',
    day: '/images/wallpapers/day.jpg',
    dusk: '/images/wallpapers/dusk.jpg',
    night: '/images/wallpapers/night.jpg'
};

const resolveTimeOfDay = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 8) return 'dawn';
    if (hour >= 8 && hour < 17) return 'day';
    if (hour >= 17 && hour < 20) return 'dusk';
    return 'night';
};

const DISCONNECT_GRACE_PERIOD_MS = 8000;

export default function App() {
    const [stations, setStations] = useState([]);
    const [serverTelemetry, setServerTelemetry] = useState(null);
    const [systemConfig, setSystemConfig] = useState(null);
    const [actionPending, setActionPending] = useState({});

    const [isServerOfflineModal, setIsServerOfflineModal] = useState(false);
    const [lastServerContact, setLastServerContact] = useState(new Date());
    const [isRetryingConnection, setIsRetryingConnection] = useState(false);
    const lastContactTimestampRef = useRef(Date.now());

    const [hideOffline, setHideOffline] = useState(true);
    const [isFaultFilterActive, setIsFaultFilterActive] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [timeOfDay, setTimeOfDay] = useState(resolveTimeOfDay);

    useEffect(() => {
        const interval = setInterval(() => {
            const current = resolveTimeOfDay();
            setTimeOfDay(prev => (prev !== current ? current : prev));
        }, 60000);
        return () => clearInterval(interval);
    }, []);

    const isDev = import.meta.env.DEV;
    const apiBaseUrl = isDev ? (import.meta.env?.VITE_API_BASE_URL || '') : '';

    useEffect(() => {
        const handleGlobalContextMenu = (e) => {
            if (e.target.closest('input, textarea, [contenteditable="true"]')) return;
            if (e.target.closest('[data-allow-context="true"]')) return;
            e.preventDefault();
        };

        window.addEventListener('contextmenu', handleGlobalContextMenu);
        return () => {
            window.removeEventListener('contextmenu', handleGlobalContextMenu);
        };
    }, []);

    const registerServerHeartbeat = useCallback(() => {
        lastContactTimestampRef.current = Date.now();
        setLastServerContact(new Date());
        setIsServerOfflineModal(false);
        setIsRetryingConnection(false);
    }, []);

    useEffect(() => {
        const checkConnectionTicker = setInterval(() => {
            const elapsedSinceLastContact = Date.now() - lastContactTimestampRef.current;
            if (elapsedSinceLastContact >= DISCONNECT_GRACE_PERIOD_MS) {
                setIsServerOfflineModal(true);
            } else {
                setIsServerOfflineModal(false);
            }
        }, 1000);

        return () => clearInterval(checkConnectionTicker);
    }, []);

    const fetchStations = useCallback(async () => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3500);

            let res = await fetch(`${apiBaseUrl}/api/v1/dashboard/stations`, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!res.ok) {
                res = await fetch(`${apiBaseUrl}/api/agents`);
            }

            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    setStations(data);
                }
                registerServerHeartbeat();
            }
        } catch (err) {
            console.warn('[App] fetchStations timeout or error:', err.message);
        }
    }, [apiBaseUrl, registerServerHeartbeat]);

    const fetchSystemConfig = useCallback(async () => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3500);

            let res = await fetch(`${apiBaseUrl}/api/v1/settings`, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!res.ok) {
                res = await fetch(`${apiBaseUrl}/api/system/config`);
            }
            if (res.ok) {
                const data = await res.json();
                setSystemConfig(data);
                registerServerHeartbeat();
            }
        } catch (err) {
            console.warn('[App] fetchSystemConfig timeout or error:', err.message);
        }
    }, [apiBaseUrl, registerServerHeartbeat]);

    useEffect(() => {
        let isMounted = true;
        const loadInitialData = async () => {
            try {
                await Promise.allSettled([
                    fetchStations(),
                    fetchSystemConfig()
                ]);
            } catch (err) {
                console.error('[App] Failed to load initial data:', err);
            }
        };

        if (isMounted) loadInitialData();

        const heartbeatInterval = setInterval(() => {
            fetchStations();
        }, 4000);

        return () => {
            isMounted = false;
            clearInterval(heartbeatInterval);
        };
    }, [fetchStations, fetchSystemConfig]);

    useEffect(() => {
        const hubUrl = `${apiBaseUrl}/hubs/telemetry`;
        const connection = new signalR.HubConnectionBuilder()
            .withUrl(hubUrl)
            .withAutomaticReconnect({
                nextRetryDelayInMilliseconds: (retryContext) => {
                    if (retryContext.previousRetryCount === 0) return 0;
                    if (retryContext.previousRetryCount <= 3) return 2000;
                    return 5000;
                }
            })
            .build();

        connection.onreconnecting(() => {
            console.warn('[App] SignalR reconnecting...');
        });

        connection.onreconnected(() => {
            console.log('[App] SignalR reconnected successfully.');
            registerServerHeartbeat();
            fetchStations();
            fetchSystemConfig();
        });

        connection.onclose(() => {
            console.warn('[App] SignalR closed. Retrying in 5s...');
            setTimeout(() => {
                connection.start()
                    .then(registerServerHeartbeat)
                    .catch(() => { });
            }, 5000);
        });

        connection.on('ReceiveServerTelemetry', (telemetry) => {
            if (!telemetry) return;
            registerServerHeartbeat();
            setServerTelemetry(prev => {
                if (!prev) return telemetry;
                return {
                    ...prev,
                    ...telemetry,
                    uptimeSeconds: telemetry.uptimeSeconds ?? telemetry.systemUptimeSeconds ?? prev.uptimeSeconds ?? prev.systemUptimeSeconds,
                    cpuPct: telemetry.cpuPct !== undefined ? telemetry.cpuPct : prev.cpuPct,
                    hostRamPct: telemetry.hostRamPct !== undefined ? telemetry.hostRamPct : prev.hostRamPct,
                    storagePool: telemetry.storagePool !== undefined ? telemetry.storagePool : prev.storagePool,
                    netUtilPct: telemetry.netUtilPct !== undefined ? telemetry.netUtilPct : prev.netUtilPct
                };
            });
        });

        connection.on('ReceiveMaintenanceJob', (job) => {
            registerServerHeartbeat();
            setServerTelemetry(prev => ({
                ...prev,
                maintenanceJob: job
            }));
        });

        connection.on('ReceiveAgentMetrics', (report) => {
            if (!report) return;
            registerServerHeartbeat();
            setStations(prev => {
                const host = (report.hostname || report.stationId || '').toLowerCase();
                const idx = prev.findIndex(s => (s.hostname || s.stationId || '').toLowerCase() === host);
                const isOnline = report.status === 1 || report.status === 2 || report.isProcessRunning || report.isOnline;

                if (idx > -1) {
                    const copy = [...prev];
                    copy[idx] = { ...copy[idx], ...report, isOnline };
                    return copy;
                }
                return [...prev, { ...report, isOnline }];
            });
        });

        connection.on('ReceiveAllStations', (allStations) => {
            if (Array.isArray(allStations)) {
                registerServerHeartbeat();
                setStations(allStations);
            }
        });

        connection.start()
            .then(registerServerHeartbeat)
            .catch(err => {
                console.error('[App] Initial SignalR Connection Error:', err);
            });

        return () => { connection.stop(); };
    }, [apiBaseUrl, fetchStations, fetchSystemConfig, registerServerHeartbeat]);

    const handleManualRetry = async () => {
        setIsRetryingConnection(true);
        await Promise.allSettled([
            fetchStations(),
            fetchSystemConfig()
        ]);
        setIsRetryingConnection(false);
    };

    const sortedStations = useMemo(() => {
        return [...stations].sort((a, b) => {
            const nameA = (a.displayName || a.hostname || '').toLowerCase();
            const nameB = (b.displayName || b.hostname || '').toLowerCase();
            return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
        });
    }, [stations]);

    const handleSettingsSaved = useCallback(async () => {
        await fetchStations();
        await fetchSystemConfig();
    }, [fetchStations, fetchSystemConfig]);

    const handleToggleStream = async (hostname, isCurrentlyStreaming, policy = {}) => {
        setActionPending(prev => ({ ...prev, [hostname]: true }));
        const targetEnable = !isCurrentlyStreaming;
        const queryParams = new URLSearchParams({ enable: targetEnable });
        if (targetEnable && policy.bitrate) queryParams.append('bitrate', policy.bitrate);
        if (targetEnable && policy.fps) queryParams.append('fps', policy.fps);

        try {
            const res = await fetch(`${apiBaseUrl}/api/v1/agent/command/${hostname}?${queryParams.toString()}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (res.ok) {
                setStations(prev => prev.map(st => st.hostname === hostname ? { ...st, isStreaming: targetEnable } : st));
            }
        } catch (err) {
            console.error(`[App] Error toggling stream for ${hostname}:`, err);
        } finally {
            setActionPending(prev => ({ ...prev, [hostname]: false }));
        }
    };

    const handleBulkStart = async (targetHostnames = [], policy = {}) => {
        try {
            const res = await fetch(`${apiBaseUrl}/api/v1/agent/fleet-streaming-policy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    enable: true,
                    hostnames: targetHostnames.length > 0 ? targetHostnames : null,
                    bitrate: policy.bitrate || null,
                    fps: policy.fps || null
                })
            });

            if (res.ok) {
                setStations(prev => prev.map(s => {
                    const shouldUpdate = targetHostnames.length === 0 || targetHostnames.includes(s.hostname);
                    return (shouldUpdate && s.isOnline) ? { ...s, isStreaming: true } : s;
                }));
            }
        } catch (err) {
            console.error('[App] Failed bulk start:', err);
        }
    };

    const handleBulkStop = async (targetHostnames = []) => {
        try {
            const res = await fetch(`${apiBaseUrl}/api/v1/agent/fleet-streaming-policy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    enable: false,
                    hostnames: targetHostnames.length > 0 ? targetHostnames : null
                })
            });

            if (res.ok) {
                setStations(prev => prev.map(s => {
                    const shouldUpdate = targetHostnames.length === 0 || targetHostnames.includes(s.hostname);
                    return shouldUpdate ? { ...s, isStreaming: false } : s;
                }));
            }
        } catch (err) {
            console.error('[App] Failed bulk stop:', err);
        }
    };

    return (
        <div className={`itb-command-center-root ${isServerOfflineModal ? 'is-server-blurred' : ''}`} dir="ltr">
            <div
                className="dynamic-wallpaper-layer"
                style={{ backgroundImage: `url(${LOCAL_WALLPAPERS[timeOfDay]})` }}
                aria-hidden="true"
            />
            <div className="dynamic-scrim-overlay" aria-hidden="true" />

            <div className="itb-command-center-app">
                <CommandCenterHeader
                    stations={sortedStations}
                    serverTelemetry={serverTelemetry}
                    systemConfig={systemConfig}
                    isSettingsOpen={isSettingsOpen}
                    onOpenSettings={() => setIsSettingsOpen(prev => !prev)}
                    hideOffline={hideOffline}
                    isFaultFilterActive={isFaultFilterActive}
                    onToggleFaultFilter={() => setIsFaultFilterActive(prev => !prev)}
                    isServerConnected={!isServerOfflineModal}
                    lastServerContact={lastServerContact}
                />

                <DashboardGrid
                    stations={sortedStations}
                    actionPending={actionPending}
                    onToggleStream={handleToggleStream}
                    onBulkStart={handleBulkStart}
                    onBulkStop={handleBulkStop}
                    onUpdateStationSettings={setStations}
                    systemConfig={systemConfig}
                    onSystemConfigUpdate={setSystemConfig}
                    direction="ltr"
                    hideOffline={hideOffline}
                    onToggleHideOffline={() => setHideOffline(prev => !prev)}
                    isFaultFilterActive={isFaultFilterActive}
                    onExitFaultFilter={() => setIsFaultFilterActive(false)}
                    isServerConnected={!isServerOfflineModal}
                />

                {isSettingsOpen && (
                    <SettingsModal
                        onClose={() => setIsSettingsOpen(false)}
                        onSettingsSaved={handleSettingsSaved}
                    />
                )}

                <GlobalJobIndicator />
            </div>

            {/* Tactical C2 Server Disconnection Modal */}
            {isServerOfflineModal && (
                <div className="tactical-modal-backdrop" role="dialog" aria-modal="true">
                    <div className="tactical-disconnect-modal-card">
                        <div className="modal-top-accent-bar" />

                        <div className="modal-header-section">
                            <div className="disconnect-radar-emitter">
                                <div className="radar-ring" />
                                <div className="radar-core-dot" />
                            </div>
                            <div className="modal-title-group">
                                <span className="modal-sub-tag">SYSTEM HEALTH ALERT</span>
                                <h2 className="modal-main-title">C2 SERVER LINK LOST</h2>
                            </div>
                        </div>

                        <div className="modal-body-section">
                            <p className="modal-explanation">
                                Communication with the central recording server has been lost. The display has been frozen to prevent stale telemetry display or invalid remote command dispatches.
                            </p>

                            <div className="disconnect-diagnostics-box">
                                <div className="diag-row">
                                    <span className="diag-label">STATUS</span>
                                    <span className="diag-val red">SERVER OFFLINE (CONNECTION DROPPED)</span>
                                </div>
                                <div className="diag-row">
                                    <span className="diag-label">LAST CONTACT</span>
                                    <span className="diag-val mono">
                                        {lastServerContact ? lastServerContact.toLocaleTimeString() : 'N/A'}
                                    </span>
                                </div>
                                <div className="diag-row">
                                    <span className="diag-label">AUTO-RETRY</span>
                                    <span className="diag-val cyan">
                                        <span className="spinning-dot" /> RECONNECTING IN BACKGROUND...
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="modal-actions-section">
                            <button
                                type="button"
                                className="btn-modal-reconnect"
                                onClick={handleManualRetry}
                                disabled={isRetryingConnection}
                            >
                                {isRetryingConnection ? (
                                    <>
                                        <span className="action-spinner" />
                                        <span>CHECKING CONNECTION...</span>
                                    </>
                                ) : (
                                    <>
                                        <span>⟳ RECONNECT NOW</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}