// ==========================================
// File: Client/src/components/Layout/SessionControlWidget.jsx
// ==========================================
import { useAuth } from '../../context/AuthContext';
import './SessionControlWidget.scss';

export default function SessionControlWidget({ onSwitchRoleClick }) {
    const { user, activeRoleId, logout, isOpenMode } = useAuth();

    return (
        <div className="session-control-widget-pill" dir="ltr">
            <div className="user-identity-cell">
                <span className="user-icon-beacon" />
                <span className="username-text">
                    {user?.displayName || user?.username || 'Operator'}
                </span>
                <span className="role-tag-badge">
                    {activeRoleId ? activeRoleId.replace('role_', '').toUpperCase() : 'GUEST'}
                </span>
            </div>

            <div className="widget-actions-separator" />

            <div className="session-actions-cell">
                <button
                    type="button"
                    className="session-action-btn switch-role-btn"
                    onClick={onSwitchRoleClick}
                    title="Switch Operational Role"
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <rect x="3" y="3" width="7" height="7" rx="1.5" />
                        <rect x="14" y="3" width="7" height="7" rx="1.5" />
                        <rect x="14" y="14" width="7" height="7" rx="1.5" />
                        <rect x="3" y="14" width="7" height="7" rx="1.5" />
                    </svg>
                    <span>SWITCH ROLE</span>
                </button>

                {!isOpenMode && (
                    <button
                        type="button"
                        className="session-action-btn logout-btn"
                        onClick={logout}
                        title="Release Station / Log Out"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                            <polyline points="16 17 21 12 16 7" />
                            <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                    </button>
                )}
            </div>
        </div>
    );
}