import sys
sys.path.insert(0, '.')
from app.models.user import User
print(User.__tablename__)
for col in User.__table__.columns:
    print(f"  {col.name}: {col.type}")