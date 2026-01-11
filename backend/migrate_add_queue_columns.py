"""
Migration script to add queue-related columns to texts table
Run this script once to update the database schema
"""

import sqlite3
import os

# Database path - adjust if needed
DATABASE_PATH = os.getenv("DATABASE_PATH", "./whispertranscriber.db")

def migrate():
    print(f"Connecting to database: {DATABASE_PATH}")
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()

    # Check if columns already exist
    cursor.execute("PRAGMA table_info(texts)")
    columns = [row[1] for row in cursor.fetchall()]

    migrations_needed = []

    if 'started_at' not in columns:
        migrations_needed.append('started_at')

    if 'queued_at' not in columns:
        migrations_needed.append('queued_at')

    if not migrations_needed:
        print("✅ Database is already up to date! No migrations needed.")
        conn.close()
        return

    print(f"⚠️  Need to add columns: {', '.join(migrations_needed)}")

    try:
        # Add started_at column if missing
        if 'started_at' in migrations_needed:
            print("Adding 'started_at' column...")
            cursor.execute("""
                ALTER TABLE texts
                ADD COLUMN started_at TIMESTAMP
            """)
            print("✅ Added 'started_at' column")

        # Add queued_at column if missing
        if 'queued_at' in migrations_needed:
            print("Adding 'queued_at' column...")
            cursor.execute("""
                ALTER TABLE texts
                ADD COLUMN queued_at TIMESTAMP
            """)
            print("✅ Added 'queued_at' column")

        conn.commit()
        print("\n✅ Migration completed successfully!")

    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
