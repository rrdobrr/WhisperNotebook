"""
Migration: Fix timestamp column types from TIMESTAMP to INTEGER

The started_at and queued_at columns were incorrectly created as TIMESTAMP instead of INTEGER.
This migration recreates them as INTEGER columns to store milliseconds since epoch.
"""

import sqlite3
import os

def migrate():
    db_path = os.getenv("DATABASE_URL", "sqlite:///./whispertranscriber.db")
    db_path = db_path.replace("sqlite:///", "").replace("sqlite://", "")
    if not db_path.startswith("/"):
        db_path = "./" + db_path

    print(f"Migrating database: {db_path}")

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # Check current column types
        cursor.execute("PRAGMA table_info(texts)")
        columns = {row[1]: row[2] for row in cursor.fetchall()}

        print(f"Current started_at type: {columns.get('started_at', 'NOT FOUND')}")
        print(f"Current queued_at type: {columns.get('queued_at', 'NOT FOUND')}")

        # Check if columns are TIMESTAMP (wrong type)
        needs_migration = False
        if columns.get('started_at') == 'TIMESTAMP':
            needs_migration = True
            print("⚠️ started_at is TIMESTAMP, should be INTEGER")
        if columns.get('queued_at') == 'TIMESTAMP':
            needs_migration = True
            print("⚠️ queued_at is TIMESTAMP, should be INTEGER")

        if not needs_migration:
            print("✅ Columns are already INTEGER type, no migration needed")
            return

        print("\n🔄 Starting migration...")

        # SQLite doesn't support ALTER COLUMN, so we need to recreate the table
        # Step 1: Create new columns with correct type
        cursor.execute("ALTER TABLE texts ADD COLUMN started_at_new INTEGER")
        cursor.execute("ALTER TABLE texts ADD COLUMN queued_at_new INTEGER")

        # Step 2: Copy data (SQLite TIMESTAMP values will be converted to integers)
        # If the old values are NULL or invalid, set to NULL
        cursor.execute("""
            UPDATE texts
            SET started_at_new = CASE
                WHEN started_at IS NOT NULL AND CAST(started_at AS INTEGER) > 0
                THEN CAST(started_at AS INTEGER)
                ELSE NULL
            END
        """)
        cursor.execute("""
            UPDATE texts
            SET queued_at_new = CASE
                WHEN queued_at IS NOT NULL AND CAST(queued_at AS INTEGER) > 0
                THEN CAST(queued_at AS INTEGER)
                ELSE NULL
            END
        """)

        # Step 3: Drop old columns (SQLite way: create temp table, copy data, rename)
        # Get all column definitions except started_at and queued_at
        cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='texts'")
        create_table_sql = cursor.fetchone()[0]
        print(f"\nOriginal table schema:\n{create_table_sql}\n")

        # Backup table
        cursor.execute("ALTER TABLE texts RENAME TO texts_backup")

        # Create new table with correct schema
        cursor.execute("""
            CREATE TABLE texts (
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Copy data from backup to new table
        cursor.execute("""
            INSERT INTO texts
            SELECT
                id, title, content, status, started_at_new, queued_at_new,
                source_type, filename, original_filename, file_type, file_size,
                duration, method, language, cost, error_message, extra_metadata,
                created_at, updated_at
            FROM texts_backup
        """)

        # Drop backup table
        cursor.execute("DROP TABLE texts_backup")

        conn.commit()
        print("✅ Migration completed successfully!")

        # Verify new types
        cursor.execute("PRAGMA table_info(texts)")
        new_columns = {row[1]: row[2] for row in cursor.fetchall()}
        print(f"\n✓ New started_at type: {new_columns.get('started_at')}")
        print(f"✓ New queued_at type: {new_columns.get('queued_at')}")

    except Exception as e:
        print(f"❌ Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
