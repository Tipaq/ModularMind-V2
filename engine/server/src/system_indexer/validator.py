"""Static analysis of LLM-generated connector code."""

from __future__ import annotations

import ast
import re

BANNED_MODULES = frozenset({
    "subprocess",
    "ctypes",
    "pickle",
    "importlib",
    "socket",
})

BANNED_PATTERNS = [
    re.compile(r"\bos\.system\b"),
    re.compile(r"\bos\.popen\b"),
    re.compile(r"\beval\s*\("),
    re.compile(r"\bexec\s*\("),
    re.compile(r"\b__import__\s*\("),
    re.compile(r"\bgetattr\s*\(\s*__builtins__"),
]


class ValidationResult:
    def __init__(self) -> None:
        self.is_valid: bool = True
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def add_error(self, message: str) -> None:
        self.is_valid = False
        self.errors.append(message)

    def add_warning(self, message: str) -> None:
        self.warnings.append(message)


def validate_connector_code(code: str) -> ValidationResult:
    """Validate generated Python code for safety and correctness."""
    result = ValidationResult()

    _check_syntax(code, result)
    if not result.is_valid:
        return result

    _check_banned_patterns(code, result)
    _check_banned_imports(code, result)
    _check_credential_hygiene(code, result)

    return result


def _check_syntax(code: str, result: ValidationResult) -> None:
    try:
        ast.parse(code)
    except SyntaxError as exc:
        result.add_error(f"Syntax error at line {exc.lineno}: {exc.msg}")


def _check_banned_patterns(code: str, result: ValidationResult) -> None:
    for pattern in BANNED_PATTERNS:
        match = pattern.search(code)
        if match:
            result.add_error(f"Banned pattern found: {match.group()}")


def _check_banned_imports(code: str, result: ValidationResult) -> None:
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                module_root = alias.name.split(".")[0]
                if module_root in BANNED_MODULES:
                    result.add_error(f"Banned import: {alias.name}")
        elif isinstance(node, ast.ImportFrom) and node.module:
            module_root = node.module.split(".")[0]
            if module_root in BANNED_MODULES:
                result.add_error(f"Banned import: {node.module}")


def _check_credential_hygiene(code: str, result: ValidationResult) -> None:
    password_pattern = re.compile(
        r"""(?:password|secret|token|api_key)\s*=\s*["'][^"']{8,}["']""",
        re.IGNORECASE,
    )
    matches = password_pattern.findall(code)
    for match in matches:
        result.add_warning(f"Possible hardcoded credential: {match[:40]}...")
