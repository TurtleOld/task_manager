from __future__ import annotations

UNKNOWN_LABEL = "Неизвестное устройство"

_BROWSERS = (
    ("Edg/", "Edge"),
    ("EdgA/", "Edge"),
    ("EdgiOS/", "Edge"),
    ("OPR/", "Opera"),
    ("YaBrowser/", "Яндекс Браузер"),
    ("SamsungBrowser/", "Samsung Internet"),
    ("Firefox/", "Firefox"),
    ("FxiOS/", "Firefox"),
    ("CriOS/", "Chrome"),
    ("Chrome/", "Chrome"),
    ("Safari/", "Safari"),
)

_SYSTEMS = (
    ("Android", "Android"),
    ("iPhone", "iOS"),
    ("iPad", "iOS"),
    ("Windows", "Windows"),
    ("Mac OS X", "macOS"),
    ("CrOS", "ChromeOS"),
    ("Linux", "Linux"),
)


def _first_match(user_agent: str, table: tuple[tuple[str, str], ...]) -> str:
    for marker, name in table:
        if marker in user_agent:
            return name
    return ""


def label_from_user_agent(user_agent: str) -> str:
    browser = _first_match(user_agent, _BROWSERS)
    system = _first_match(user_agent, _SYSTEMS)
    if browser and system:
        return f"{browser} на {system}"
    return browser or system or UNKNOWN_LABEL
