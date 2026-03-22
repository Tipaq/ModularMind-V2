"""GPU auto-detection utility (subprocess-only, NO torch)."""

import logging
import os
import platform
import subprocess
import threading
import time
from dataclasses import dataclass
from typing import Literal

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class GPUInfo:
    """Detected GPU information."""

    available: bool
    type: Literal["cuda", "rocm", "mps", "none"]
    device_count: int
    memory_gb: float


def _find_nvidia_smi() -> str:
    """Find nvidia-smi executable, checking common Windows paths."""
    # Try bare command first (works on Linux and if Windows PATH is set)
    candidates = ["nvidia-smi"]

    if platform.system() == "Windows":
        # Common Windows install paths
        sys32 = os.path.join(os.environ.get("SYSTEMROOT", r"C:\Windows"), "System32")
        candidates.append(os.path.join(sys32, "nvidia-smi.exe"))
        prog = os.environ.get("PROGRAMFILES", r"C:\Program Files")
        nv_dir = os.path.join(prog, "NVIDIA Corporation", "NVSMI")
        candidates.append(os.path.join(nv_dir, "nvidia-smi.exe"))

    for candidate in candidates:
        try:
            result = subprocess.run(
                [candidate, "--version"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode == 0:
                return candidate
        except (FileNotFoundError, subprocess.TimeoutExpired):
            continue

    raise FileNotFoundError("nvidia-smi not found")


def detect_nvidia() -> GPUInfo | None:
    """Detect NVIDIA CUDA GPUs via nvidia-smi."""
    try:
        smi = _find_nvidia_smi()
        result = subprocess.run(
            [
                smi,
                "--query-gpu=count,memory.total",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode != 0:
            return None

        lines = result.stdout.strip().splitlines()
        if not lines:
            return None

        # Each line is "count, memory_mb" for each GPU
        # nvidia-smi repeats the count on every line, take the first
        first_line = lines[0].strip()
        parts = first_line.split(",")
        if len(parts) < 2:
            return None

        device_count = int(parts[0].strip())
        # Sum memory across all GPUs
        total_memory_mb = sum(float(line.split(",")[1].strip()) for line in lines)

        return GPUInfo(
            available=True,
            type="cuda",
            device_count=device_count,
            memory_gb=round(total_memory_mb / 1024, 1),
        )

    except FileNotFoundError:
        return None
    except (subprocess.TimeoutExpired, ValueError, IndexError) as e:
        logger.debug("nvidia-smi parse error: %s", e)
        return None


def detect_rocm() -> GPUInfo | None:
    """Detect AMD ROCm GPUs via rocm-smi."""
    try:
        result = subprocess.run(
            ["rocm-smi", "--showmeminfo", "vram"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode != 0:
            return None

        # Parse output for VRAM total lines
        total_memory_bytes = 0
        device_count = 0
        for line in result.stdout.splitlines():
            if "Total" in line and "Memory" in line:
                # Extract numeric value (bytes)
                parts = line.split()
                for part in parts:
                    try:
                        val = int(part)
                        total_memory_bytes += val
                        device_count += 1
                        break
                    except ValueError:
                        continue

        if device_count == 0:
            return None

        return GPUInfo(
            available=True,
            type="rocm",
            device_count=device_count,
            memory_gb=round(total_memory_bytes / (1024**3), 1),
        )

    except FileNotFoundError:
        return None
    except (subprocess.TimeoutExpired, ValueError) as e:
        logger.debug("rocm-smi parse error: %s", e)
        return None


def detect_mps() -> GPUInfo | None:
    """Detect Apple Metal GPU via system_profiler."""
    if platform.system() != "Darwin":
        return None

    try:
        result = subprocess.run(
            ["system_profiler", "SPDisplaysDataType"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode != 0:
            return None

        output = result.stdout
        if "Metal" not in output:
            return None

        # Extract VRAM if available
        memory_gb = 0.0
        for line in output.splitlines():
            line_lower = line.lower().strip()
            if "vram" in line_lower or "memory" in line_lower:
                parts = line.split(":")
                if len(parts) >= 2:
                    val_str = parts[1].strip()
                    for token in val_str.split():
                        try:
                            memory_gb = float(token)
                            break
                        except ValueError:
                            continue
                    if memory_gb > 0:
                        break

        return GPUInfo(
            available=True,
            type="mps",
            device_count=1,
            memory_gb=memory_gb,
        )

    except FileNotFoundError:
        return None
    except (subprocess.TimeoutExpired, ValueError) as e:
        logger.debug("system_profiler parse error: %s", e)
        return None


def _detect_via_docker_ollama() -> GPUInfo | None:
    """Detect GPU by running nvidia-smi inside the Ollama container.

    Uses the Docker Engine API via the Unix socket (/var/run/docker.sock)
    to exec nvidia-smi in the Ollama container — no `docker` CLI needed.
    """
    import http.client
    import json as _json
    import socket
    import urllib.parse

    class _DockerSocket(http.client.HTTPConnection):
        """HTTP connection over Unix socket for Docker Engine API."""

        def __init__(self, sock_path: str = "/var/run/docker.sock"):
            super().__init__("localhost")
            self._sock_path = sock_path

        def connect(self) -> None:
            self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            self.sock.settimeout(10)
            self.sock.connect(self._sock_path)

    try:
        conn = _DockerSocket()

        # Find Ollama container
        conn.request(
            "GET",
            "/containers/json?" + urllib.parse.urlencode({"filters": '{"name":["ollama"]}'}),
        )
        resp = conn.getresponse()
        if resp.status != 200:
            return None
        containers = _json.loads(resp.read())
        if not containers:
            return None

        container_id = containers[0]["Id"]

        # Create exec instance
        exec_body = _json.dumps({
            "AttachStdout": True,
            "AttachStderr": True,
            "Cmd": [
                "nvidia-smi",
                "--query-gpu=count,memory.total",
                "--format=csv,noheader,nounits",
            ],
        }).encode()
        conn.request(
            "POST",
            f"/containers/{container_id}/exec",
            body=exec_body,
            headers={"Content-Type": "application/json"},
        )
        resp = conn.getresponse()
        if resp.status != 201:
            return None
        exec_id = _json.loads(resp.read())["Id"]

        # Start exec
        start_body = _json.dumps({"Detach": False, "Tty": False}).encode()
        conn.request(
            "POST",
            f"/exec/{exec_id}/start",
            body=start_body,
            headers={"Content-Type": "application/json"},
        )
        resp = conn.getresponse()
        if resp.status != 200:
            return None

        # Docker multiplexed stream: skip 8-byte header frames
        raw = resp.read()
        output = ""
        i = 0
        while i + 8 <= len(raw):
            # Header: [stream_type(1), 0, 0, 0, size(4 big-endian)]
            size = int.from_bytes(raw[i + 4 : i + 8], "big")
            if i + 8 + size > len(raw):
                break
            output += raw[i + 8 : i + 8 + size].decode("utf-8", errors="replace")
            i += 8 + size

        conn.close()

        lines = output.strip().splitlines()
        if not lines:
            return None

        first_line = lines[0].strip()
        parts = first_line.split(",")
        if len(parts) < 2:
            return None

        device_count = int(parts[0].strip())
        total_memory_mb = sum(float(line.split(",")[1].strip()) for line in lines)

        return GPUInfo(
            available=True,
            type="cuda",
            device_count=device_count,
            memory_gb=round(total_memory_mb / 1024, 1),
        )

    except Exception as e:
        logger.debug("Docker Ollama GPU detection failed: %s", e)
        return None


_NO_GPU = GPUInfo(available=False, type="none", device_count=0, memory_gb=0.0)


_gpu_cache_lock = threading.Lock()
_gpu_cache: GPUInfo | None = None
_gpu_cache_time: float = 0.0
_GPU_CACHE_TTL = 300.0  # 5 minutes


def detect_gpu() -> GPUInfo:
    """Detect available GPU.

    Tries in order:
    1. NVIDIA CUDA (local nvidia-smi)
    2. AMD ROCm (local rocm-smi)
    3. Apple MPS (system_profiler)
    4. Docker Ollama (nvidia-smi inside Ollama container via Docker socket)

    Result is cached for 5 minutes to avoid repeated subprocess calls
    while still detecting hot-plugged GPUs.

    Returns:
        GPUInfo with detected GPU details, or type="none" if no GPU found.
    """
    global _gpu_cache, _gpu_cache_time

    now = time.monotonic()
    with _gpu_cache_lock:
        if _gpu_cache is not None and (now - _gpu_cache_time) < _GPU_CACHE_TTL:
            return _gpu_cache

    # Try NVIDIA first (most common in servers)
    result = detect_nvidia()
    if result:
        logger.info(
            "GPU detected: NVIDIA CUDA — %d device(s), %.1f GB VRAM",
            result.device_count,
            result.memory_gb,
        )
    else:
        # Try AMD ROCm
        result = detect_rocm()
        if result:
            logger.info(
                "GPU detected: AMD ROCm — %d device(s), %.1f GB VRAM",
                result.device_count,
                result.memory_gb,
            )
        else:
            # Try Apple MPS
            result = detect_mps()
            if result:
                logger.info(
                    "GPU detected: Apple Metal (MPS) — %.1f GB VRAM",
                    result.memory_gb,
                )
            else:
                # Last resort: try nvidia-smi via Docker Ollama container
                result = _detect_via_docker_ollama()
                if result:
                    logger.info(
                        "GPU detected via Ollama container: NVIDIA CUDA"
                        " — %d device(s), %.1f GB VRAM",
                        result.device_count,
                        result.memory_gb,
                    )
                else:
                    logger.info("No GPU detected — will use CPU-based LLM provider")
                    result = _NO_GPU

    with _gpu_cache_lock:
        _gpu_cache = result
        _gpu_cache_time = time.monotonic()
    return result


def compute_vram_stats(
    ollama_models: list[dict],
    configured_total_gb: float,
) -> tuple[int, float, float]:
    """Compute VRAM usage from Ollama model list.

    Args:
        ollama_models: Raw model dicts from Ollama /api/ps.
        configured_total_gb: GPU_TOTAL_VRAM_GB from settings (0 = auto-detect).

    Returns:
        (vram_used_bytes, total_vram_gb, vram_percent)
    """
    vram_used = sum(m.get("size_vram", 0) for m in ollama_models)
    total_vram_gb = configured_total_gb
    if total_vram_gb == 0:
        total_vram_gb = detect_gpu().memory_gb
    used_vram_gb = vram_used / (1024**3)
    if total_vram_gb == 0 and used_vram_gb > 0:
        total_vram_gb = used_vram_gb
    total_vram_bytes = int(total_vram_gb * (1024**3))
    vram_pct = (vram_used / total_vram_bytes * 100) if total_vram_bytes > 0 else 0.0
    return vram_used, total_vram_gb, vram_pct
