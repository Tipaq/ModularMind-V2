"""Tests for the connector code validator."""

from src.system_indexer.validator import validate_connector_code


class TestValidatorSyntax:
    def test_valid_code_passes(self):
        code = '''
import os
from fastmcp import FastMCP

mcp = FastMCP("test")

@mcp.tool()
def hello(name: str) -> str:
    host = os.environ["HOST"]
    return f"Hello {name} from {host}"
'''
        result = validate_connector_code(code)
        assert result.is_valid
        assert not result.errors

    def test_syntax_error_caught(self):
        result = validate_connector_code("def foo(:\n  pass")
        assert not result.is_valid
        assert any("Syntax error" in e for e in result.errors)


class TestBannedPatterns:
    def test_subprocess_import_rejected(self):
        result = validate_connector_code("import subprocess\nsubprocess.run(['ls'])")
        assert not result.is_valid

    def test_os_system_rejected(self):
        result = validate_connector_code("import os\nos.system('rm -rf /')")
        assert not result.is_valid

    def test_eval_rejected(self):
        result = validate_connector_code("result = eval('1+1')")
        assert not result.is_valid

    def test_exec_rejected(self):
        result = validate_connector_code("exec('import os')")
        assert not result.is_valid

    def test_dunder_import_rejected(self):
        result = validate_connector_code("m = __import__('os')")
        assert not result.is_valid

    def test_getattr_builtins_rejected(self):
        result = validate_connector_code("f = getattr(__builtins__, 'eval')")
        assert not result.is_valid

    def test_pickle_import_rejected(self):
        result = validate_connector_code("import pickle")
        assert not result.is_valid

    def test_ctypes_import_rejected(self):
        result = validate_connector_code("import ctypes")
        assert not result.is_valid

    def test_socket_import_rejected(self):
        result = validate_connector_code("import socket")
        assert not result.is_valid


class TestCredentialHygiene:
    def test_environ_usage_ok(self):
        code = 'password = os.environ["DB_PASSWORD"]'
        result = validate_connector_code(code)
        assert result.is_valid

    def test_hardcoded_password_warned(self):
        code = 'password = "super_secret_password_123"'
        result = validate_connector_code(code)
        assert result.is_valid  # warning, not error
        assert len(result.warnings) > 0

    def test_short_string_not_warned(self):
        code = 'name = "test"'
        result = validate_connector_code(code)
        assert not result.warnings


class TestValidFastMCPCode:
    def test_full_connector_passes(self):
        code = '''
import os
import json
import xmlrpc.client
from fastmcp import FastMCP

mcp = FastMCP("odoo-connector")

HOST = os.environ["ODOO_HOST"]
PORT = int(os.environ.get("ODOO_PORT", "8069"))

@mcp.tool()
def authenticate(database: str, username: str, password: str) -> dict:
    common = xmlrpc.client.ServerProxy(f"http://{HOST}:{PORT}/xmlrpc/2/common")
    uid = common.authenticate(database, username, password, {})
    return {"uid": uid, "success": bool(uid)}

if __name__ == "__main__":
    mcp.run(transport="sse", port=9100)
'''
        result = validate_connector_code(code)
        assert result.is_valid
        assert not result.errors
