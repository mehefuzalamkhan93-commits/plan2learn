import subprocess
result = subprocess.run(['alembic', 'heads'], cwd='D:\\smart-learning-planner\\backend', capture_output=True, text=True)
print('STDOUT:', result.stdout)