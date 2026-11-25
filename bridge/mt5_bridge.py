#!/usr/bin/env python3
"""PipSage ↔ MetaTrader 5 desktop bridge (Windows, demo accounts only).

Attaches to an already-running MT5 terminal. It never accepts or stores the broker
login/password; MT5 keeps the account session. All bridge traffic is outbound HTTPS.
"""
from __future__ import annotations

import json
import math
import os
import platform
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

SYMBOLS = (
    'XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'USDCAD', 'AUDUSD', 'NZDUSD', 'USDCHF',
    'XAGUSD', 'BTCUSD', 'ETHUSD', 'NAS100', 'US30', 'SPX500', 'USOIL', 'GER40',
)
HERE = Path(__file__).resolve().parent
MAP_FILE = HERE / 'symbol-map.local.json'
EXAMPLE_MAP = HERE / 'symbol-map.example.json'
HEARTBEAT_SECONDS = 5.0
POLL_SECONDS = 1.0


def log(message: str) -> None:
    stamp = time.strftime('%Y-%m-%d %H:%M:%S')
    print(f'[{stamp}] {message}', flush=True)


def load_config() -> tuple[str, str, str | None, dict[str, str]]:
    api_base = os.environ.get('PIPSAGE_API_URL', '').strip().rstrip('/')
    token = os.environ.get('PIPSAGE_BRIDGE_TOKEN', '').strip()
    terminal_path = os.environ.get('PIPSAGE_MT5_PATH', '').strip() or None
    if not api_base.startswith('https://'):
        raise RuntimeError('Set PIPSAGE_API_URL to the HTTPS URL of the PipSage API service.')
    if len(token) < 64:
        raise RuntimeError('Set PIPSAGE_BRIDGE_TOKEN to the 64-character bridge secret configured on Render.')
    map_path = MAP_FILE if MAP_FILE.exists() else EXAMPLE_MAP
    try:
        raw = json.loads(map_path.read_text(encoding='utf-8')) if map_path.exists() else {}
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f'Could not read {map_path.name}: {exc}') from exc
    if not isinstance(raw, dict):
        raise RuntimeError(f'{map_path.name} must be a JSON object mapping PipSage symbols to exact MT5 symbols.')
    mapping = {key: str(value).strip() for key, value in raw.items() if key in SYMBOLS and str(value).strip()}
    return api_base, token, terminal_path, mapping


