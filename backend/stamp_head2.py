import subprocess
result = subprocess.run(['alembic', 'upgrade', 'add_citations_column'], cwd='D:\\smart-learning-planner\\backend', capture_output=True, text=True)
print('STDOUT:', result.stdout)
print('STDERR:', result.stderr)