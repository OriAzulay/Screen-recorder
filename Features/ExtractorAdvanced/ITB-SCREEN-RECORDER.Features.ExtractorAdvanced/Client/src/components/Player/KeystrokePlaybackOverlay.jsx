// ==========================================
// File: Features/ExtractorAdvanced/Client/src/components/Player/KeystrokePlaybackOverlay.jsx
// ==========================================
import React, { useMemo } from 'react';
import './KeystrokePlaybackOverlay.scss';

const DISPLAY_DURATION_MS = 2200;
const FADE_DURATION_MS = 400;

export default function KeystrokePlaybackOverlay({
    currentEpochMs = 0,
    keystrokes = [],
    keystrokeMode = 'BURN_IN' // אפשרויות: 'NONE' | 'CAPTION' | 'BURN_IN'
}) {
    const normalizedMode = (keystrokeMode || 'NONE').toUpperCase();

    // 💡 אם המצב הוא NONE - לא מרנדרים דבר
    const isVisibleMode = normalizedMode === 'BURN_IN' || normalizedMode === 'CAPTION';

    const activeEvent = useMemo(() => {
        if (!isVisibleMode || !keystrokes.length || !currentEpochMs) return null;

        for (let i = keystrokes.length - 1; i >= 0; i--) {
            const k = keystrokes[i];
            const elapsed = currentEpochMs - k.epochMs;

            if (elapsed >= 0 && elapsed <= DISPLAY_DURATION_MS) {
                return {
                    ...k,
                    elapsed
                };
            }
        }
        return null;
    }, [currentEpochMs, keystrokes, isVisibleMode]);

    if (!activeEvent) return null;

    // חישוב שקיפות ה-Fade Out ב-400 המילישניות האחרונות
    let opacity = 1;
    if (activeEvent.elapsed > (DISPLAY_DURATION_MS - FADE_DURATION_MS)) {
        const fadeProgress = (activeEvent.elapsed - (DISPLAY_DURATION_MS - FADE_DURATION_MS)) / FADE_DURATION_MS;
        opacity = Math.max(0, 1 - fadeProgress);
    }

    if (opacity <= 0.05) return null;

    // 💡 מצב 1: כתובית סרטים רכה (Caption) - מוצגת בתחתית הנגן
    if (normalizedMode === 'CAPTION') {
        return (
            <div className="keystroke-overlay-root mode-caption" style={{ opacity }}>
                <div className="caption-bar">
                    <span className="caption-text">[ {activeEvent.keyCombination} ]</span>
                </div>
            </div>
        );
    }

    // 💡 מצב 2: צריבה קשיחה טקטית (Burn-In) - מקשי Keycaps זוהרים במרכז
    const rawKeys = activeEvent.keyCombination.split(/\s*\+\s*/).filter(Boolean);

    return (
        <div className="keystroke-overlay-root mode-burnin" style={{ opacity }}>
            <div className="keycap-cluster">
                {rawKeys.map((key, idx) => (
                    <React.Fragment key={idx}>
                        <div className="keycap-badge">
                            <span className="keycap-text">{key.toUpperCase()}</span>
                        </div>
                        {idx < rawKeys.length - 1 && (
                            <span className="keycap-plus">+</span>
                        )}
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
}