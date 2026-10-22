import subprocess
import sys

result = subprocess.run(
    [sys.executable, "-m", "pytest", "backend/tests/test_ai_chat.py::test_ai_chat_persists_academic_context_and_exams", "-v", "--tb=long"],
    cwd="D:\\smart-learning-planner",
    capture_output=True,
    text=True,
)
print("STDOUT:")
print(result.stdout)
print("STDERR:")
print(result.stderr)