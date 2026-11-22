"""POSIX subprocess guard: stop the agent's group if its owning worker disappears."""

import os
import signal
import subprocess
import sys
import time


def main():
    parent = os.getppid()
    process = subprocess.Popen(sys.argv[1:])
    while process.poll() is None:
        if os.getppid() != parent or parent == 1:
            os.killpg(os.getpgrp(), signal.SIGKILL)
        time.sleep(0.1)
    return process.returncode


if __name__ == "__main__":
    sys.exit(main())
