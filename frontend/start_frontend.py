import subprocess
import sys
import os
import time

frontend_dir = os.path.dirname(os.path.abspath(__file__))
next_cli = os.path.join(frontend_dir, "node_modules", "next", "dist", "bin", "next")
cmd = ["node", next_cli, "dev", "-p", "3000"]

print("Starting Next.js dev server on http://localhost:3000...")
sys.stdout.flush()

while True:
    proc = subprocess.Popen(
        cmd,
        cwd=frontend_dir,
        stdin=subprocess.PIPE,
    )
    proc.wait()
    time.sleep(1)
