const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const passport = require('./passport');
const pool = require('./db');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
const APP_USERNAME = process.env.APP_USERNAME;
const APP_PASSWORD = process.env.APP_PASSWORD;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in the environment.');
}

// Brute-force protection: 10 login attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' }
});

// Audit every login attempt (success or failure) — IP + username + user-agent
async function logLoginAttempt({ username, ip, userAgent, success }) {
  try {
    await pool.query(
      'INSERT INTO login_attempts (username, ip_address, user_agent, success) VALUES ($1, $2, $3, $4)',
      [username || null, ip || null, userAgent || null, success]
    );
  } catch (err) {
    console.error('Failed to log login attempt:', err.message);
  }
}

function createTokenForUser(user) {
  return jwt.sign(
    {
      userId: user.id,
      username: user.display_name || user.email,
      email: user.email,
      provider: user.provider,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
}

// Token passed via URL fragment (#) instead of query string (?) so it stays client-side only
function redirectWithToken(res, user) {
  const token = createTokenForUser(user);
  const username = encodeURIComponent(user.display_name || user.email || 'User');
  const avatar = user.avatar_url ? encodeURIComponent(user.avatar_url) : '';

  res.redirect(
    `${FRONTEND_URL}/oauth-callback#token=${token}&username=${username}&avatar=${avatar}`
  );
}

// Local login — checks DB users first, falls back to env-based credentials
// Rate-limited and audited (see loginLimiter + logLoginAttempt above)
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  const audit = {
    username: username || null,
    ip: req.ip,
    userAgent: req.get('user-agent') || null
  };

  try {
    if (!username || !password) {
      await logLoginAttempt({ ...audit, success: false });
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const dbUser = await pool.query(
      "SELECT * FROM users WHERE email = $1 AND provider = 'local'",
      [username]
    );

    if (dbUser.rows.length > 0) {
      const user = dbUser.rows[0];
      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (validPassword) {
        const token = createTokenForUser(user);
        await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
        await logLoginAttempt({ ...audit, success: true });
        return res.json({
          message: 'Login successful.',
          token,
          user: {
            username: user.display_name || user.email,
            email: user.email,
            avatar: user.avatar_url,
            provider: 'local'
          }
        });
      }
    }

    // Fallback: env-based credentials (only if configured). Env-configured user is admin.
    if (!APP_USERNAME || !APP_PASSWORD ||
        username !== APP_USERNAME || password !== APP_PASSWORD) {
      await logLoginAttempt({ ...audit, success: false });
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const token = jwt.sign({ username, role: 'admin', provider: 'local' }, JWT_SECRET, { expiresIn: '8h' });
    await logLoginAttempt({ ...audit, success: true });
    res.json({
      message: 'Login successful.',
      token,
      user: { username, provider: 'local' }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed.' });
  }
});

// Google OAuth
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));
router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${FRONTEND_URL}/login?error=google_failed` }),
  (req, res) => { redirectWithToken(res, req.user); }
);

// GitHub OAuth
router.get('/github', passport.authenticate('github', { scope: ['user:email'], session: false }));
router.get('/github/callback',
  passport.authenticate('github', { session: false, failureRedirect: `${FRONTEND_URL}/login?error=github_failed` }),
  (req, res) => { redirectWithToken(res, req.user); }
);

// Microsoft OAuth
router.get('/microsoft', passport.authenticate('microsoft', { session: false }));
router.get('/microsoft/callback',
  passport.authenticate('microsoft', { session: false, failureRedirect: `${FRONTEND_URL}/login?error=microsoft_failed` }),
  (req, res) => { redirectWithToken(res, req.user); }
);

// Returns which providers have credentials configured (frontend uses this to show/hide buttons)
router.get('/providers', (req, res) => {
  const providers = [];
  if (process.env.GOOGLE_CLIENT_ID) providers.push('google');
  if (process.env.GITHUB_CLIENT_ID) providers.push('github');
  if (process.env.MICROSOFT_CLIENT_ID) providers.push('microsoft');
  providers.push('local');
  res.json({ providers });
});

module.exports = router;