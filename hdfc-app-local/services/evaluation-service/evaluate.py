"""
Minimal evaluation gate: runs banking fixture cases against base vs adapted
model, checks required/forbidden phrases, and blocks release on any critical
failure regardless of the aggregate pass rate. This mirrors the release-gate
rule in the spec: an improved average score cannot override a failed
mandatory control.

Usage:
    python evaluate.py --adapter runs/adapter-v0/adapter \
        --base-model TinyLlama/TinyLlama-1.1B-Chat-v1.0 \
        --fixtures data/evaluation-fixtures/banking_eval_cases.jsonl
"""
import argparse
import json
from pathlib import Path

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel


def load_fixtures(path: str):
    with open(path) as f:
        return [json.loads(line) for line in f if line.strip()]


def generate(model, tokenizer, prompt: str, max_new_tokens: int = 120) -> str:
    inputs = tokenizer(prompt, return_tensors="pt")
    with torch.no_grad():
        out = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            do_sample=False,
        )
    return tokenizer.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)


def score_case(case: dict, response: str) -> dict:
    text = response.lower()
    hit_required = any(phrase.lower() in text for phrase in case.get("must_contain_any", []))
    hit_forbidden = any(phrase.lower() in text for phrase in case.get("must_not_contain", []))
    passed = hit_required and not hit_forbidden
    return {
        "id": case["id"],
        "category": case["category"],
        "severity": case["severity"],
        "passed": passed,
        "response": response,
    }


def run_suite(model, tokenizer, fixtures: list) -> list:
    results = []
    for case in fixtures:
        response = generate(model, tokenizer, case["prompt"])
        results.append(score_case(case, response))
    return results


def summarize(results: list, label: str):
    total = len(results)
    passed = sum(r["passed"] for r in results)
    critical_failures = [r for r in results if r["severity"] == "critical" and not r["passed"]]
    print(f"\n=== {label} ===")
    print(f"Pass rate: {passed}/{total}")
    for r in results:
        status = "PASS" if r["passed"] else "FAIL"
        print(f"  [{status}] {r['id']} ({r['severity']}, {r['category']})")
    return critical_failures


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--adapter", required=True)
    parser.add_argument("--base-model", required=True)
    parser.add_argument("--fixtures", required=True)
    args = parser.parse_args()

    fixtures = load_fixtures(args.fixtures)

    print(f"Loading base model: {args.base_model}")
    tokenizer = AutoTokenizer.from_pretrained(args.base_model)
    base_model = AutoModelForCausalLM.from_pretrained(args.base_model)

    base_results = run_suite(base_model, tokenizer, fixtures)
    base_critical = summarize(base_results, "Base model")

    print(f"\nLoading adapter: {args.adapter}")
    adapted_model = PeftModel.from_pretrained(base_model, args.adapter)
    adapted_results = run_suite(adapted_model, tokenizer, fixtures)
    adapted_critical = summarize(adapted_results, "Adapted model")

    gate_pass = len(adapted_critical) == 0

    report = {
        "gate_pass": gate_pass,
        "base_model_results": base_results,
        "adapted_model_results": adapted_results,
        "critical_failures": [r["id"] for r in adapted_critical],
    }
    report_path = Path("evaluation_report.json")
    report_path.write_text(json.dumps(report, indent=2))

    print(f"\nGate result: {'PASS' if gate_pass else 'BLOCKED'}")
    if not gate_pass:
        print(f"Critical failures: {[r['id'] for r in adapted_critical]}")
    print(f"Full report written to {report_path}")


if __name__ == "__main__":
    main()
