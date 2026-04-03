"""批量拉取当前 NWP 日最高温预报。

输入（stdin JSON）：[{"icao": "ZHHH", "target_date": "2026-04-03"}, ...]
输出（stdout JSON）：{"ZHHH-2026-04-03": [{"name": "ecmwf_ifs025", "value": 20.0}, ...], ...}

被 build-weather-market-snapshot.mjs 通过 execFileSync 调用。
Node.js native fetch 到 api.open-meteo.com 有 TLS/HTTP2 握手超时问题，
Python requests 可正常访问，故走此迂回路径。
"""
from __future__ import annotations

import json
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

sys.path.insert(0, "/root/quant")
from quant_strategy.framework.city_registry import CITY_REGISTRY

_BASE = "https://api.open-meteo.com/v1/forecast"
_MODELS_FOR: dict[str, list[str]] = {}
for _icao, _cfg in CITY_REGISTRY.items():
    if hasattr(_cfg, "models") and _cfg.models:
        _MODELS_FOR[_icao] = list(_cfg.models)


def _fetch_one(icao: str, target_date: str, model: str) -> tuple[str, str, float | None]:
    city = CITY_REGISTRY.get(icao)
    if not city:
        return icao, model, None
    try:
        r = requests.get(
            _BASE,
            params={
                "latitude": city.lat,
                "longitude": city.lon,
                "daily": "temperature_2m_max",
                "start_date": target_date,
                "end_date": target_date,
                "models": model,
                "timezone": city.tz,
            },
            timeout=15,
        )
        r.raise_for_status()
        values = r.json().get("daily", {}).get("temperature_2m_max") or []
        value = float(values[0]) if values else None
        return icao, model, value
    except Exception:
        return icao, model, None


def main() -> None:
    pairs: list[dict] = json.loads(sys.stdin.read())
    tasks: list[tuple[str, str, str]] = []
    for item in pairs:
        icao = item["icao"]
        target_date = item["target_date"]
        for model in _MODELS_FOR.get(icao, []):
            tasks.append((icao, target_date, model))

    results: dict[str, list[dict]] = {}
    with ThreadPoolExecutor(max_workers=20) as pool:
        futures = {pool.submit(_fetch_one, icao, td, model): (icao, td) for icao, td, model in tasks}
        for fut in as_completed(futures):
            icao, model, value = fut.result()
            td = futures[fut][1]
            key = f"{icao}-{td}"
            if value is not None:
                results.setdefault(key, []).append({"name": model, "value": value})

    # 按 city_registry 中的模型优先级排序
    for key, entries in results.items():
        icao = key.split("-")[0]
        priority = _MODELS_FOR.get(icao, [])
        entries.sort(key=lambda e: priority.index(e["name"]) if e["name"] in priority else 999)

    print(json.dumps(results))


if __name__ == "__main__":
    main()
