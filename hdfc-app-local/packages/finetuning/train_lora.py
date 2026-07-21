"""
Minimal, reproducible LoRA fine-tuning run.

This is the smallest real slice of the pipeline: it takes a frozen dataset
version and a pinned LoRA config, runs supervised fine-tuning, and writes
the adapter plus a run manifest (everything needed to reproduce the run).

Usage:
    python train_lora.py --base-model <hf_model_id> \
        --dataset data/synthetic/banking_instructions.jsonl \
        --output-dir runs/adapter-v0 \
        --config configs/lora/adapter-v0.yaml
"""
import argparse
import json
import hashlib
import subprocess
from pathlib import Path

import yaml
import torch
from datasets import load_dataset
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import LoraConfig, get_peft_model
from trl import SFTTrainer, SFTConfig


def hash_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        h.update(f.read())
    return h.hexdigest()


def format_record(record: dict) -> str:
    context = ""
    if record.get("context"):
        context = "\n".join(c["text"] for c in record["context"])
    parts = [f"Instruction: {record['instruction']}"]
    if context:
        parts.append(f"Context: {context}")
    parts.append(f"Response: {record['response']}")
    return "\n".join(parts)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-model", required=True)
    parser.add_argument("--dataset", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--config", default="configs/lora/adapter-v0.yaml")
    args = parser.parse_args()

    cfg = yaml.safe_load(Path(args.config).read_text())
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    torch.manual_seed(cfg["training"]["seed"])

    print(f"Loading base model: {args.base_model}")
    tokenizer = AutoTokenizer.from_pretrained(args.base_model)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(
        args.base_model,
        torch_dtype=torch.bfloat16 if cfg["training"]["precision"] == "bf16" else "auto",
    )

    lora_cfg = LoraConfig(
        r=cfg["lora"]["r"],
        lora_alpha=cfg["lora"]["alpha"],
        lora_dropout=cfg["lora"]["dropout"],
        target_modules=cfg["lora"]["target_modules"],
        bias=cfg["lora"]["bias"],
        task_type=cfg["lora"]["task_type"],
    )
    model = get_peft_model(model, lora_cfg)
    model.print_trainable_parameters()

    print(f"Loading dataset: {args.dataset}")
    dataset = load_dataset("json", data_files=args.dataset, split="train")
    dataset = dataset.filter(lambda r: r.get("split", "train") == "train")
    dataset = dataset.map(lambda r: {"text": format_record(r)})

    training_args = SFTConfig(
        output_dir=str(out_dir / "checkpoints"),
        per_device_train_batch_size=cfg["training"]["batch_size"],
        gradient_accumulation_steps=cfg["training"]["gradient_accumulation_steps"],
        num_train_epochs=cfg["training"]["epochs"],
        learning_rate=cfg["training"]["learning_rate"],
        max_seq_length=cfg["training"]["max_seq_length"],
        bf16=cfg["training"]["precision"] == "bf16",
        logging_steps=5,
        save_strategy="epoch",
        report_to=[],
    )

    trainer = SFTTrainer(
        model=model,
        args=training_args,
        train_dataset=dataset,
        dataset_text_field="text",
    )

    trainer.train()

    adapter_dir = out_dir / "adapter"
    model.save_pretrained(adapter_dir)
    tokenizer.save_pretrained(adapter_dir)

    try:
        git_commit = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], stderr=subprocess.DEVNULL
        ).decode().strip()
    except Exception:
        git_commit = "unknown"

    manifest = {
        "run_id": cfg["run_id"],
        "base_model": args.base_model,
        "dataset_path": args.dataset,
        "dataset_hash": hash_file(args.dataset),
        "lora_config": cfg["lora"],
        "training_config": cfg["training"],
        "hardware_profile": cfg["hardware_profile"],
        "code_commit": git_commit,
        "adapter_path": str(adapter_dir),
    }
    (out_dir / "run_manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"Adapter saved to {adapter_dir}")
    print(f"Run manifest saved to {out_dir / 'run_manifest.json'}")


if __name__ == "__main__":
    main()
