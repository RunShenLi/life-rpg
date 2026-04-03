from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, "/root/quant")

from quant_strategy.framework.market_timeline import MarketEventLogger

HISTORY_START_DATE = "2026-04-03"


def main() -> None:
    positions_path = Path("/root/quant/quant_strategy/framework/runtime/_nwp_positions/positions.json")
    payload = json.loads(positions_path.read_text(encoding="utf-8"))
    positions = payload.get("positions") or []

    logger = MarketEventLogger()
    output: dict[str, list[dict]] = {}
    seen: set[tuple[str, str]] = set()

    for row in positions:
        target_date = str(row.get("target_date") or "")
        if row.get("status") != "open" and target_date < HISTORY_START_DATE:
            continue
        key = (str(row.get("icao") or ""), target_date)
        if key in seen:
            continue
        seen.add(key)
        timeline = logger.get_timeline(*key)
        output[f"{key[0]}-{key[1]}"] = timeline

    print(json.dumps(output, ensure_ascii=False))


if __name__ == "__main__":
    main()
