from flask import request

AGENTS_PASSWORD = "383666"


def check_agents_password() -> bool:
    given = request.headers.get("X-Agents-Password", "")
    return given == AGENTS_PASSWORD
