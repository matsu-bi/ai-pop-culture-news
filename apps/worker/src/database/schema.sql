CREATE TABLE IF NOT EXISTS feed_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('AI_MUSIC', 'AI_ART', 'AI_VIDEO', 'AI_MANGA', 'AI_GAMES', 'BUZZ')),
    active BOOLEAN DEFAULT 1,
    last_checked DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS processing_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url_hash TEXT UNIQUE NOT NULL,
    original_url TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'published')),
    feed_source_id INTEGER REFERENCES feed_sources(id),
    discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME,
    retry_count INTEGER DEFAULT 0,
    error_message TEXT
);

CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    queue_id INTEGER REFERENCES processing_queue(id),
    title_ja TEXT NOT NULL,
    lead_ja TEXT NOT NULL,
    facts TEXT NOT NULL, -- JSON array
    background TEXT NOT NULL, -- JSON array of {heading, body}
    editor_note TEXT NOT NULL,
    seo_data TEXT NOT NULL, -- JSON object
    source_data TEXT NOT NULL, -- JSON object
    score REAL NOT NULL,
    wordpress_post_id INTEGER,
    published_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS publication_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id INTEGER REFERENCES articles(id),
    action TEXT NOT NULL CHECK (action IN ('draft', 'publish', 'update', 'delete')),
    wordpress_post_id INTEGER,
    success BOOLEAN NOT NULL,
    response_data TEXT, -- JSON response from WordPress
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS url_hashes (
    url_hash TEXT PRIMARY KEY,
    original_url TEXT NOT NULL,
    title TEXT NOT NULL,
    first_seen DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS title_similarities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title1_hash TEXT NOT NULL,
    title2_hash TEXT NOT NULL,
    similarity_score REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_processing_queue_status ON processing_queue(status);
CREATE INDEX IF NOT EXISTS idx_processing_queue_discovered_at ON processing_queue(discovered_at);
CREATE INDEX IF NOT EXISTS idx_articles_score ON articles(score);
CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at);
CREATE INDEX IF NOT EXISTS idx_url_hashes_first_seen ON url_hashes(first_seen);
