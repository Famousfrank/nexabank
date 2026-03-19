

CREATE DATABASE IF NOT EXISTS nexabank CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE nexabank;

-- ─── Disable FK checks so we can drop in any order ──────────────────────────
SET FOREIGN_KEY_CHECKS = 0;

-- ─── Drop non-auth tables (clears any simulated/seed data) ──────────────────
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS card_requests;
DROP TABLE IF EXISTS limit_upgrade_requests;
DROP TABLE IF EXISTS contacts;
DROP TABLE IF EXISTS budgets;
DROP TABLE IF EXISTS savings_goals;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS accounts;

-- ─── Re-enable FK checks ──────────────────────────────────────────────────────
SET FOREIGN_KEY_CHECKS = 1;

-- ─── Users (DO NOT DROP – auth depends on this) ──────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            CHAR(36)      PRIMARY KEY DEFAULT (UUID()),
  full_name     VARCHAR(120)  NOT NULL,
  email         VARCHAR(255)  NOT NULL UNIQUE,
  phone         VARCHAR(30)   NOT NULL,
  password_hash VARCHAR(255)  NOT NULL,
  avatar        VARCHAR(4)    NOT NULL DEFAULT 'US',
  is_verified   TINYINT(1)    NOT NULL DEFAULT 0,
  is_active     TINYINT(1)    NOT NULL DEFAULT 1,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  tier          TINYINT       NOT NULL DEFAULT 1,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ─── OTP codes (DO NOT DROP) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS otp_codes (
  id         INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  user_id    CHAR(36)      NOT NULL,
  code       CHAR(6)       NOT NULL,
  purpose    ENUM('signup','login','reset') NOT NULL DEFAULT 'login',
  used       TINYINT(1)    NOT NULL DEFAULT 0,
  expires_at DATETIME      NOT NULL,
  created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─── Refresh tokens (DO NOT DROP) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  user_id    CHAR(36)      NOT NULL,
  token      VARCHAR(512)  NOT NULL UNIQUE,
  device     VARCHAR(200)  DEFAULT NULL,
  expires_at DATETIME      NOT NULL,
  created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─── Accounts ─────────────────────────────────────────────────────────────────
CREATE TABLE accounts (
  id          CHAR(36)      PRIMARY KEY DEFAULT (UUID()),
  user_id     CHAR(36)      NOT NULL,
  label       VARCHAR(60)   NOT NULL,
  type        ENUM('checking','savings','credit') NOT NULL,
  card_number CHAR(12)      NOT NULL UNIQUE,
  balance     DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  currency    CHAR(3)       NOT NULL DEFAULT 'USD',
  card_color  VARCHAR(10)   NOT NULL DEFAULT '#c8102e',
  is_frozen      TINYINT(1)     NOT NULL DEFAULT 0,
  card_network   ENUM('visa','mastercard','amex') DEFAULT NULL,
  card_name      VARCHAR(120)   DEFAULT NULL,
  card_pin_hash  VARCHAR(255)   DEFAULT NULL,
  card_status    ENUM('active','frozen','blocked') NOT NULL DEFAULT 'active',
  created_at     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─── Transactions ─────────────────────────────────────────────────────────────
CREATE TABLE transactions (
  id            CHAR(36)      PRIMARY KEY DEFAULT (UUID()),
  account_id    CHAR(36)      NOT NULL,
  user_id       CHAR(36)      NOT NULL,
  type          ENUM('debit','credit','transfer') NOT NULL,
  amount        DECIMAL(14,2) NOT NULL,              -- positive = money in, negative = money out
  balance_after DECIMAL(14,2) NOT NULL,
  description   VARCHAR(200)  NOT NULL,
  category      VARCHAR(40)   NOT NULL DEFAULT 'other',
  status        ENUM('pending','completed','failed','reversed') NOT NULL DEFAULT 'completed',
  reference     VARCHAR(80)   DEFAULT NULL,
  metadata      JSON          DEFAULT NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES accounts(id)  ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id)     ON DELETE CASCADE
);

-- ─── Notifications ────────────────────────────────────────────────────────────
CREATE TABLE notifications (
  id         INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  user_id    CHAR(36)      NOT NULL,
  icon       VARCHAR(10)   NOT NULL DEFAULT '🔔',
  message    VARCHAR(300)  NOT NULL,
  is_read    TINYINT(1)    NOT NULL DEFAULT 0,
  created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─── Limit Upgrade Requests ──────────────────────────────────────────────────
CREATE TABLE limit_upgrade_requests (
  id              CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
  user_id         CHAR(36)     NOT NULL,
  requested_tier  TINYINT      NOT NULL,
  current_tier    TINYINT      NOT NULL DEFAULT 1,
  status          ENUM('pending','approved','declined') NOT NULL DEFAULT 'pending',
  id_document     TEXT         DEFAULT NULL,
  id_type         VARCHAR(60)  DEFAULT NULL,
  credit_history  TEXT         DEFAULT NULL,
  proof_of_income TEXT         DEFAULT NULL,
  purpose         TEXT         NOT NULL,
  decline_reason  VARCHAR(255) DEFAULT NULL,
  reviewed_at     DATETIME     DEFAULT NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─── Card Requests ───────────────────────────────────────────────────────────
CREATE TABLE card_requests (
  id             CHAR(36)    PRIMARY KEY DEFAULT (UUID()),
  user_id        CHAR(36)    NOT NULL,
  card_network   ENUM('visa','mastercard','amex') NOT NULL,
  card_name      VARCHAR(120) NOT NULL,
  status         ENUM('pending','approved','declined') NOT NULL DEFAULT 'pending',
  decline_reason VARCHAR(255) DEFAULT NULL,
  reviewed_at    DATETIME    DEFAULT NULL,
  created_at     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─── Contacts (saved beneficiaries) ──────────────────────────────────────────
CREATE TABLE contacts (
  id             INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  user_id        CHAR(36)      NOT NULL,
  name           VARCHAR(120)  NOT NULL,
  avatar         VARCHAR(4)    NOT NULL,
  account_number VARCHAR(20)   DEFAULT NULL,
  bank           VARCHAR(80)   DEFAULT NULL,
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─── Budgets ──────────────────────────────────────────────────────────────────
CREATE TABLE budgets (
  id         INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  user_id    CHAR(36)      NOT NULL,
  category   VARCHAR(40)   NOT NULL,
  amount     DECIMAL(10,2) NOT NULL,
  period     ENUM('monthly','weekly') NOT NULL DEFAULT 'monthly',
  created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_budget (user_id, category, period),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─── Savings Goals ────────────────────────────────────────────────────────────
CREATE TABLE savings_goals (
  id         INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  user_id    CHAR(36)      NOT NULL,
  name       VARCHAR(100)  NOT NULL,
  icon       VARCHAR(10)   NOT NULL DEFAULT '🎯',
  target     DECIMAL(12,2) NOT NULL,
  saved      DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  deadline   DATE          DEFAULT NULL,
  created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_otp_user ON otp_codes;
DROP INDEX IF EXISTS idx_rt_token  ON refresh_tokens;

CREATE INDEX idx_txn_user    ON transactions  (user_id,    created_at DESC);
CREATE INDEX idx_txn_account ON transactions  (account_id, created_at DESC);
CREATE INDEX idx_notif_user  ON notifications (user_id, is_read, created_at DESC);
CREATE INDEX idx_acct_user   ON accounts      (user_id, type);
CREATE INDEX idx_otp_user    ON otp_codes     (user_id, purpose, expires_at);
CREATE INDEX idx_rt_token    ON refresh_tokens(token);