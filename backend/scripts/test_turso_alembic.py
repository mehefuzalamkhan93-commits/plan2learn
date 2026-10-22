import os
import sys
import libsql
from dotenv import load_dotenv

load_dotenv()

raw_url = os.getenv("TURSO_DATABASE_URL", "")
token = os.getenv("TURSO_AUTH_TOKEN", "")

if not raw_url or not token:
    print("Error: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set.")
    sys.exit(1)

# Ensure backend root is in sys.path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

# Import custom dialect register from app.core.database or define here
from sqlalchemy.dialects.sqlite.pysqlite import SQLiteDialect_pysqlite
from sqlalchemy.dialects import registry
from sqlalchemy import create_engine

class SQLiteDialect_libsql(SQLiteDialect_pysqlite):
    driver = "libsql"
    supports_statement_cache = True

    @classmethod
    def import_dbapi(cls):
        return libsql

    def on_connect(self):
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

        opts = {}
        auth_token = url.query.get("auth_token", token)
        if auth_token:
            opts["auth_token"] = auth_token

        return ([db_path], opts)

registry.register("sqlite.libsql", __name__, "SQLiteDialect_libsql")

clean_host = raw_url.replace("libsql://", "").replace("https://", "").rstrip("/")
engine = create_engine(
    f"sqlite+libsql://{clean_host}",
    connect_args={"auth_token": token},
    pool_pre_ping=True,
)

from alembic.config import Config
from alembic import command

alembic_cfg = Config(os.path.join(backend_dir, "alembic.ini"))
alembic_cfg.set_main_option("script_location", os.path.join(backend_dir, "alembic"))

# Override run_migrations_online with our engine
from alembic import context
from app.models import Base

print("Running Alembic migration 'upgrade head' on Turso...")
with engine.connect() as connection:
    alembic_cfg.attributes['connection'] = connection
    
    # We can invoke command.upgrade using a custom env or by running migration
    def run_upgrade():
        context.configure(
            connection=connection,
            target_metadata=Base.metadata,
            render_as_batch=True,
        )
        with context.begin_transaction():
            context.run_migrations()

    # Let's test using alembic command directly
    try:
        command.upgrade(alembic_cfg, "head")
        print("Alembic upgrade head completed successfully on Turso!")
    except Exception as e:
        print(f"Alembic error: {e}")
        import traceback
        traceback.print_exc()

# Verify created tables in Turso
conn = libsql.connect(database=raw_url, auth_token=token)
c = conn.cursor()
c.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
tables = [row[0] for row in c.fetchall()]
print(f"Verified tables in Turso ({len(tables)}):")
for t in tables:
    print(f"  - {t}")

c.execute("SELECT version_num FROM alembic_version;")
v = c.fetchone()
print(f"Alembic version in Turso: {v[0] if v else 'None'}")
