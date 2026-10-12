// ==========================================
// File: Client/src/context/AuthContext.jsx
// ==========================================
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

const AuthContext = createContext(null);

const STORAGE_KEYS = {
    TOKEN: 'itb_auth_token',
    USER: 'itb_auth_user',
    ROLE: 'itb_auth_role',
    PERMS: 'itb_auth_perms'
};

export function AuthProvider({ children }) {
    const [authMode, setAuthMode] = useState('Open'); // 'Open' | 'StrictLocal' | 'StrictLdap'
    const [isOpenMode, setIsOpenMode] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState(null);
    const [activeRoleId, setActiveRoleId] = useState(null);
    const [permissions, setPermissions] = useState([]);
    const [isSystemRoot, setIsSystemRoot] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);

    // בדיקת סטטוס אבטחה של השרת
    const checkServerAuthStatus = useCallback(async () => {
        try {
            const res = await fetch('/api/v1/auth/status');
            if (res.ok) {
                const data = await res.json();
                setAuthMode(data.mode);
                setIsOpenMode(data.isOpenMode);
                return data;
            }
        } catch (err) {
            console.error('[AuthContext] Failed to check server auth status:', err);
        }
        return { isOpenMode: true, mode: 'Open' };
    }, []);

    // שחזור סשן קיים מ-sessionStorage
    useEffect(() => {
        const init = async () => {
            const serverStatus = await checkServerAuthStatus();

            const savedToken = sessionStorage.getItem(STORAGE_KEYS.TOKEN);
            const savedUser = sessionStorage.getItem(STORAGE_KEYS.USER);
            const savedRole = sessionStorage.getItem(STORAGE_KEYS.ROLE);
            const savedPerms = sessionStorage.getItem(STORAGE_KEYS.PERMS);

            if (savedToken && savedRole) {
                setUser(savedUser ? JSON.parse(savedUser) : null);
                setActiveRoleId(savedRole);
                const parsedPerms = savedPerms ? JSON.parse(savedPerms) : [];
                setPermissions(parsedPerms);
                setIsAuthenticated(true);
            } else if (serverStatus?.isOpenMode) {
                // במצב Open Mode שבו עדיין לא נבחר תפקיד, הסשן ממתין לבחירה ב-Launchpad
                setIsAuthenticated(false);
            }

            setIsInitialized(true);
        };

        init();
    }, [checkServerAuthStatus]);

    // התחברות עם משתמש וסיסמה (במצב Strict)
    const login = useCallback(async (username, password) => {
        const res = await fetch('/api/v1/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || 'Authentication failed.');
        }

        const data = await res.json();
        setUser(data);
        setIsSystemRoot(Boolean(data.isSystemImmutable));
        sessionStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(data));
        return data;
    }, []);

    // בחירת תפקיד והנפקת טוקן סופי
    const selectRole = useCallback(async (roleId, userIdOverride = null) => {
        const targetUserId = userIdOverride || user?.userId;
        const res = await fetch('/api/v1/auth/select-role', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roleId, userId: targetUserId })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || 'Failed to initialize role session.');
        }

        const data = await res.json();
        sessionStorage.setItem(STORAGE_KEYS.TOKEN, data.token);
        sessionStorage.setItem(STORAGE_KEYS.ROLE, data.roleId);
        sessionStorage.setItem(STORAGE_KEYS.PERMS, JSON.stringify(data.permissions || []));

        setActiveRoleId(data.roleId);
        setPermissions(data.permissions || []);
        setIsSystemRoot(Boolean(data.isRoot));
        setIsAuthenticated(true);

        return data;
    }, [user]);

    // יציאה מסשן / שחרור עמדה
    const logout = useCallback(() => {
        sessionStorage.removeItem(STORAGE_KEYS.TOKEN);
        sessionStorage.removeItem(STORAGE_KEYS.USER);
        sessionStorage.removeItem(STORAGE_KEYS.ROLE);
        sessionStorage.removeItem(STORAGE_KEYS.PERMS);

        setUser(null);
        setActiveRoleId(null);
        setPermissions([]);
        setIsSystemRoot(false);
        setIsAuthenticated(false);
    }, []);

    // בדיקת הרשאה אפקטיבית
    const hasPermission = useCallback((permissionKey) => {
        if (!permissionKey) return true;
        // במצב פתוח (Open Mode) או עבור משתמש-על – כל ההרשאות מאושרות תמיד
        if (isOpenMode || isSystemRoot) return true;
        return permissions.includes(permissionKey);
    }, [isOpenMode, isSystemRoot, permissions]);

    const value = useMemo(() => ({
        isInitialized,
        authMode,
        isOpenMode,
        isAuthenticated,
        user,
        activeRoleId,
        permissions,
        isSystemRoot,
        login,
        selectRole,
        logout,
        hasPermission
    }), [
        isInitialized,
        authMode,
        isOpenMode,
        isAuthenticated,
        user,
        activeRoleId,
        permissions,
        isSystemRoot,
        login,
        selectRole,
        logout,
        hasPermission
    ]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

// 💡 רכיב עטיפה לאכיפה ויזואלית של הרשאות ב-UI
export function Can({ permission, children, fallback = null, disabled = false, disabledTooltip = 'Access restricted' }) {
    const { hasPermission } = useAuth();
    const allowed = hasPermission(permission);

    if (allowed) {
        return <>{children}</>;
    }

    if (disabled) {
        // מציג את הרכיב במצב מנוטרל עם חיווי
        return (
            <span className="permission-disabled-wrapper" title={disabledTooltip} style={{ cursor: 'not-allowed', display: 'inline-flex' }}>
                {React.cloneElement(children, { disabled: true, style: { ...children.props?.style, pointerEvents: 'none', opacity: 0.4 } })}
            </span>
        );
    }

    return fallback;
}