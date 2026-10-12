// ==========================================
// File: Features/ExtractorAdvanced/Client/src/components/Timeline/header/TimelineKeystrokes.jsx
// ==========================================
import React, { useState, useEffect, useMemo, memo } from 'react';
import './TimelineKeystrokes.scss';

const MIN_PIXEL_DISTANCE = 8; // סף מרחק בפיקסלים למיזוג אירועים לאשכול

function TimelineKeystrokes({
    activeStationName = '',
    baseEpochMs = 0,
    viewportStartMs = 0,
    viewportDurationMs = 3600000,
    pixelWidth = 1000,
    onSeek
}) {
    const [keystrokes, setKeystrokes] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    // 💡 שליפת נתונים מותאמת Viewport עם ביטול בקשות קודמות בזמן גרירה/זום מהיר
    useEffect(() => {
        if (!activeStationName || !baseEpochMs || viewportDurationMs <= 0) {
            setKeystrokes([]);
            return;
        }

        const abortController = new AbortController();
        const startEpoch = baseEpochMs + viewportStartMs;
        const endEpoch = startEpoch + viewportDurationMs;

        setIsLoading(true);

        const url = `/api/v1/extractor-advanced/keystrokes?stationId=${encodeURIComponent(activeStationName)}&startEpoch=${startEpoch}&endEpoch=${endEpoch}`;

        fetch(url, { signal: abortController.signal })
            .then(res => res.ok ? res.json() : [])
            .then(data => {
                setKeystrokes(Array.isArray(data) ? data : []);
                setIsLoading(false);
            })
            .catch(err => {
                if (err.name !== 'AbortError') {
                    setKeystrokes([]);
                    setIsLoading(false);
                }
            });

        return () => abortController.abort();
    }, [activeStationName, baseEpochMs, viewportStartMs, viewportDurationMs]);

    // 💡 אלגוריתם Clustering מבוסס מרחק פיקסלים (מונע לחלוטין עומס וציפוף שנתות)
    const clusters = useMemo(() => {
        if (!keystrokes.length || viewportDurationMs <= 0 || pixelWidth <= 0) {
            return [];
        }

        const viewStartEpoch = baseEpochMs + viewportStartMs;
        const viewEndEpoch = viewStartEpoch + viewportDurationMs;

        // מיון עולה לפי Epoch
        const sorted = [...keystrokes].sort((a, b) => a.epochMs - b.epochMs);
        const result = [];
        let currentCluster = null;
        let lastPixel = -999;

        for (const evt of sorted) {
            if (evt.epochMs < viewStartEpoch || evt.epochMs > viewEndEpoch) {
                continue;
            }

            const offsetMs = evt.epochMs - baseEpochMs;
            const currentPixel = ((offsetMs - viewportStartMs) / viewportDurationMs) * pixelWidth;

            if (currentCluster && (currentPixel - lastPixel) < MIN_PIXEL_DISTANCE) {
                // מיזוג לאשכול קיים
                currentCluster.events.push(evt);
                currentCluster.endOffsetMs = offsetMs;
                currentCluster.endEpochMs = evt.epochMs;
                lastPixel = currentPixel;
            } else {
                // פתיחת אשכול חדש
                const pct = ((offsetMs - viewportStartMs) / viewportDurationMs) * 100;
                currentCluster = {
                    id: `kc_${evt.epochMs}_${result.length}`,
                    startOffsetMs: offsetMs,
                    endOffsetMs: offsetMs,
                    startEpochMs: evt.epochMs,
                    endEpochMs: evt.epochMs,
                    pct,
                    events: [evt]
                };
                result.push(currentCluster);
                lastPixel = currentPixel;
            }
        }

        return result;
    }, [keystrokes, baseEpochMs, viewportStartMs, viewportDurationMs, pixelWidth]);

    if (!clusters.length) {
        return null;
    }

    return (
        <div className="timeline-keystrokes-layer">
            {clusters.map((cluster) => {
                const count = cluster.events.length;
                const isCluster = count > 1;

                // יצירת תיאור תמציתי ל-Tooltip
                let tooltipSummary;
                if (!isCluster) {
                    tooltipSummary = cluster.events[0].keyCombination;
                } else {
                    const sample = cluster.events.slice(0, 3).map(e => e.keyCombination).join('  ');
                    tooltipSummary = count > 3 ? `${sample} (+${count - 3})` : sample;
                }

                return (
                    <div
                        key={cluster.id}
                        className={`keystroke-tick-node ${isCluster ? 'is-cluster' : 'is-single'}`}
                        style={{ left: `${cluster.pct}%` }}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (onSeek) onSeek(cluster.startOffsetMs);
                        }}
                    >
                        <div className="keystroke-tick-line" />
                        <div className="keystroke-tick-cap">
                            {isCluster && <span className="cluster-count">{count > 99 ? '99+' : count}</span>}
                        </div>

                        {/* תגית Tooltip טקטית */}
                        <div className="keystroke-tooltip">
                            <div className="tooltip-header">
                                <span className="tooltip-type">
                                    {isCluster ? `KEYSTROKE BURST (${count})` : 'KEYSTROKE'}
                                </span>
                            </div>
                            <div className="tooltip-keys">{tooltipSummary}</div>
                            <div className="tooltip-hint">Click to jump</div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default memo(TimelineKeystrokes);