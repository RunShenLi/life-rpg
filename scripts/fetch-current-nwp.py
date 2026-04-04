"""批量拉取当前 NWP 日最高温预报。

输入（stdin JSON）：[{"icao": "ZHHH", "target_date": "2026-04-03"}, ...]
输出（stdout JSON）：{"ZHHH-2026-04-03": [{"name": "ecmwf_ifs025", "value": 20.0}, ...], ...}

被 build-weather-market-snapshot.mjs 通过 execFileSync 调用。
Node.js native fetch 到 api.open-meteo.com 有 TLS/HTTP2 握手超时问题，
Python requests 可正常访问，故走此迂回路径。

缓存策略：结果存入 store.db（nwp_current_cache 表），TTL = 1 小时。
Open-Meteo 免费额度 10,000 次/天；每 5 分钟 push 一次、~160 次 API 调用/批，
不加缓存会超限（160 × 288 = 46,080/天）；1 小时 TTL 下约 160 × 24 = 3,840/天。

模型覆盖：使用全部 11 个全球候选模型（_GLOBAL_CANDIDATE_POOL），而非仅
city_registry 中写死的 3 个基础模型，保证 currentModelDetails 与入场时
modelDetails 的模型集合一致，前端可正确计算每个模型的预报漂移量（delta）。
"""
from __future__ import annotations

import json
import sqlite3
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

import requests

sys.path.insert(0, "/root/quant")
from quant_strategy.framework.city_registry import CITY_REGISTRY
from quant_strategy.framework.signals.open_meteo_forecast import _GLOBAL_CANDIDATE_POOL

_BASE = "https://api.open-meteo.com/v1/forecast"
_DB_PATH = Path(__file__).parent / "store.db"
_CACHE_TTL_SECONDS = 3600  # 1 小时；Open-Meteo NWP 更新周期 6-12h，1h 足够新鲜

# 外部数据源（yr_no, noaa_nbm 等）不走 Open-Meteo API，此处排除
_EXTERNAL_PROVIDERS = frozenset({"yr_no", "noaa_nbm", "noaa_nws"})

# 全部可通过 Open-Meteo API 查询的全球候选模型
_FETCH_MODELS: list[str] = [m for m in _GLOBAL_CANDIDATE_POOL if m not in _EXTERNAL_PROVIDERS]


def _init_cache(conn: sqlite3.Connection) -> None:
    """创建缓存表（幂等）。fetched_at 存 ISO-8601 UTC 字符串。"""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS nwp_current_cache (
            icao        TEXT NOT NULL,
            target_date TEXT NOT NULL,
            model       TEXT NOT NULL,
            value       REAL,           -- NULL 表示 API 本次未返回数据
            fetched_at  TEXT NOT NULL,  -- ISO-8601 UTC，用于判断是否过期
            PRIMARY KEY (icao, target_date, model)
        )
    """)
    conn.commit()


def _load_cache(conn: sqlite3.Connection, tasks: list[tuple[str, str, str]]) -> dict[tuple[str, str, str], float | None | str]:
    """返回 (icao, target_date, model) → value 或哨兵 '_MISS'（缓存未命中/过期）。"""
    now_ts = datetime.now(timezone.utc).timestamp()
    result: dict[tuple[str, str, str], float | None | str] = {}
    for icao, td, model in tasks:
        row = conn.execute(
            "SELECT value, fetched_at FROM nwp_current_cache WHERE icao=? AND target_date=? AND model=?",
            (icao, td, model),
        ).fetchone()
        if row is None:
            result[(icao, td, model)] = "_MISS"
            continue
        fetched_ts = datetime.fromisoformat(row[1]).timestamp()
        if now_ts - fetched_ts > _CACHE_TTL_SECONDS:
            # 缓存过期，需要重新拉取
            result[(icao, td, model)] = "_MISS"
        else:
            result[(icao, td, model)] = row[0]  # float 或 None（均视为命中）
    return result


def _save_cache(conn: sqlite3.Connection, entries: list[tuple[str, str, str, float | None]]) -> None:
    """批量写入或更新缓存行。"""
    now_str = datetime.now(timezone.utc).isoformat()
    conn.executemany(
        """INSERT INTO nwp_current_cache (icao, target_date, model, value, fetched_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(icao, target_date, model) DO UPDATE SET value=excluded.value, fetched_at=excluded.fetched_at""",
        [(icao, td, model, value, now_str) for icao, td, model, value in entries],
    )
    conn.commit()


def _fetch_one(icao: str, target_date: str, model: str) -> tuple[str, str, str, float | None]:
    city = CITY_REGISTRY.get(icao)
    if not city:
        return icao, target_date, model, None
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
        return icao, target_date, model, value
    except Exception:
        return icao, target_date, model, None


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

    conn = sqlite3.connect(_DB_PATH)
    _init_cache(conn)

    # 先读缓存，筛出未命中（需要从 API 拉取）的任务
    cache_state = _load_cache(conn, tasks)
    miss_tasks = [t for t in tasks if cache_state[t] == "_MISS"]

    # 只对缓存未命中的任务发起 API 请求
    fresh_entries: list[tuple[str, str, str, float | None]] = []
    if miss_tasks:
        with ThreadPoolExecutor(max_workers=20) as pool:
            futures = {pool.submit(_fetch_one, icao, td, model): (icao, td, model) for icao, td, model in miss_tasks}
            for fut in as_completed(futures):
                icao, td, model, value = fut.result()
                fresh_entries.append((icao, td, model, value))
                cache_state[(icao, td, model)] = value  # 更新内存缓存视图

        _save_cache(conn, fresh_entries)

    conn.close()

    # 组装输出（排除 value=None 的条目，与旧逻辑一致）
    results: dict[str, list[dict]] = {}
    for (icao, td, model), value in cache_state.items():
        if value is None or value == "_MISS":
            # _MISS 不该出现（已在上面补拉），None 表示 API 无数据，均跳过
            continue
        key = f"{icao}-{td}"
        results.setdefault(key, []).append({"name": model, "value": value})

    # 按全球候选池顺序排序（与入场时 modelDetails 的排序逻辑一致）
    priority = {m: i for i, m in enumerate(_FETCH_MODELS)}
    for key, entries in results.items():
        entries.sort(key=lambda e: priority.get(e["name"], 999))

    print(json.dumps(results))


if __name__ == "__main__":
    main()
