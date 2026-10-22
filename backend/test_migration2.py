import sys
from alembic import command
sys.path.insert(0, '.')
from alembic.config import Config
config = Config('alembic.ini')
try:
    command.upgrade(config, 'add_notebooks_and_sources')
    print('Migration applied successfully')
except Exception as e:
    print(f'Error: {e}')