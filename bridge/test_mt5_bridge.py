import unittest
from types import SimpleNamespace

from mt5_bridge import order_result


class FakeMT5:
    ACCOUNT_TRADE_MODE_DEMO = 0
    ORDER_TYPE_BUY = 0
    ORDER_TYPE_SELL = 1
    ORDER_FILLING_RETURN = 2
    ORDER_FILLING_IOC = 1
    ORDER_FILLING_FOK = 0
    SYMBOL_FILLING_IOC = 2
    SYMBOL_FILLING_FOK = 1
    TRADE_ACTION_DEAL = 1
    ORDER_TIME_GTC = 0
    TRADE_RETCODE_DONE = 10009
    TRADE_RETCODE_DONE_PARTIAL = 10010
    TRADE_RETCODE_PLACED = 10008
    TRADE_RETCODE_TIMEOUT = 10012
    TRADE_RETCODE_CONNECTION = 10031

    def __init__(self, *, trade_mode=0, equity=10000, risk=-50):
        self.account = SimpleNamespace(
            trade_mode=trade_mode, trade_allowed=True, equity=equity, currency='USD',
        )
        self.sent = []
        self.risk = risk

    def terminal_info(self):
        return SimpleNamespace(trade_allowed=True, connected=True)

    def account_info(self):
        return self.account

    def symbol_info(self, symbol):
        return SimpleNamespace(volume_min=0.01, volume_max=10.0, volume_step=0.01, filling_mode=2)

    def symbol_select(self, symbol, visible):
        return True

    def symbol_info_tick(self, symbol):
        return SimpleNamespace(bid=1.1000, ask=1.1002)

    def order_calc_profit(self, order_type, symbol, volume, entry, stop):
        return self.risk

    def order_check(self, request):
        return SimpleNamespace(retcode=0, comment='')

    def order_send(self, request):
        self.sent.append(request)
        return SimpleNamespace(retcode=10009, order=9876, deal=9875, price=request['price'], volume=request['volume'], comment='done')


BASE_ORDER = {
    'id': 'a' * 32,
    'symbol': 'EURUSD',
    'brokerSymbol': 'EURUSDm',
    'side': 'buy',
    'volume': 0.01,
    'stopLoss': 1.09,
    'takeProfit': 1.12,
    'maxRiskPercent': 1.25,
}
BASE_MAP = {'EURUSD': 'EURUSDm'}


class BridgeSafetyTests(unittest.TestCase):
    def test_live_account_is_rejected_before_order_send(self):
        mt5 = FakeMT5(trade_mode=2)
        result = order_result(mt5, BASE_ORDER, BASE_MAP)
        self.assertEqual(result['status'], 'rejected')
        self.assertIn('Live or contest', result['message'])
        self.assertEqual(mt5.sent, [])

    def test_actual_broker_stop_risk_is_capped_before_send(self):
        mt5 = FakeMT5(equity=1000, risk=-50)
        result = order_result(mt5, BASE_ORDER, BASE_MAP)
        self.assertEqual(result['status'], 'rejected')
        self.assertIn('exceeds the 1.25%', result['message'])
        self.assertEqual(mt5.sent, [])

    def test_valid_demo_order_is_sent_once_after_preflight(self):
        mt5 = FakeMT5(equity=10000, risk=-50)
        result = order_result(mt5, BASE_ORDER, BASE_MAP)
        self.assertEqual(result['status'], 'filled')
        self.assertEqual(result['ticket'], 9876)
        self.assertEqual(len(mt5.sent), 1)
        self.assertEqual(mt5.sent[0]['symbol'], 'EURUSDm')
        self.assertEqual(mt5.sent[0]['sl'], 1.09)

    def test_invalid_volume_step_does_not_reach_mt5_order_send(self):
        mt5 = FakeMT5()
        order = dict(BASE_ORDER, volume=0.015)
        result = order_result(mt5, order, BASE_MAP)
        self.assertEqual(result['status'], 'rejected')
        self.assertIn('lot step', result['message'])
        self.assertEqual(mt5.sent, [])

    def test_order_send_timeout_is_reported_unknown_and_never_retried(self):
        mt5 = FakeMT5()

        def timeout_after_send(request):
            mt5.sent.append(request)
            raise TimeoutError('terminal response was lost')

        mt5.order_send = timeout_after_send
        result = order_result(mt5, BASE_ORDER, BASE_MAP)
        self.assertEqual(result['status'], 'unknown')
        self.assertIn('outcome is uncertain', result['message'])
        self.assertEqual(len(mt5.sent), 1)

    def test_partial_fill_is_not_reported_as_full_fill(self):
        mt5 = FakeMT5()
        mt5.order_send = lambda request: (
            mt5.sent.append(request) or SimpleNamespace(
                retcode=10010, order=6789, price=request['price'], volume=0.005, comment='partial',
            )
        )
        result = order_result(mt5, BASE_ORDER, BASE_MAP)
        self.assertEqual(result['status'], 'partial')
        self.assertEqual(result['filledVolume'], 0.005)
        self.assertIn('partially filled', result['message'])
        self.assertEqual(len(mt5.sent), 1)

    def test_placed_retcode_is_unknown_until_terminal_history_review(self):
        mt5 = FakeMT5()
        mt5.order_send = lambda request: (
            mt5.sent.append(request) or SimpleNamespace(retcode=10008, order=4567, comment='placed')
        )
        result = order_result(mt5, BASE_ORDER, BASE_MAP)
        self.assertEqual(result['status'], 'unknown')
        self.assertEqual(result['ticket'], 4567)
        self.assertIn('check MT5 history', result['message'])
        self.assertEqual(len(mt5.sent), 1)


if __name__ == '__main__':
    unittest.main()
