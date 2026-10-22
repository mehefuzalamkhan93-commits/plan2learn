import subprocess
import sys

result = subprocess.run(
    [sys.executable, "-m", "pytest", "backend/tests", "-v", "--tb=short"],
    cwd="D:\\smart-learning-planner",
    capture_output=True,
    text=True,
)
print("STDOUT:")
print(result.stdout)
print("STDERR:")
print(result.stderr)
print("\nReturn code:", result.returncode)