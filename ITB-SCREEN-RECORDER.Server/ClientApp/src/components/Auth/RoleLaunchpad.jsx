// ==========================================
// File: Client/src/components/Auth/RoleLaunchpad.jsx
// ==========================================
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import './RoleLaunchpad.scss';

export default function RoleLaunchpad({ onRoleSelected }) {
    const { isOpenMode, login, selectRole } = useAuth();
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedRoleForLogin, setSelectedRoleForLogin] = useState(null);

    // שדות לוגין
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loginError, setLoginError] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        fetch('/api/v1/auth/roles')
            .then(res => res.json())
            .then(data => {
                setRoles(Array.isArray(data) ? data : []);
                setLoading(false);
            })
            .catch(err => {
                console.error('[Launchpad] Failed to fetch roles:', err);
                setLoading(false);
            });
    }, []);

    const handleCardClick = async (role) => {
        if (isOpenMode) {
            // במצב פתוח: כניסה ישירה ללא סיסמה
            try {
                await selectRole(role.id);
                onRoleSelected?.(role);
            } catch (err) {
                console.error('[Launchpad] Failed selecting role in open mode:', err);
            }
        } else {
            // במצב Strict: פתיחת מודאל אימות מול התפקיד הנבחר
            setSelectedRoleForLogin(role);
            setLoginError(null);
        }
    };

    const handleStrictLoginSubmit = async (e) => {
        e.preventDefault();
        if (!username.trim() || !password) return;

        setIsSubmitting(true);
        setLoginError(null);

        try {
            const userData = await login(username.trim(), password);
            await selectRole(selectedRoleForLogin.id, userData.userId);
            onRoleSelected?.(selectedRoleForLogin);
        } catch (err) {
            setLoginError(err.message || 'Login failed.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="role-launchpad-backdrop">
                <div className="launchpad-loader">
                    <span className="pulse-dot"></span>
                    <span>INITIALIZING ROLE LAUNCHPAD…</span>
                </div>
            </div>
        );
    }

    return (
        <div className="role-launchpad-backdrop" dir="ltr">
            <div className="launchpad-container">
                <div className="launchpad-header">
                    <div className="launchpad-brand">
                        <span className="brand-accent">ITB</span>
                        <span className="brand-main">OPERATIONAL ROLES</span>
                    </div>
                    <p className="launchpad-subtitle">
                        {isOpenMode
                            ? 'Open System Mode • Select an operational role to enter the command center'
                            : 'Strict Security Active • Authenticate with your enterprise credentials'}
                    </p>
                </div>

                <div className="roles-tactical-grid">
                    {roles.map(role => (
                        <div
                            key={role.id}
                            className="role-launchpad-card"
                            style={{ '--role-accent': role.color || '#06B6D4' }}
                            onClick={() => handleCardClick(role)}
                        >
                            <div className="role-card-glow-edge" />
                            <div className="role-card-inner">
                                <div className="role-icon-box">
                                    <RoleCardIcon iconName={role.icon} />
                                </div>
                                <h3 className="role-name">{role.name}</h3>
                                <p className="role-desc">{role.description || 'General operational access'}</p>
                                <div className="role-action-pill">
                                    <span>ENTER ROLE</span>
                                    <span className="arrow-glyph">→</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* מודאל לוגין מקדים עבור מצב Strict */}
            {selectedRoleForLogin && (
                <div className="strict-login-modal-overlay" onClick={() => setSelectedRoleForLogin(null)}>
                    <div className="strict-login-modal-card" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <span className="target-role-badge" style={{ backgroundColor: selectedRoleForLogin.color }}>
                                {selectedRoleForLogin.name}
                            </span>
                            <h3>Enterprise Authentication</h3>
                        </div>

                        <form onSubmit={handleStrictLoginSubmit}>
                            {loginError && <div className="login-error-banner">{loginError}</div>}

                            <div className="form-group">
                                <label>Username</label>
                                <input
                                    type="text"
                                    autoFocus
                                    value={username}
                                    onChange={e => setUsername(e.target.value)}
                                    placeholder="Enter username..."
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>Password</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="Enter password..."
                                    required
                                />
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={() => setSelectedRoleForLogin(null)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn-submit" disabled={isSubmitting}>
                                    {isSubmitting ? 'Authenticating…' : 'Authenticate & Enter'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

function RoleCardIcon({ iconName }) {
    switch (iconName?.toLowerCase()) {
        case 'shieldcheck':
        case 'shield':
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <polyline points="9 12 11 14 15 10" />
                </svg>
            );
        case 'activity':
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
            );
        case 'search':
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
            );
        default:
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                </svg>
            );
    }
}