from __future__ import annotations

import ast
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "src"


def _chain_calls(node: ast.AST, parents: dict[ast.AST, ast.AST]) -> list[str]:
    # Walks up from a call to the end of its queryset chain, collecting the
    # method names: `X.objects.select_for_update().select_related().first()`.
    names: list[str] = []
    current: ast.AST | None = node
    while current is not None:
        if isinstance(current, ast.Call) and isinstance(current.func, ast.Attribute):
            names.append(current.func.attr)
        parent = parents.get(current)
        if not isinstance(parent, (ast.Attribute, ast.Call)):
            break
        current = parent
    return names


def _unscoped_locks() -> list[str]:
    offenders: list[str] = []
    for path in sorted(SRC.rglob("*.py")):
        if "migrations" in path.parts:
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"))
        parents = {
            child: node
            for node in ast.walk(tree)
            for child in ast.iter_child_nodes(node)
        }
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            if not isinstance(node.func, ast.Attribute):
                continue
            if node.func.attr != "select_for_update":
                continue
            if "select_related" not in _chain_calls(node, parents):
                continue
            if any(kw.arg == "of" for kw in node.keywords):
                continue
            offenders.append(f"{path.relative_to(SRC)}:{node.lineno}")
    return offenders


def test_locked_querysets_with_joins_scope_the_lock_to_their_own_table() -> None:
    # Postgres refuses `FOR UPDATE` on the nullable side of an outer join, and
    # `select_related` on a nullable FK compiles to exactly that. SQLite ignores
    # `select_for_update` entirely, so such a query only fails in production —
    # it did twice (dispatcher, then recurrence generation). Scoping the lock
    # with `of=("self",)` is the rule; this check keeps it.
    assert _unscoped_locks() == []
