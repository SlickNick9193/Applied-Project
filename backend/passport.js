const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const MicrosoftStrategy = require('passport-microsoft').Strategy;
const pool = require('./db');

// Finds existing user by provider+id or creates a new one
async function findOrCreateUser(provider, profile) {
  const providerId = profile.id;
  const email =
    profile.emails && profile.emails.length > 0
      ? profile.emails[0].value
      : null;
  const displayName = profile.displayName || email || 'Unknown';
  const avatarUrl =
    profile.photos && profile.photos.length > 0
      ? profile.photos[0].value
      : null;

  const existing = await pool.query(
    'SELECT * FROM users WHERE provider = $1 AND provider_id = $2',
    [provider, providerId]
  );

  if (existing.rows.length > 0) {
    await pool.query(
      'UPDATE users SET last_login = NOW(), display_name = $1, avatar_url = $2 WHERE id = $3',
      [displayName, avatarUrl, existing.rows[0].id]
    );
    return existing.rows[0];
  }

  // Bootstrap: if this is the very first user in the system, promote them to admin.
  // Every subsequent OAuth signup defaults to 'viewer' and must be promoted by an admin.
  const userCountResult = await pool.query('SELECT COUNT(*)::int AS count FROM users');
  const role = userCountResult.rows[0].count === 0 ? 'admin' : 'viewer';

  const result = await pool.query(
    `INSERT INTO users (email, display_name, avatar_url, provider, provider_id, role, last_login)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     RETURNING *`,
    [email, displayName, avatarUrl, provider, providerId, role]
  );

  return result.rows[0];
}

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    done(null, result.rows[0] || null);
  } catch (err) {
    done(err, null);
  }
});

// Each strategy is only registered if its env vars are present
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback',
        scope: ['profile', 'email']
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const user = await findOrCreateUser('google', profile);
          done(null, user);
        } catch (err) {
          done(err, null);
        }
      }
    )
  );
  console.log('✓ Google OAuth strategy registered');
} else {
  console.log('⚠ Google OAuth not configured (missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)');
}

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: process.env.GITHUB_CALLBACK_URL || '/auth/github/callback',
        scope: ['user:email']
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const user = await findOrCreateUser('github', profile);
          done(null, user);
        } catch (err) {
          done(err, null);
        }
      }
    )
  );
  console.log('✓ GitHub OAuth strategy registered');
} else {
  console.log('⚠ GitHub OAuth not configured (missing GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET)');
}

if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
  passport.use(
    new MicrosoftStrategy(
      {
        clientID: process.env.MICROSOFT_CLIENT_ID,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
        callbackURL:
          process.env.MICROSOFT_CALLBACK_URL || '/auth/microsoft/callback',
        scope: ['user.read'],
        tenant: process.env.MICROSOFT_TENANT_ID || 'common'
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const user = await findOrCreateUser('microsoft', profile);
          done(null, user);
        } catch (err) {
          done(err, null);
        }
      }
    )
  );
  console.log('✓ Microsoft OAuth strategy registered');
} else {
  console.log('⚠ Microsoft OAuth not configured (missing MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET)');
}

module.exports = passport;