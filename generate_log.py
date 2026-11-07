import argparse
import json
from pathlib import Path


def empty_template():
    return {
        "schemaVersion": 1,
        "metadata": {
            "strategyName": "",
            "timeframeMinutes": 60,
            "pairs": [],
            "pairSelectionCriteria": "",
            "entryRule": "",
            "exitRule": "",
            "sizingRule": "",
            "parameters": {},
            "changesFromUts": "",
            "signalCodeRef": "",
            "initialCapital": 100000000,
            "freezeAt": "",
            "backtestStart": "",
            "backtestEnd": "",
            "historicalDataSourceUrl": "",
            "historicalDataAccessDate": "",
            "backtestSnapshotCount": None,
            "backtestMedianSlippagePct": None,
            "forwardStart": "",
            "forwardEnd": "",
            "takerFeeRate": None,
            "feeApiUrl": "",
            "feeApiTakerRate": None,
            "feePageUrl": "",
            "feePageTakerRate": None,
            "feeAccessDate": "",
            "minimumOrderIdr": None,
            "backtestMedianSpreadPct": None,
            "maxOpenPositions": None,
            "maxPositionPct": None,
            "dailyLossLimitPct": None,
            "equityValuation": "best bid; daily sample after 00:00 WIB",
        },
        "backtest": {
            "equity": [],
            "benchmark": [],
            "signals": [],
            "orders": [],
        },
        "forward": {
            "scheduledCandles": [],
            "calls": [],
            "equity": [],
            "benchmark": [],
            "signals": [],
            "orders": [],
            "errors": [],
            "snapshots": [],
            "killSwitchEvents": [],
        },
    }


def main():
    parser = argparse.ArgumentParser(
        description="Buat template kosong; skrip ini tidak membuat hasil pasar atau trade sintetis."
    )
    parser.add_argument(
        "output",
        nargs="?",
        default="template-log-indodax.json",
        help="nama file JSON output (default: template-log-indodax.json)",
    )
    output = Path(parser.parse_args().output)
    output.write_text(json.dumps(empty_template(), indent=2), encoding="utf-8")
    print(f"Template kosong tersimpan di {output.resolve()}. Isi hanya dengan data yang benar-benar tercatat.")


if __name__ == "__main__":
    main()
