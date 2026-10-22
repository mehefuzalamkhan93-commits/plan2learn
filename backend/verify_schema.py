import sqlite3
conn = sqlite3.connect('smart_planner.db')
cursor = conn.cursor()
cursor.execute("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL")
for row in cursor.fetchall():
    print(row[0])
    print('---')
conn.close()