CREATE TABLE IF NOT EXISTS meter_not_logging (
    id SERIAL PRIMARY KEY,
    cccollector TEXT,
    ccmeter TEXT,
    ccsernumber TEXT,
    phxmap TEXT,
    ccstatus TEXT,
    ccstatusgroup TEXT,
    ccconfiggroup TEXT,
    ccstatusdate TEXT,
    smtrreason TEXT,
    ameter TEXT,
    phxmeter TEXT,
    phxloc TEXT,
    phxoorder TEXT,
    phxforder TEXT,
    phxinst TEXT,
    phxpurch TEXT,
    phxslot TEXT,
    research TEXT,
    self_check TEXT,
    known TEXT,
    inv TEXT,
    badrng TEXT,
    badrng2 TEXT,
    solar TEXT,
    addstatusgrp TEXT,
    in_mif TEXT
);

CREATE TABLE IF NOT EXISTS meter_reprograms (
    id SERIAL PRIMARY KEY,
    meternumber TEXT,
    newratecode TEXT,
    ccrate TEXT,
    firmwareversion TEXT,
    dcw TEXT,
    model TEXT,
    rundate TEXT,
    status TEXT,
    reason TEXT,
    lastupdateddatetime TEXT
);

-- OAuth + local user accounts
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE,
    display_name TEXT,
    avatar_url TEXT,
    provider TEXT,               -- 'google', 'github', 'microsoft', 'local'
    provider_id TEXT,
    password_hash TEXT,          -- only used when provider = 'local'
    role TEXT DEFAULT 'viewer',  -- 'admin', 'editor', 'viewer'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login TIMESTAMPTZ,
    UNIQUE(provider, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_users_provider ON users(provider, provider_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Audit log of every authentication attempt (success or failure)
CREATE TABLE IF NOT EXISTS login_attempts (
    id SERIAL PRIMARY KEY,
    username TEXT,
    ip_address TEXT,
    user_agent TEXT,
    success BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_created_at ON login_attempts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address);
CREATE INDEX IF NOT EXISTS idx_login_attempts_username ON login_attempts(username);