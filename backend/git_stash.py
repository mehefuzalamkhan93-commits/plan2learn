import subprocess
result = subprocess.run(['git', 'stash', 'list'], cwd='D:\\smart-learning-planner\\backend', capture_output=True, text=True)
print('STDOUT:', result.stdout)
print('STDERR:', result.stderr)