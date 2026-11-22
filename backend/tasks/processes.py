"""Own the complete agent process tree, including when the worker exits unexpectedly."""

import ctypes
import os
import signal
import subprocess
import sys
from pathlib import Path


def _windows_job(process):
    from ctypes import wintypes

    class BasicLimits(ctypes.Structure):
        _fields_ = [
            ("process_time", ctypes.c_int64),
            ("job_time", ctypes.c_int64),
            ("flags", wintypes.DWORD),
            ("minimum", ctypes.c_size_t),
            ("maximum", ctypes.c_size_t),
            ("active", wintypes.DWORD),
            ("affinity", ctypes.c_size_t),
            ("priority", wintypes.DWORD),
            ("scheduling", wintypes.DWORD),
        ]

    class IoCounters(ctypes.Structure):
        _fields_ = [
            (name, ctypes.c_uint64)
            for name in ["read", "write", "other", "read_bytes", "write_bytes", "other_bytes"]
        ]

    class ExtendedLimits(ctypes.Structure):
        _fields_ = [("basic", BasicLimits), ("io", IoCounters)] + [
            (name, ctypes.c_size_t)
            for name in ["process_memory", "job_memory", "peak_process", "peak_job"]
        ]

    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
    kernel.CreateJobObjectW.restype = wintypes.HANDLE
    kernel.SetInformationJobObject.argtypes = [
        wintypes.HANDLE,
        ctypes.c_int,
        ctypes.c_void_p,
        wintypes.DWORD,
    ]
    kernel.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    handle = kernel.CreateJobObjectW(None, None)
    if not handle:
        raise ctypes.WinError(ctypes.get_last_error())
    limits = ExtendedLimits()
    limits.basic.flags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    try:
        if not kernel.SetInformationJobObject(
            handle, 9, ctypes.byref(limits), ctypes.sizeof(limits)
        ):
            raise ctypes.WinError(ctypes.get_last_error())
        if not kernel.AssignProcessToJobObject(handle, int(process._handle)):
            raise ctypes.WinError(ctypes.get_last_error())
        ntdll = ctypes.WinDLL("ntdll")
        ntdll.NtResumeProcess.argtypes = [wintypes.HANDLE]
        ntdll.NtResumeProcess.restype = ctypes.c_long
        if ntdll.NtResumeProcess(int(process._handle)) != 0:
            raise OSError("Could not start the agent process.")
    except BaseException:
        kernel.CloseHandle(handle)
        raise
    return lambda: kernel.CloseHandle(handle)


class ProcessTree:
    def __init__(self, command, cwd, env=None):
        self.close_job = None
        options = {}
        if os.name == "nt":
            # Suspend before assignment so no descendant can escape the job before it is owned.
            options["creationflags"] = subprocess.CREATE_NO_WINDOW | 0x00000004
        else:
            command = [sys.executable, str(Path(__file__).with_name("agent_host.py")), *command]
            options["start_new_session"] = True
        self.process = subprocess.Popen(
            command,
            cwd=cwd,
            env=env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            **options,
        )
        if os.name == "nt":
            try:
                self.close_job = _windows_job(self.process)
            except BaseException:
                self.process.kill()
                self.process.wait()
                self.close()
                raise

    def stop(self):
        if self.close_job:
            self.close_job()
            self.close_job = None
        elif os.name != "nt":
            try:
                os.killpg(self.process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        if self.process.poll() is None:
            self.process.kill()
        self.process.wait(timeout=10)

    def close(self):
        self.stop()
        for stream in [self.process.stdin, self.process.stdout, self.process.stderr]:
            if stream:
                stream.close()
