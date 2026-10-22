"""Custom SQLAlchemy SQLite dialect for Turso / libSQL over the network.

Uses the official 'libsql' driver and avoids pysqlite-specific create_function
calls (e.g. regexp) which remote libSQL servers do not implement.
"""

import os
from typing import Any

from sqlalchemy.dialects import registry
from sqlalchemy.dialects.sqlite.pysqlite import SQLiteDialect_pysqlite

try:
    import libsql

    class SQLiteDialect_libsql(SQLiteDialect_pysqlite):
        driver = "libsql"
        supports_statement_cache = True

        @classmethod
        def import_dbapi(cls):
            return libsql

        def on_connect(self):
            # Bypass dbapi_connection.create_function("regexp", ...)
            return lambda conn: None

        def create_connect_args(self, url):
            db_path = url.database
            if url.host:
                scheme = "libsql"
                db_path = f"{scheme}://{url.host}"
                if url.port:
                    db_path += f":{url.port}"
                if url.database:
                    db_path += f"/{url.database}"
            elif not db_path:
                db_path = ":memory:"

            opts: dict[str, Any] = {}
            # Allow auth token from connect_args, URL query, or environment
            auth_token = url.query.get("auth_token", None) or os.getenv("TURSO_AUTH_TOKEN", "")
            if auth_token:
                opts["auth_token"] = auth_token

            return ([db_path], opts)

    # Register the dialect so SQLAlchemy recognizes 'sqlite+libsql://...'
    registry.register("sqlite.libsql", "app.core.turso_dialect", "SQLiteDialect_libsql")
except ImportError:
    libsql = None  # type: ignore
    SQLiteDialect_libsql = None  # type: ignore
