-- Run with a MySQL administrator, then fill backend/.env credentials.
CREATE DATABASE IF NOT EXISTS lingopress CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE lingopress;
CREATE TABLE IF NOT EXISTS app_store (
 store_key VARCHAR(190) PRIMARY KEY,
 payload JSON NOT NULL,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS articles (
 id VARCHAR(64) PRIMARY KEY,
 url VARCHAR(2048) NOT NULL,
 category VARCHAR(80) NOT NULL,
 published_at DATETIME(3) NOT NULL,
 content_hash CHAR(64) NOT NULL,
 record JSON NOT NULL,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_articles_date(published_at),
 INDEX idx_articles_category_date(category,published_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS article_images (
 id CHAR(64) PRIMARY KEY,
 article_id VARCHAR(64) NOT NULL,
 source_url VARCHAR(2048) NOT NULL,
 content_type VARCHAR(100) NOT NULL,
 content_hash CHAR(64) NOT NULL,
 bytes LONGBLOB NOT NULL,
 alt TEXT,
 caption TEXT,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_images_article(article_id),
 CONSTRAINT fk_images_article FOREIGN KEY(article_id) REFERENCES articles(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS article_translations (
 article_id VARCHAR(64) NOT NULL,
 content_hash CHAR(64) NOT NULL,
 model VARCHAR(190) NOT NULL,
 target_language VARCHAR(16) NOT NULL DEFAULT 'vi',
 payload JSON NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY(article_id,content_hash,model,target_language),
 CONSTRAINT fk_translations_article FOREIGN KEY(article_id) REFERENCES articles(id) ON DELETE CASCADE
) ENGINE=InnoDB;
-- Create a dedicated least-privilege app account with a password of your choice.
-- GRANT SELECT, INSERT, UPDATE, CREATE ON lingopress.* TO 'lingopress'@'localhost';
CREATE TABLE IF NOT EXISTS translation_jobs (
 id CHAR(36) PRIMARY KEY,
 article_id VARCHAR(64) NOT NULL,
 cache_key CHAR(64) NOT NULL,
 model VARCHAR(190) NOT NULL,
 target_language VARCHAR(16) NOT NULL,
 state VARCHAR(16) NOT NULL,
 active_key CHAR(64) UNIQUE,
 source_sentences JSON NOT NULL,
 result JSON NULL,
 error TEXT NULL,
 created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
 updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 INDEX idx_translation_jobs_state(state,created_at),
 CONSTRAINT fk_translation_jobs_article FOREIGN KEY(article_id) REFERENCES articles(id) ON DELETE CASCADE
) ENGINE=InnoDB;
