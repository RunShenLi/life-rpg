"""批量拉取当前 NWP 日最高温预报。

输入（stdin JSON）：[{"icao": "ZHHH", "target_date": "2026-04-03"}, ...]
输出（stdout JSON）：{"ZHHH-2026-04-03": [{"name": "ecmwf_ifs025", "value": 20.0}, ...], ...}

被 build-weather-market-snapshot.mjs 通过 execFileSync 调用。
Node.js native fetch 到 api.open-meteo.com 有 TLS/HTTP2 握手超时问题，
Python requests 可正常访问，故走此迂回路径。

模型覆盖：使用全部 11 个全球候选模型（_GLOBAL_CANDIDATE_POOL），而非仅
city_registry 中写死的 3 个基础模型，保证 currentModelDetails 与入场时
modelDetails 的模型集合一致，前端可正确计算每个模型的预报漂移量（delta）。
"""
from __future__ import annotations

import json
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

sys.path.insert(0, "/root/quant")
from quant_strategy.framework.city_registry import CITY_REGISTRY
from quant_strategy.framework.signals.open_meteo_forecast import _GLOBAL_CANDIDATE_POOL

_BASE = "https://api.open-meteo.com/v1/forecast"

# 外部数据源（yr_no, noaa_nbm 等）不走 Open-Meteo API，此处排除
_EXTERNAL_PROVIDERS = frozenset({"yr_no", "noaa_nbm", "noaa_nws"})

# 全部可通过 Open-Meteo API 查询的全球候选模型
_FETCH_MODELS: list[str] = [m for m in _GLOBAL_CANDIDATE_POOL if m not in _EXTERNAL_PROVIDERS]


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
        # 使用全球候选池（11个模型）而非仅 cfg.models（3个），
        # 保证与入场时 _augmented_models() 返回的模型集合对齐
        for model in _FETCH_MODELS:
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

    # 按全球候选池顺序排序（与入场时 modelDetails 的排序逻辑一致）
    priority = {m: i for i, m in enumerate(_FETCH_MODELS)}
    for key, entries in results.items():
        entries.sort(key=lambda e: priority.get(e["name"], 999))

    print(json.dumps(results))


if __name__ == "__main__":
    main()
