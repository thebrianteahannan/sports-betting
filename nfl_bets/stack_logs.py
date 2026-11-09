"""Player logs for the host. The Mac sends them to Supabase; the host reads them back."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Any
from urllib.parse import quote

from nfl_bets.cloud import _request, configured
from nfl_bets.sway import _cache

_TD = {"Any Time Touchdown Scorer", "First Touchdown Scorer"}


def _names(loaded: list[tuple[dict[str, Any], list[dict[str, Any]]]]) -> set[tuple[str, str]]:
    names = set()
    for game, legs in loaded:
        sport = str(game.get("sport") or "")
        for leg in legs:
            market = str(leg.get("market") or "")
            who = str(leg.get("runner") or "") if market in _TD else market.partition(" - ")[0] if " - " in market else ""
            if sport and who.strip():
                names.add((sport, who.strip().lower()))
    return names


def _fetch(keys: list[str]) -> list[Any]:
    listed = ",".join('"' + key.replace('"', "") + '"' for key in keys)
    try:
        return _request(f"kv?k=in.({quote(listed, safe=',')})&select=k,v", "GET") or []
    except RuntimeError:
        return []


def seed(loaded: list[tuple[dict[str, Any], list[dict[str, Any]]]]) -> int:
    """Copy each log the cache lacks so the reads can count it."""
    if not configured():
        return 0
    cache = _cache()
    keys = [f"bets/log/{sport}/{who}" for sport, who in _names(loaded) if not (cache.get(f"{sport}|{who}") or {}).get("rows")]
    added = 0
    with ThreadPoolExecutor(max_workers=6) as pool:
        for rows in pool.map(_fetch, [keys[at:at + 40] for at in range(0, len(keys), 40)]):
            for row in rows:
                sport, _, who = str((row or {}).get("k") or "")[len("bets/log/"):].partition("/")
                pack = (row or {}).get("v")
                if who and isinstance(pack, dict) and pack.get("rows"):
                    cache[f"{sport}|{who}"] = pack
                    added += 1
    return added
