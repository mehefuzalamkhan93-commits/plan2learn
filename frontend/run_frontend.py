import os
import sys
import time
import subprocess
import threading
import urllib.request

FRONTEND_DIR = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT", "3000"))

def kill_port():
    try:
        out = subprocess.check_output(['netstat', '-ano'], text=True)
        for line in out.splitlines():
            if f':{PORT} ' in line and 'LISTENING' in line:
                pid = line.split()[-1]
                if int(pid) > 0 and int(pid) != os.getpid():
                    subprocess.call(['taskkill', '/F', '/PID', str(pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass

def stream_reader(pipe):
    try:
        for line in iter(pipe.readline, ''):
            if not line:
                break
            sys.stdout.write(line)
            sys.stdout.flush()
    except Exception:
        pass

def main():
    print(f"[frontend-runner] Starting Next.js supervisor on port {PORT} in {FRONTEND_DIR}...", flush=True)

    cmd = ["cmd.exe", "/c", "npx", "--no-install", "next", "start", "-p", str(PORT), "-H", "0.0.0.0"]

    while True:
        kill_port()
        time.sleep(0.5)

        print(f"[frontend-runner] Spawning: {' '.join(cmd)}", flush=True)
        proc = subprocess.Popen(
            cmd,
            cwd=FRONTEND_DIR,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )

        t = threading.Thread(target=stream_reader, args=(proc.stdout,), daemon=True)
        t.start()

        last_heartbeat = time.time()

        try:
            while True:
                ret = proc.poll()
                if ret is not None:
                    print(f"[frontend-runner] Process exited with code {ret}. Auto-restarting in 2s...", flush=True)
                    time.sleep(2)
                    break

                now = time.time()
                if now - last_heartbeat >= 20:
                    last_heartbeat = now
                    try:
                        with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/", timeout=3) as res:
                            st = res.status
                    except Exception as e:
                        st = f"checking ({e})"
                    print(f"[frontend-runner] [HEALTHCHECK] Next.js port {PORT} responding with HTTP {st}", flush=True)

                time.sleep(0.5)
        except (KeyboardInterrupt, SystemExit):
            try:
                subprocess.call(['taskkill', '/F', '/T', '/PID', str(proc.pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except Exception:
                pass
            break

if __name__ == "__main__":
    main()
