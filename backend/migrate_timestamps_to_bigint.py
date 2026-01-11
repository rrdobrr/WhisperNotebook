#!/usr/bin/env python3
"""
Migration script to convert started_at and queued_at from DATETIME to BIGINT
"""
import sqlite3
import os

db_path = os.getenv("DATABASE_URL", "sqlite:///./whispertranscriber.db")
db_path = db_path.replace("sqlite:///", "").replace("sqlite://", "")
if not db_path.startswith("/"):
    db_path = "./" + db_path

print(f"Migrating database: {db_path}")

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    # Create new table with integer timestamps
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS texts_new (
            id INTEGER PRIMARY KEY,
            title VARCHAR NOT NULL,
            content TEXT NOT NULL,
            status VARCHAR DEFAULT 'unread',
            started_at INTEGER,
            queued_at INTEGER,
            source_type VARCHAR NOT NULL,
            filename VARCHAR,
            original_filename VARCHAR,
            file_type VARCHAR,
            file_size INTEGER,
            duration FLOAT,
            method VARCHAR,
            language VARCHAR,
            cost FLOAT DEFAULT 0.0,
            error_message TEXT,
            extra_metadata JSON,
            created_at TIMESTAMP,
            updated_at TIMESTAMP
        )
    """)

    # Copy data (timestamps will be NULL)
    cursor.execute("""
        INSERT INTO texts_new
        SELECT id, title, content, status, NULL, NULL, source_type, filename,
               original_filename, file_type, file_size, duration, method, language,
               cost, error_message, extra_metadata, created_at, updated_at
        FROM texts
    """)

    # Drop old table and rename
    cursor.execute("DROP TABLE texts")
    cursor.execute("ALTER TABLE texts_new RENAME TO texts")

    conn.commit()
    print("✅ Migration completed successfully!")

except Exception as e:
    conn.rollback()
    print(f"❌ Migration failed: {e}")
    raise
finally:
    conn.close()
