"""GPU auto-detection utility (subprocess-only, NO torch)."""

import logging
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


def detect_nvidia() -> GPUInfo | None:
    """Detect NVIDIA CUDA GPUs via nvidia-smi."""
    try:
        result = subprocess.run(
            [
                "nvidia-smi",
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


_NO_GPU = GPUInfo(available=False, type="none", device_count=0, memory_gb=0.0)


_gpu_cache_lock = threading.Lock()
_gpu_cache: GPUInfo | None = None
_gpu_cache_time: float = 0.0
_GPU_CACHE_TTL = 300.0  # 5 minutes


def detect_gpu() -> GPUInfo:
    """Detect available GPU.

    Tries NVIDIA CUDA, then AMD ROCm, then Apple MPS.
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
                logger.info("No GPU detected — will use CPU-based LLM provider")
                result = _NO_GPU

    with _gpu_cache_lock:
        _gpu_cache = result
        _gpu_cache_time = time.monotonic()
    return result
