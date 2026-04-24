import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

const PROVIDER_CONFIG = {
  google: {
    label: "Continue with Google",
    bgColor: "#ffffff",
    textColor: "#3c4043",
    borderColor: "#dadce0",
    hoverBg: "#f8f9fa",
    icon: (
      <svg width="18" height="18" viewBox="0 0 48 48">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
      </svg>
    )
  },
  github: {
    label: "Continue with GitHub",
    bgColor: "#24292f",
    textColor: "#ffffff",
    borderColor: "#24292f",
    hoverBg: "#32383f",
    icon: (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="white">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
      </svg>
    )
  },
  microsoft: {
    label: "Continue with Microsoft",
    bgColor: "#ffffff",
    textColor: "#5e5e5e",
    borderColor: "#8c8c8c",
    hoverBg: "#f2f2f2",
    icon: (
      <svg width="18" height="18" viewBox="0 0 21 21">
        <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
        <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
        <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
        <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
      </svg>
    )
  }
};

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState([]);
  const [hoveredProvider, setHoveredProvider] = useState(null);

  useEffect(() => {
    const oauthError = searchParams.get("error");
    if (oauthError) {
      setError(`OAuth login failed: ${oauthError.replace(/_/g, " ")}`);
    }
  }, [searchParams]);

  useEffect(() => {
    fetch("/auth/providers")
      .then((res) => res.json())
      .then((data) => setProviders(data.providers || []))
      .catch(() => setProviders(["local"])); // Fallback to local only
  }, []);

  // Redirect if already logged in
  useEffect(() => {
    if (localStorage.getItem("token")) {
      navigate("/", { replace: true });
    }
  }, [navigate]);

  async function handleLocalLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Login failed.");
        return;
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("username", data.user?.username || username);
      if (data.user?.avatar) localStorage.setItem("avatar", data.user.avatar);
      navigate("/", { replace: true });
    } catch {
      setError("Unable to connect to server.");
    } finally {
      setLoading(false);
    }
  }

  function handleOAuthLogin(provider) {
    // Redirect to backend OAuth route — browser handles the full OAuth flow
    window.location.href = `/auth/${provider}`;
  }

  const oauthProviders = providers.filter((p) => p !== "local");

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <h2 style={titleStyle}>System Health Hub</h2>
        <p style={subtitleStyle}>Sign in to your account</p>

        {error && <div style={errorStyle}>{error}</div>}

        {/* OAuth Buttons */}
        {oauthProviders.length > 0 && (
          <div style={oauthSectionStyle}>
            {oauthProviders.map((provider) => {
              const config = PROVIDER_CONFIG[provider];
              if (!config) return null;

              const isHovered = hoveredProvider === provider;

              return (
                <button
                  key={provider}
                  onClick={() => handleOAuthLogin(provider)}
                  onMouseEnter={() => setHoveredProvider(provider)}
                  onMouseLeave={() => setHoveredProvider(null)}
                  style={{
                    ...oauthButtonStyle,
                    backgroundColor: isHovered ? config.hoverBg : config.bgColor,
                    color: config.textColor,
                    borderColor: config.borderColor
                  }}
                >
                  <span style={iconWrapStyle}>{config.icon}</span>
                  {config.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Divider */}
        {oauthProviders.length > 0 && (
          <div style={dividerStyle}>
            <span style={dividerLineStyle} />
            <span style={dividerTextStyle}>or sign in with credentials</span>
            <span style={dividerLineStyle} />
          </div>
        )}

        {/* Local Login Form */}
        <div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={inputStyle}
              placeholder="Enter username"
              autoComplete="username"
            />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
              placeholder="Enter password"
              autoComplete="current-password"
              onKeyDown={(e) => e.key === "Enter" && handleLocalLogin(e)}
            />
          </div>

          <button
            onClick={handleLocalLogin}
            disabled={loading}
            style={{
              ...localButtonStyle,
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Styles
const pageStyle = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  minHeight: "70vh",
  padding: "20px"
};

const cardStyle = {
  background: "white",
  borderRadius: 12,
  padding: "40px 36px",
  width: "100%",
  maxWidth: 400,
  boxShadow: "0 4px 24px rgba(0,0,0,0.08)"
};

const titleStyle = {
  margin: "0 0 4px 0",
  fontSize: 24,
  fontWeight: 700,
  color: "#0f172a",
  textAlign: "center"
};

const subtitleStyle = {
  margin: "0 0 24px 0",
  color: "#64748b",
  fontSize: 14,
  textAlign: "center"
};

const errorStyle = {
  background: "#fef2f2",
  color: "#dc2626",
  padding: "10px 14px",
  borderRadius: 8,
  fontSize: 13,
  marginBottom: 16,
  border: "1px solid #fecaca"
};

const oauthSectionStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  marginBottom: 20
};

const oauthButtonStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  width: "100%",
  padding: "10px 16px",
  borderRadius: 8,
  border: "1px solid",
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
  transition: "background-color 0.15s"
};

const iconWrapStyle = {
  display: "flex",
  alignItems: "center"
};

const dividerStyle = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  margin: "20px 0"
};

const dividerLineStyle = {
  flex: 1,
  height: 1,
  background: "#e2e8f0"
};

const dividerTextStyle = {
  color: "#94a3b8",
  fontSize: 12,
  whiteSpace: "nowrap"
};

const fieldStyle = {
  marginBottom: 16
};

const labelStyle = {
  display: "block",
  marginBottom: 6,
  fontSize: 13,
  fontWeight: 600,
  color: "#374151"
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  fontSize: 14,
  boxSizing: "border-box",
  outline: "none"
};

const localButtonStyle = {
  width: "100%",
  padding: "10px 16px",
  background: "#2563eb",
  color: "white",
  border: "none",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  marginTop: 4
};
