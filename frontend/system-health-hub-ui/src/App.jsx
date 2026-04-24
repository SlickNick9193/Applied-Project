import { BrowserRouter as Router, Routes, Route, Link, Navigate } from "react-router-dom";
import Home from "./pages/Home";
import NotLogging from "./pages/NotLogging";
import Reprograms from "./pages/Reprograms";
import Login from "./pages/Login";
import OAuthCallback from "./pages/OAuthCallback";

function ProtectedRoute({ children }) {
  const token = localStorage.getItem("token");
  return token ? children : <Navigate to="/login" replace />;
}

function Layout({ children }) {
  const token = localStorage.getItem("token");
  const username = localStorage.getItem("username");
  const avatar = localStorage.getItem("avatar");

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("avatar");
    window.location.href = "/login";
  }

  return (
    <div style={appStyle}>
      <header style={headerStyle}>
        <div style={headerTopStyle}>
          <div>
            <h1 style={titleStyle}>System Health Hub</h1>
            <p style={subtitleStyle}>Operational Dashboard</p>
          </div>

          {token && (
            <div style={userAreaStyle}>
              {avatar && (
                <img
                  src={avatar}
                  alt=""
                  style={avatarStyle}
                  referrerPolicy="no-referrer"
                />
              )}
              <span style={userTextStyle}>
                {username ? `Signed in as ${username}` : "Signed in"}
              </span>
              <button style={logoutButtonStyle} onClick={handleLogout}>
                Logout
              </button>
            </div>
          )}
        </div>

        {token && (
          <nav style={navStyle}>
            <Link style={linkStyle} to="/">Home</Link>
            <Link style={linkStyle} to="/not-logging">Not Logging</Link>
            <Link style={linkStyle} to="/reprograms">Reprograms</Link>
          </nav>
        )}
      </header>

      <main style={mainStyle}>{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/oauth-callback" element={<OAuthCallback />} />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Home />
              </ProtectedRoute>
            }
          />

          <Route
            path="/not-logging"
            element={
              <ProtectedRoute>
                <NotLogging />
              </ProtectedRoute>
            }
          />

          <Route
            path="/reprograms"
            element={
              <ProtectedRoute>
                <Reprograms />
              </ProtectedRoute>
            }
          />
        </Routes>
      </Layout>
    </Router>
  );
}

const appStyle = {
  minHeight: "100vh",
  background: "#f1f5f9"
};

const headerStyle = {
  background: "#0f172a",
  color: "white",
  padding: "20px 24px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.15)"
};

const headerTopStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "16px",
  flexWrap: "wrap"
};

const titleStyle = {
  margin: 0,
  fontSize: "32px"
};

const subtitleStyle = {
  margin: "6px 0 0 0",
  color: "#cbd5e1"
};

const navStyle = {
  display: "flex",
  gap: "10px",
  marginTop: "16px",
  flexWrap: "wrap"
};

const linkStyle = {
  color: "white",
  textDecoration: "none",
  background: "#2563eb",
  padding: "10px 14px",
  borderRadius: "8px",
  fontSize: "14px",
  fontWeight: "bold"
};

const userAreaStyle = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap"
};

const avatarStyle = {
  width: 32,
  height: 32,
  borderRadius: "50%",
  border: "2px solid #475569"
};

const userTextStyle = {
  color: "#e2e8f0",
  fontSize: "14px"
};

const logoutButtonStyle = {
  border: "none",
  background: "#dc2626",
  color: "white",
  padding: "10px 14px",
  borderRadius: "8px",
  cursor: "pointer",
  fontSize: "14px",
  fontWeight: "bold"
};

const mainStyle = {
  padding: "24px",
  maxWidth: "1400px",
  margin: "0 auto"
};
