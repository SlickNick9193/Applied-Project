import { useEffect, useState } from "react";

export default function OAuthCallback() {
  const [error, setError] = useState(null);

  useEffect(() => {
    try {
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);

      const token = params.get("token");
      const username = params.get("username");
      const avatar = params.get("avatar");

      if (!token) {
        setError("No authentication token received. Please try again.");
        return;
      }

      localStorage.setItem("token", token);
      if (username) localStorage.setItem("username", decodeURIComponent(username));
      if (avatar) localStorage.setItem("avatar", decodeURIComponent(avatar));

      // Full page reload so ProtectedRoute and Layout pick up the new token from localStorage
      window.location.replace("/");
    } catch (err) {
      console.error("OAuth callback error:", err);
      setError("Authentication failed. Please try again.");
    }
  }, []);

  if (error) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h2 style={{ color: "#dc2626", margin: "0 0 12px 0" }}>Authentication Error</h2>
          <p style={{ color: "#64748b", margin: "0 0 20px 0" }}>{error}</p>
          <a href="/login" style={buttonStyle}>Back to Login</a>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <p style={{ color: "#64748b", margin: 0 }}>Signing you in...</p>
      </div>
    </div>
  );
}

const containerStyle = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  minHeight: "60vh"
};

const cardStyle = {
  background: "white",
  borderRadius: 12,
  padding: "40px 48px",
  textAlign: "center",
  boxShadow: "0 4px 24px rgba(0,0,0,0.08)"
};

const buttonStyle = {
  display: "inline-block",
  background: "#2563eb",
  color: "white",
  border: "none",
  padding: "10px 24px",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: "bold",
  cursor: "pointer",
  textDecoration: "none"
};
