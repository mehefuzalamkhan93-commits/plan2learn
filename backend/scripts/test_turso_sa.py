import os
import sys
import libsql
from dotenv import load_dotenv
from sqlalchemy.dialects.sqlite.pysqlite import SQLiteDialect_pysqlite
from sqlalchemy.dialects import registry
from sqlalchemy import create_engine, text

load_dotenv()

raw_url = os.getenv("TURSO_DATABASE_URL", "")
token = os.getenv("TURSO_AUTH_TOKEN", "")

# Custom dialect using official libsql package
class SQLiteDialect_libsql(SQLiteDialect_pysqlite):
    driver = "libsql"
    supports_statement_cache = True

    @classmethod
    def import_dbapi(cls):
        return libsql

    def on_connect(self):
        # Override to avoid calling dbapi_connection.create_function("regexp", ...)
        # which libsql does not implement
        return lambda conn: None

    def create_connect_args(self, url):
        # Determine target database string
        # e.g. libsql://host.turso.io or https://host.turso.io or file path
        db_path = url.database
        if url.host:
            # Reconstruct the remote URL
            scheme = "libsql"
            db_path = f"{scheme}://{url.host}"
            if url.port:
                db_path += f":{url.port}"
            if url.database:
                db_path += f"/{url.database}"
        elif not db_path:
            db_path = ":memory:"

        opts = {}
        # Extract auth_token from query or connect_args
        auth_token = url.query.get("auth_token", token)
        if auth_token:
            opts["auth_token"] = auth_token

        return ([db_path], opts)

# Register dialect
registry.register("sqlite.libsql", __name__, "SQLiteDialect_libsql")

# Test creating engine
engine = create_engine(
    f"sqlite+libsql://{raw_url.replace('libsql://', '').replace('https://', '')}",
    connect_args={"auth_token": token},
    pool_pre_ping=True,
)

print(f"Engine created: {engine}")
with engine.connect() as conn:
    res = conn.execute(text("SELECT 1")).scalar()
    print(f"SQLAlchemy test query scalar: {res}")
    
    conn.execute(text("CREATE TABLE IF NOT EXISTS _turso_test (id INTEGER PRIMARY KEY, note TEXT)"))
    conn.execute(text("INSERT INTO _turso_test (note) VALUES ('hello from sqlalchemy dialect')"))
    conn.commit()
    
    rows = conn.execute(text("SELECT note FROM _turso_test")).fetchall()
    print(f"Rows read from Turso: {rows}")
    
    conn.execute(text("DROP TABLE _turso_test"))
    conn.commit()
    print("Test table dropped successfully!")

print("ALL TESTS PASSED SUCCESSFULLY!")
