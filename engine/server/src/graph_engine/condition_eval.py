"""Safe condition expression evaluator using AST parsing.

Provides safe evaluation of condition expressions for graph routing.
Only supports comparisons, boolean logic, and variable/literal access.
No function calls, attribute access, or arbitrary code execution.
"""

import ast
import operator
from typing import Any

# Allowed operators for safe condition evaluation
_SAFE_OPS: dict[type, Any] = {
    ast.Eq: operator.eq,
    ast.NotEq: operator.ne,
    ast.Lt: operator.lt,
    ast.LtE: operator.le,
    ast.Gt: operator.gt,
    ast.GtE: operator.ge,
    ast.And: lambda a, b: a and b,
    ast.Or: lambda a, b: a or b,
    ast.Not: operator.not_,
    ast.Is: operator.is_,
    ast.IsNot: operator.is_not,
    ast.In: lambda a, b: a in b,
    ast.NotIn: lambda a, b: a not in b,
}


def safe_eval_condition(expr: str, context: dict[str, Any]) -> bool:
    """Evaluate a simple condition expression safely using AST parsing.

    Only supports comparisons, boolean logic, and variable/literal access.
    No function calls, attribute access, or arbitrary code execution.

    Args:
        expr: Python expression string (e.g. "score > 0.8")
        context: Variable context for name resolution

    Returns:
        Boolean result of the expression evaluation
    """
    try:
        tree = ast.parse(expr, mode="eval")
    except SyntaxError:
        return False

    return bool(eval_node(tree.body, context))


def eval_node(node: ast.AST, ctx: dict[str, Any]) -> Any:
    """Recursively evaluate an AST node with restricted operations.

    Args:
        node: AST node to evaluate
        ctx: Variable context for name resolution

    Raises:
        ValueError: If an unsupported expression type is encountered
    """
    if isinstance(node, ast.Expression):
        return eval_node(node.body, ctx)
    elif isinstance(node, ast.Constant):
        return node.value
    elif isinstance(node, ast.Name):
        if node.id not in ctx:
            raise ValueError(f"Unknown variable: {node.id}")
        return ctx[node.id]
    elif isinstance(node, ast.Compare):
        left = eval_node(node.left, ctx)
        for op, comparator in zip(node.ops, node.comparators):
            op_func = _SAFE_OPS.get(type(op))
            if op_func is None:
                raise ValueError(f"Unsupported operator: {type(op).__name__}")
            right = eval_node(comparator, ctx)
            if not op_func(left, right):
                return False
            left = right
        return True
    elif isinstance(node, ast.BoolOp):
        op_type = type(node.op)
        if op_type == ast.And:
            return all(eval_node(v, ctx) for v in node.values)
        elif op_type == ast.Or:
            return any(eval_node(v, ctx) for v in node.values)
    elif isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.Not):
        return not eval_node(node.operand, ctx)
    raise ValueError(f"Unsupported expression: {type(node).__name__}")


def build_condition_context(state: dict) -> dict[str, Any]:
    """Flatten node_outputs into evaluator context.

    Produces namespaced keys (e.g. search_score) and unambiguous flat keys
    (e.g. score if only one node outputs 'score').

    Args:
        state: Current graph state dict

    Returns:
        Flattened context dict for condition evaluation
    """
    ctx: dict[str, Any] = {}
    node_outputs = state.get("node_outputs", {})
    key_count: dict[str, int] = {}

    # First pass: add namespaced keys and count occurrences
    for node_id, output in node_outputs.items():
        if isinstance(output, dict):
            for key, value in output.items():
                ctx[f"{node_id}_{key}"] = value
                key_count[key] = key_count.get(key, 0) + 1

    # Second pass: add unambiguous flat keys
    for node_id, output in node_outputs.items():
        if isinstance(output, dict):
            for key, value in output.items():
                if key_count.get(key, 0) == 1:
                    ctx[key] = value

    # Add metadata to context
    ctx.update(state.get("metadata", {}))
    return ctx
