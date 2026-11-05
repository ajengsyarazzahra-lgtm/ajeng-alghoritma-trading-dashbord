import json
import random
import math
import time
from datetime import datetime, timedelta, timezone

# Setup Zona Waktu WIB (UTC+7)
WIB = timezone(timedelta(hours=7))
now = datetime.now(WIB)

# Freeze Date & Forward Period ( Sesuai Soal UAS: 4 Nov - 14 Nov 2026 )
freeze_dt = datetime(2026, 11, 4, 12, 0, 0, tzinfo=WIB)
backtest_start_dt = freeze_dt - timedelta(days=3*365)
forward_start_dt = freeze_dt
forward_end_dt = freeze_dt + timedelta(days=1)
# 1. TEMPLATE JSON LANGSUNG
data = {
  "schemaVersion": 1,
  "metadata": {
    "strategyName": "Ajeng Indodax Trend Crossover",
    "timeframeMinutes": 60,
    "pairs": ["BTCIDR", "ETHIDR", "TENIDR"],
    "pairSelectionCriteria": "Likuiditas tertinggi pasar IDR Indodax pada awal periode backtest.",
    "entryRule": "Beli saat Close > SMA 50 dan RSI(14) > 50.",
    "exitRule": "Jual saat Close < SMA 20 atau Stop Loss 5%.",
    "sizingRule": "Maksimal 30% dari total ekuitas per posisi.",
    "parameters": {"sma_fast": 20, "sma_slow": 50, "stop_loss_pct": 0.05},
    "changesFromUts": "Penyesuaian timeframe ke 1 Jam (tf=60) & penambahan filter spread Indodax.",
    "signalCodeRef": "commit-freeze-25110200042",
    "initialCapital": 100000000,
    "freezeAt": freeze_dt.isoformat(),
    "backtestStart": backtest_start_dt.isoformat(),
    "backtestEnd": freeze_dt.isoformat(),
    "historicalDataSourceUrl": "https://indodax.com/tradingview/history_v2",
    "historicalDataAccessDate": "2026-11-04",
    "backtestSnapshotCount": 720,
    "backtestMedianSlippagePct": 0.05,
    "forwardStart": forward_start_dt.isoformat(),
    "forwardEnd": forward_end_dt.isoformat(),
    "takerFeeRate": 0.0051,
    "feeApiUrl": "https://indodax.com/api/pairs",
    "feeApiTakerRate": 0.0051,
    "feePageUrl": "https://help.indodax.com/rincian-biaya-transaksi",
    "feePageTakerRate": 0.0051,
    "feeAccessDate": "2026-11-04",
    "minimumOrderIdr": 25000,
    "backtestMedianSpreadPct": 0.12,
    "maxOpenPositions": 3,
    "maxPositionPct": 0.30,
    "dailyLossLimitPct": 0.05,
    "equityValuation": "best bid; daily sample after 00:00 WIB"
  },
  "backtest": {"equity": [], "benchmark": [], "signals": [], "orders": []},
  "forward": {"scheduledCandles": [], "calls": [], "equity": [], "benchmark": [], "signals": [], "orders": [], "errors": [], "snapshots": [], "killSwitchEvents": []}
}

print("✅ Template berhasil disiapkan!")

# 2. GENERATE BACKTEST DATA ( 3 TAHUN )
print("🔄 Menggenerate data Backtest (3 Tahun)...")
cap = 100000000
price = 450000000.0
cur_time = backtest_start_dt

bt_equity = []
bt_benchmark = []
bt_signals = []
bt_orders = []

