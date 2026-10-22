import sys
sys.path.insert(0, '.')
from app.models.user import StudentProfile, User
from sqlalchemy import inspect

# Inspect User relationships
mapper = inspect(User)
print("User relationships:")
for rel in mapper.relationships:
    print(f"  {rel.key}: {rel.uselist}, {rel.parent} -> {rel.mapper.class_}")

print("\nStudentProfile relationships:")
mapper2 = inspect(StudentProfile)
for rel in mapper2.relationships:
    print(f"  {rel.key}: {rel.uselist}, {rel.parent} -> {rel.mapper.class_}")