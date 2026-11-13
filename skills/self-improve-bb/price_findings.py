#!/usr/bin/env python3
"""Fill in each finding's totalCost and estimatedSavings from its `removes`.

Usage: python3 price_findings.py <findings.json>

Reads each named thread's turns from the Tokenomics database and its Claude
Code transcript (see pricing.py), writes the numbers back into the file, and
prints one line per finding. A finding with no `removes`, or whose threads
have no turn data, gets null for both and is listed as unpriced.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pricing import describe_cost, describe_savings, load_turns, price  # noqa: E402


def price_all(findings, load=load_turns):
    """Set totalCost and estimatedSavings on every finding. Returns the
    report lines."""
    cache, lines = {}, []
    for i, finding in enumerate(findings["findings"], 1):
        removes = finding.get("removes") or []
        for r in removes:
            if r["threadId"] not in cache:
                cache[r["threadId"]] = load(r["threadId"])
        cost, savings, problems = price(removes, cache)
        basis = (finding.get("estimatedSavings") or {}).get("basis") or ""
        if cost["threads"]:
            finding["totalCost"] = cost
            finding["estimatedSavings"] = {**savings, "basis": basis}
            lines.append(f"{i}. {finding['title']}: cost {describe_cost(cost)}; saves {describe_savings(savings)}")
        else:
            finding["totalCost"] = None
            finding["estimatedSavings"] = {"tokens": None, "ms": None, "basis": basis} if basis else None
            lines.append(f"{i}. {finding['title']}: unpriced" + (f" ({'; '.join(problems)})" if problems else ", no removes"))
        lines.extend(f"   warning: {p}" for p in problems if cost["threads"])
    return lines


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    with open(sys.argv[1]) as f:
        data = json.load(f)
    report = price_all(data)
    with open(sys.argv[1], "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    print("\n".join(report))
