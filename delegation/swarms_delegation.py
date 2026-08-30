#!/usr/bin/env python3
"""
Swarms Delegation Integration — Silent Giants
==============================================
Runs Swarms agents with a custom LLM bridge. The bridge calls the project's
Node AI engine (src/ai.js via a small CLI) which uses the local llama model +
smart Arabic fallbacks, so delegation works offline without external keys.

Usage:
  python delegation/swarms_delegation.py <task_text>

Agents (per leader's order):
  planner  -> main coordinator  (المخطط)
  executor -> execution agent   (المنفذ)
  reviewer -> quality agent     (المراجع)
  scout    -> intelligence agent (المستخبر)
"""
import sys
import os
import json
import subprocess
import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AI_BRIDGE = os.path.join(ROOT, "delegation", "ai_bridge.mjs")
AUDIT_LOG = os.path.join(ROOT, "state", "SWARMS_AUDIT_LOG.md")

AGENTS = {
    "planner": "المخطط — منسق رئيسي: يقسّم المهام ويحدد الأولويات.",
    "executor": "المنفذ — وكيل تنفيذي: ينفّذ المهام منتجاً مخرجات كاملة.",
    "reviewer": "المراجع — وكيل جودة: يفحص المخرجات ويصححها.",
    "scout": "المستخبر — وكيل استخباراتي: يبحث عن الفرص والمعلومات.",
}


class SystemAI:
    """Bridge to the project's Node AI engine (local llama + fallbacks)."""

    def __init__(self, role):
        self.role = role

    def run(self, task: str) -> str:
        try:
            proc = subprocess.run(
                ["node", AI_BRIDGE, self.role, task],
                capture_output=True, text=True, timeout=180,
                cwd=ROOT,
            )
            return (proc.stdout or "").strip() or (proc.stderr or "").strip() or "تعذر توليد الرد."
        except Exception as e:
            return f"خطأ في توليد الرد: {e}"


def audit(agent, task, result):
    line = (
        f"| {datetime.datetime.now().isoformat(timespec='seconds')} "
        f"| {agent} | {task[:80]} | {result[:80]} |"
    )
    os.makedirs(os.path.dirname(AUDIT_LOG), exist_ok=True)
    if not os.path.exists(AUDIT_LOG):
        with open(AUDIT_LOG, "w") as f:
            f.write("# 📋 سجل تدقيق تفويض Swarms\n\n| الوقت | الوكيل | المهمة | النتيجة |\n|---|---|---|---|\n")
    with open(AUDIT_LOG, "a") as f:
        f.write(line + "\n")


def main():
    task = " ".join(sys.argv[1:]) or "فصل المهام وتوزيعها على الوكلاء."
    results = {}
    for name, role in AGENTS.items():
        llm = SystemAI(name)
        # Call the agent directly (no external model needed)
        try:
            output = llm.run(f"{role}\nالمهمة: {task}")
        except Exception as e:
            output = f"تعذر تشغيل الوكيل: {e}"
        results[name] = output
        audit(name, task, output)
        print(f"[{name}] {output}\n")

    print("=== ملخص ===")
    print(json.dumps({k: v[:120] + "..." for k, v in results.items()}, ensure_ascii=False, indent=2))


def main_fast():
    """Fast concurrent delegation: each agent falls back quickly."""
    import concurrent.futures
    task = " ".join(sys.argv[1:]) or "توزيع المهام"
    def run_one(pair):
        name, role = pair
        llm = SystemAI(name)
        out = llm.run(f"{role}\nالمهمة: {task}")
        audit(name, task, out)
        return name, out
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
        futures = {ex.submit(run_one, pair): pair[0] for pair in AGENTS.items()}
        results = {}
        for fut in concurrent.futures.as_completed(futures):
            name, out = fut.result()
            results[name] = out
            print(f"[{name}] {out}\n")
    print("=== ملخص ===")
    print(json.dumps({k: v[:120] for k, v in results.items()}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main_fast()
