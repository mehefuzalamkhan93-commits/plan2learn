import os
import sys
import libsql
from dotenv import load_dotenv

load_dotenv()

turso_url = os.getenv("TURSO_DATABASE_URL")
turso_token = os.getenv("TURSO_AUTH_TOKEN")

print(f"Testing Turso connectivity...")
print(f"URL: {turso_url}")
print(f"Token present: {bool(turso_token)}")

try:
    conn = libsql.connect(database=turso_url, auth_token=turso_token)
    print("Connected successfully!")
    cursor = conn.cursor()
    cursor.execute("SELECT 1;")
    res = cursor.fetchall()
    print(f"SELECT 1 result: {res}")
    
    # Check existing tables in Turso
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cursor.fetchall()
    print(f"Existing tables in Turso ({len(tables)}): {[t[0] for t in tables]}")
except Exception as e:
    print(f"Connection failed: {type(e).__name__}: {e}")
    sys.exit(1)