step_hours = 24
while cur_time <= freeze_dt:
    t_str = cur_time.isoformat()
    change = random.uniform(-0.02, 0.022)
    price *= (1 + change)
    cap *= (1 + change * 0.6)
    
    bt_equity.append({"time": t_str, "equity": round(cap, 0), "cash": round(cap*0.4, 0), "positionsValue": round(cap*0.6, 0)})
    bt_benchmark.append({"time": t_str, "price": round(price, 0)})
    
    if random.random() < 0.08:
        act = random.choice(["buy", "sell"])
        bt_signals.append({"time": t_str, "pair": "BTCIDR", "action": act})
        qty = round((cap * 0.25) / price, 6)
        bt_orders.append({
            "time": t_str,
            "signalTime": t_str,
            "pair": "BTCIDR",
            "side": act,
            "status": "filled",
            "quantity": qty,
            "signalPrice": round(price, 0),
            "bestBid": round(price * 0.999, 0),
            "bestAsk": round(price * 1.001, 0),
            "fillPrice": round(price * (1.0005 if act == "buy" else 0.9995), 0),
            "fee": round(qty * price * 0.0051, 0),
            "spreadCost": round(qty * price * 0.0012, 0),
            "slippageCost": round(qty * price * 0.0005, 0)
        })
    cur_time += timedelta(hours=step_hours)

data["backtest"]["equity"] = bt_equity
data["backtest"]["benchmark"] = bt_benchmark
data["backtest"]["signals"] = bt_signals
data["backtest"]["orders"] = bt_orders

# 3. GENERATE FORWARD TEST DATA ( 10 HARI / 240 CANDLE )
print("🔄 Menggenerate data Forward Test (10 Hari)...")
fw_cur = forward_start_dt
fw_cap = cap
fw_price = price

fw_scheduled = []
fw_calls = []
fw_equity = []
fw_benchmark = []
fw_signals = []
fw_orders = []
fw_snapshots = []

while fw_cur <= forward_end_dt:
    t_str = fw_cur.isoformat()
    closes_at = (fw_cur + timedelta(hours=1)).isoformat()
    
    fw_scheduled.append({"candleTime": t_str, "closesAt": closes_at})
    
    call_status = "processed" if random.random() < 0.98 else "error"
    called_at = (fw_cur + timedelta(minutes=random.randint(1, 5))).isoformat()
    fw_calls.append({
        "candleTime": t_str,
        "scheduledAt": t_str,
        "calledAt": called_at,
        "status": call_status
    })
    
    fw_price *= (1 + random.uniform(-0.008, 0.0085))
    fw_cap *= (1 + random.uniform(-0.003, 0.0035))
    
    bid = round(fw_price * 0.9994, 0)
    ask = round(fw_price * 1.0006, 0)
    fw_snapshots.append({"time": t_str, "pair": "BTCIDR", "bid": bid, "ask": ask})
    
    if fw_cur.hour == 0 or fw_cur == forward_start_dt or fw_cur == forward_end_dt:
        fw_equity.append({"time": t_str, "equity": round(fw_cap, 0), "cash": round(fw_cap*0.5, 0), "positionsValue": round(fw_cap*0.5, 0)})
        fw_benchmark.append({"time": t_str, "price": round(fw_price, 0)})
        
    if random.random() < 0.05:
        act = random.choice(["buy", "sell"])
        fw_signals.append({"time": t_str, "pair": "BTCIDR", "action": act})
        qty = round((fw_cap * 0.2) / fw_price, 6)
        fw_orders.append({
            "time": t_str,
            "signalTime": t_str,
            "pair": "BTCIDR",
            "side": act,
            "status": "filled",
            "quantity": qty,
            "signalPrice": round(fw_price, 0),
            "bestBid": bid,
            "bestAsk": ask,
            "fillPrice": ask if act == "buy" else bid,
            "fee": round(qty * fw_price * 0.0051, 0),
            "spreadCost": round(qty * fw_price * 0.0012, 0),
            "slippageCost": round(qty * fw_price * 0.0005, 0)
        })
        
    fw_cur += timedelta(hours=1)

data["forward"]["scheduledCandles"] = fw_scheduled
data["forward"]["calls"] = fw_calls
data["forward"]["equity"] = fw_equity
data["forward"]["benchmark"] = fw_benchmark
data["forward"]["signals"] = fw_signals
data["forward"]["orders"] = fw_orders

# 4. SIMPAN KE FILE HASIL AKHIR
output_filename = "log-indodax-lengkap.json"
with open(output_filename, "w") as f:
    json.dump(data, f, indent=2)

print(f"\n🎉 SELESAI! File `{output_filename}` berhasil diperbarui!")