def api_request(api_base: str, token: str, path: str, method: str = 'GET', body: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = None if body is None else json.dumps(body, separators=(',', ':')).encode('utf-8')
    headers = {'Authorization': f'Bearer {token}', 'Accept': 'application/json'}
    if payload is not None:
        headers['Content-Type'] = 'application/json'
    request = urllib.request.Request(api_base + path, data=payload, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read(64 * 1024 + 1)
            if len(raw) > 64 * 1024:
                raise RuntimeError('API returned an oversized response.')
            return json.loads(raw.decode('utf-8')) if raw else {}
    except urllib.error.HTTPError as exc:
        # The service error body contains no credentials; never print request headers.
        try:
            detail = json.loads(exc.read(2048).decode('utf-8')).get('error', 'API request rejected.')
        except Exception:
            detail = 'API request rejected.'
        raise RuntimeError(f'API returned HTTP {exc.code}: {detail}') from None
    except urllib.error.URLError as exc:
        raise RuntimeError(f'Cannot reach PipSage API: {exc.reason}') from None


def account_is_demo(mt5: Any, account: Any) -> bool:
    demo_mode = getattr(mt5, 'ACCOUNT_TRADE_MODE_DEMO', None)
    return demo_mode is not None and getattr(account, 'trade_mode', None) == demo_mode


def current_terminal(mt5: Any) -> tuple[Any | None, Any | None, str]:
    terminal = mt5.terminal_info()
    if terminal is None:
        return None, None, 'MT5 terminal is not initialized.'
    if not bool(getattr(terminal, 'connected', False)):
        return terminal, None, 'MT5 terminal is offline from the broker server.'
    account = mt5.account_info()
    if account is None:
        return terminal, None, 'No account is logged in to the MT5 desktop terminal.'
    if not account_is_demo(mt5, account):
        return terminal, account, 'Live or contest accounts are blocked. Log in to the Exness demo account in MT5.'
    return terminal, account, ''


def resolve_symbols(mt5: Any, overrides: dict[str, str]) -> dict[str, str]:
    resolved: dict[str, str] = {}
    for canonical in SYMBOLS:
        broker_symbol = overrides.get(canonical, canonical)
        try:
            info = mt5.symbol_info(broker_symbol)
            if info is not None and mt5.symbol_select(broker_symbol, True):
                resolved[canonical] = broker_symbol
        except Exception:
            continue
    return resolved


def symbol_suggestions(mt5: Any, canonical: str) -> list[str]:
    aliases = {
        'NAS100': ('NAS100', 'USTEC', 'US100'),
        'US30': ('US30', 'WS30', 'DJ30'),
        'SPX500': ('SPX500', 'US500', 'SP500'),
        'USOIL': ('USOIL', 'XTIUSD', 'WTI'),
        'GER40': ('GER40', 'DE40', 'DAX40'),
    }.get(canonical, (canonical,))
    try:
        available = [str(item.name) for item in (mt5.symbols_get() or ()) if getattr(item, 'name', None)]
    except Exception:
        return []
    upper_aliases = tuple(alias.upper() for alias in aliases)
    matches = [name for name in available if any(name.upper().startswith(alias) for alias in upper_aliases)]
    return sorted(matches)[:8]


def read_quotes(mt5: Any, symbol_map: dict[str, str]) -> list[dict[str, Any]]:
    quotes: list[dict[str, Any]] = []
    now_ms = int(time.time() * 1000)
    for canonical, broker_symbol in symbol_map.items():
        tick = mt5.symbol_info_tick(broker_symbol)
        if tick is None:
            continue
        bid = float(getattr(tick, 'bid', 0) or 0)
        ask = float(getattr(tick, 'ask', 0) or 0)
        if not (math.isfinite(bid) and math.isfinite(ask) and bid > 0 and ask >= bid):
            continue
        stamp = int(getattr(tick, 'time_msc', 0) or 0)
        if stamp <= 0:
            stamp = int(getattr(tick, 'time', 0) or 0) * 1000
        if stamp <= 0 or stamp > now_ms + 10_000 or stamp < now_ms - 120_000:
            continue
        row = {'symbol': canonical, 'bid': bid, 'ask': ask, 'time': stamp}
        try:
            daily = mt5.copy_rates_from_pos(broker_symbol, mt5.TIMEFRAME_D1, 0, 1)
            if daily is not None and len(daily) and float(daily[0]['open']) > 0:
                row['dayChange'] = ((bid + ask) / 2 - float(daily[0]['open'])) / float(daily[0]['open']) * 100
        except Exception:
            pass
        quotes.append(row)
    return quotes


def order_result(mt5: Any, order: dict[str, Any], symbol_map: dict[str, str]) -> dict[str, Any]:
    """Preflight using broker metadata and stop-risk calculation, then send once."""
    order_id = str(order.get('id', ''))
    canonical = str(order.get('symbol', '')).upper()
    broker_symbol = str(order.get('brokerSymbol', ''))
    side = str(order.get('side', '')).lower()
    volume = float(order.get('volume', 0))
    stop_loss = float(order.get('stopLoss', 0))
    take_profit = order.get('takeProfit')
    take_profit = float(take_profit) if take_profit is not None else 0.0
    max_risk_percent = float(order.get('maxRiskPercent', 0))

    def reject(message: str) -> dict[str, Any]:
        return {'id': order_id, 'status': 'rejected', 'message': message}

    if not order_id or canonical not in SYMBOLS or symbol_map.get(canonical) != broker_symbol:
        return reject('Symbol mapping changed; refresh the MT5 bridge and try again.')
    if side not in ('buy', 'sell') or not math.isfinite(volume) or volume <= 0:
        return reject('Invalid order side or volume.')
    if not math.isfinite(stop_loss) or stop_loss <= 0 or not math.isfinite(take_profit) or take_profit < 0:
        return reject('Invalid stop loss or take profit.')
    if not math.isfinite(max_risk_percent) or max_risk_percent <= 0 or max_risk_percent > 5:
        return reject('Invalid server risk limit; order blocked.')

    terminal, account, problem = current_terminal(mt5)
    if problem or account is None or not account_is_demo(mt5, account):
        return reject(problem or 'Demo account verification failed.')
    if not bool(getattr(account, 'trade_allowed', False)) or not bool(getattr(terminal, 'trade_allowed', False)):
        return reject('MT5 trading is disabled in the terminal or account settings.')

    info = mt5.symbol_info(broker_symbol)
    if info is None or not mt5.symbol_select(broker_symbol, True):
        return reject('MT5 symbol is unavailable or hidden.')
    vmin = float(getattr(info, 'volume_min', 0) or 0)
    vmax = float(getattr(info, 'volume_max', 0) or 0)
    vstep = float(getattr(info, 'volume_step', 0) or 0)
    if vmin <= 0 or vmax <= 0 or vstep <= 0 or volume < vmin - 1e-9 or volume > vmax + 1e-9:
        return reject(f'Volume must be between {vmin:g} and {vmax:g} lots for this symbol.')
    steps = (volume - vmin) / vstep
    if abs(steps - round(steps)) > 1e-6:
        return reject(f'Volume must follow this symbol’s lot step ({vstep:g}).')

    tick = mt5.symbol_info_tick(broker_symbol)
    if tick is None:
        return reject('No current MT5 tick is available.')
    bid, ask = float(tick.bid or 0), float(tick.ask or 0)
    if bid <= 0 or ask < bid:
        return reject('The MT5 tick is invalid or stale.')
    order_type = mt5.ORDER_TYPE_BUY if side == 'buy' else mt5.ORDER_TYPE_SELL
    entry = ask if side == 'buy' else bid
    if side == 'buy' and (stop_loss >= entry or (take_profit and take_profit <= entry)):
        return reject('Buy stop loss must be below ask; take profit must be above ask.')
    if side == 'sell' and (stop_loss <= entry or (take_profit and take_profit >= entry)):
        return reject('Sell stop loss must be above bid; take profit must be below bid.')

    risk = mt5.order_calc_profit(order_type, broker_symbol, volume, entry, stop_loss)
    if risk is None or not math.isfinite(float(risk)) or float(risk) >= 0:
        return reject('MT5 could not verify a loss at the protective stop; order blocked.')
    risk_cash = abs(float(risk))
    equity = float(getattr(account, 'equity', 0) or 0)
    if equity <= 0 or risk_cash > equity * max_risk_percent / 100:
        return reject(f'Estimated stop risk ({risk_cash:.2f} {account.currency}) exceeds the {max_risk_percent:g}% demo-account limit.')

    filling_mode = getattr(mt5, 'ORDER_FILLING_RETURN', 2)
    allowed = int(getattr(info, 'filling_mode', 0) or 0)
    if allowed & int(getattr(mt5, 'SYMBOL_FILLING_IOC', 2)):
        filling_mode = mt5.ORDER_FILLING_IOC
    elif allowed & int(getattr(mt5, 'SYMBOL_FILLING_FOK', 1)):
        filling_mode = mt5.ORDER_FILLING_FOK

    request = {
        'action': mt5.TRADE_ACTION_DEAL,
        'symbol': broker_symbol,
        'volume': volume,
        'type': order_type,
        'price': entry,
        'sl': stop_loss,
        'tp': take_profit,
        'deviation': 20,
        'magic': 20261125,
        'comment': ('PipSage demo ' + order_id[:8])[:31],
        'type_time': mt5.ORDER_TIME_GTC,
        'type_filling': filling_mode,
    }
    check = mt5.order_check(request)
    if check is None or int(getattr(check, 'retcode', -1)) != 0:
        reason = getattr(check, 'comment', 'MT5 order pre-check failed.') if check is not None else 'MT5 order pre-check failed.'
        return reject(str(reason)[:160])

    # Re-check demo status immediately before the only order_send call.
    terminal, account, problem = current_terminal(mt5)
    if problem or account is None or not account_is_demo(mt5, account):
        return reject(problem or 'Demo account verification failed before send.')
    try:
        result = mt5.order_send(request)
    except Exception:
        return {'id': order_id, 'status': 'unknown', 'message': 'MT5 send call failed; execution outcome is uncertain. Check terminal history before retrying.'}
    if result is None:
        return {'id': order_id, 'status': 'unknown', 'message': 'MT5 returned no order result; execution outcome is uncertain. Check terminal history before retrying.'}
    retcode = int(getattr(result, 'retcode', -1))
    done_codes = {int(getattr(mt5, 'TRADE_RETCODE_DONE', 10009)), int(getattr(mt5, 'TRADE_RETCODE_DONE_PARTIAL', 10010))}
    uncertain_codes = {
        int(getattr(mt5, 'TRADE_RETCODE_PLACED', 10008)),
        int(getattr(mt5, 'TRADE_RETCODE_TIMEOUT', 10012)),
        int(getattr(mt5, 'TRADE_RETCODE_CONNECTION', 10031)),
    }
    if retcode in uncertain_codes:
        message = str(getattr(result, 'comment', 'MT5 did not confirm a final execution result.'))[:140]
        return {
            'id': order_id, 'status': 'unknown',
            'message': f'{message} (code {retcode}); check MT5 history before acknowledging or retrying.',
            'ticket': int(getattr(result, 'order', 0) or 0),
        }
    if retcode not in done_codes:
        message = str(getattr(result, 'comment', 'MT5 rejected the order.'))[:160]
        return {'id': order_id, 'status': 'rejected', 'message': f'{message} (code {retcode})'}
    partial = retcode == int(getattr(mt5, 'TRADE_RETCODE_DONE_PARTIAL', 10010))
    filled_volume = float(getattr(result, 'volume', 0) or volume)
    return {
        'id': order_id,
        'status': 'partial' if partial else 'filled',
        'message': 'MT5 partially filled the demo order; check the terminal for final execution details.' if partial else 'MT5 accepted the demo order; check the terminal for final execution details.',
        'ticket': int(getattr(result, 'order', 0) or getattr(result, 'deal', 0) or 0),
        'fillPrice': float(getattr(result, 'price', 0) or entry),
        'filledVolume': filled_volume,
    }


def report_order(mt5: Any, api_base: str, token: str, order: dict[str, Any], symbol_map: dict[str, str]) -> None:
    try:
        result = order_result(mt5, order, symbol_map)
    except Exception as exc:
        result = {'id': str(order.get('id', '')), 'status': 'unknown', 'message': f'Bridge error: {type(exc).__name__}; execution outcome is uncertain. Inspect MT5 history before retrying.'}
        log('Order processing failed; no automatic retry will be made. Check MT5 history before acknowledging.')
    try:
        api_request(api_base, token, '/bridge/orders/result', method='POST', body=result)
        log(f"Demo order {str(order.get('id', ''))[:8]}: {result['status']} — {result.get('message', '')}")
    except Exception as exc:
        log(f'Could not report order result ({type(exc).__name__}). Check MT5 history before retrying any order.')


def run() -> int:
    if platform.system() != 'Windows':
        log('This MT5 Python bridge requires Windows with the MT5 desktop terminal installed.')
        return 2
    try:
        api_base, token, terminal_path, overrides = load_config()
    except RuntimeError as exc:
        log(str(exc))
        return 2
    try:
        import MetaTrader5 as mt5  # type: ignore[import-not-found]
    except ImportError:
        log('MetaTrader5 Python package is missing. In the venv run: pip install -r bridge/requirements.txt')
        return 2

    init_attempted = False
    last_heartbeat = 0.0
    last_missing: tuple[str, ...] | None = None
    last_problem = ''
    last_cycle_error = ''
    symbol_map: dict[str, str] = {}
    log('Starting demo-only MT5 bridge. No broker username/password is read by this script.')
    if terminal_path:
        log('Using the MT5 terminal path configured in PIPSAGE_MT5_PATH.')

    try:
        while True:
            try:
                if not init_attempted or mt5.terminal_info() is None:
                    init_attempted = True
                    initialized = mt5.initialize(path=terminal_path) if terminal_path else mt5.initialize()
                    if not initialized:
                        raise RuntimeError('MT5 initialize failed; open MT5 and sign in to the Exness demo account.')
                terminal, account, problem = current_terminal(mt5)
                if problem or account is None:
                    if time.time() - last_heartbeat >= HEARTBEAT_SECONDS:
                        try:
                            api_request(api_base, token, '/bridge/heartbeat', 'POST', {
                                'connected': False, 'demo': False, 'error': problem or 'MT5 account unavailable.',
                            })
                            last_heartbeat = time.time()
                        except Exception as exc:
                            log(f'Heartbeat failed ({type(exc).__name__}); will retry.')
                    current_problem = problem or 'MT5 account unavailable.'
                    if current_problem != last_problem:
                        log(current_problem)
                        last_problem = current_problem
                    time.sleep(POLL_SECONDS)
                    continue
                last_problem = ''

                if not symbol_map:
                    symbol_map = resolve_symbols(mt5, overrides)
                    missing = tuple(sorted(set(SYMBOLS) - set(symbol_map)))
                    if missing != last_missing:
                        if missing:
                            log('Not mapped in MT5: ' + ', '.join(missing) + '. Edit bridge/symbol-map.local.json using exact Market Watch names.')
                            for canonical in missing:
                                candidates = symbol_suggestions(mt5, canonical)
                                if candidates:
                                    log(f'  {canonical} candidates (verify before mapping): ' + ', '.join(candidates))
                        else:
                            log(f'All {len(SYMBOLS)} PipSage symbols mapped to MT5.')
                        last_missing = missing

                if time.time() - last_heartbeat >= HEARTBEAT_SECONDS:
                    api_request(api_base, token, '/bridge/heartbeat', 'POST', {
                        'connected': True,
                        'demo': True,
                        'accountCurrency': str(getattr(account, 'currency', '') or '')[:8],
                        'equity': float(getattr(account, 'equity', 0) or 0),
                        'symbols': symbol_map,
                    })
                    last_heartbeat = time.time()

                quotes = read_quotes(mt5, symbol_map)
                if quotes:
                    api_request(api_base, token, '/bridge/quotes', 'POST', {'quotes': quotes})

                claimed = api_request(api_base, token, '/bridge/orders/claim')
                order = claimed.get('order')
                if isinstance(order, dict):
                    report_order(mt5, api_base, token, order, symbol_map)
                last_cycle_error = ''
            except KeyboardInterrupt:
                break
            except Exception as exc:
                current_error = f'Connection cycle failed ({type(exc).__name__}: {exc}); quotes will be marked stale until the bridge recovers.'
                if current_error != last_cycle_error:
                    log(current_error)
                    last_cycle_error = current_error
                init_attempted = False
                symbol_map = {}
                last_heartbeat = 0
            time.sleep(POLL_SECONDS)
    finally:
        try:
            mt5.shutdown()
        except Exception:
            pass
        log('Bridge stopped. Any unconfirmed order must be checked in MT5 order history.')
    return 0


if __name__ == '__main__':
    sys.exit(run())
