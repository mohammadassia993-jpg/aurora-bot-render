"""
Swarms + Agnes AI - Final Integration
تفويض المهام بين الوكلاء باستخدام Agnes AI عبر litellm
"""
import os, sys, json
from datetime import datetime

sys.path.insert(0, '/root/silent-giants')

from dotenv import load_dotenv
load_dotenv('/root/silent-giants/.env')

os.environ["OPENAI_API_BASE"] = os.getenv("AGNES_API_URL", "https://apihub.agnes-ai.com/v1")
os.environ["OPENAI_API_KEY"] = os.getenv("AGNES_API_KEY", "")

from swarms import Agent, SequentialWorkflow, RoundRobinSwarm

# Model name for litellm (OpenAI-compatible format)
MODEL = "openai/agnes-2.0-flash"

print("=" * 60)
print("🔄 Swarms + Agnes AI - التفويض الكامل")
print("=" * 60)

# Define agents
aurora = Agent(
    name="aurora",
    model_name=MODEL,
    system_prompt="أنت أورورا، منسقة فريق عمالقة الصمت. أجب بالعربية الفصحى.",
    max_loops=1,
    temperature=0.7,
)

planner = Agent(
    name="planner",
    model_name=MODEL,
    system_prompt="أنت المخطط. حدد الأولويات وخطة التنفيذ. أجب بالعربية.",
    max_loops=1,
    temperature=0.7,
)

executor = Agent(
    name="executor",
    model_name=MODEL,
    system_prompt="أنت المنفذ. نفّذ المهمة واكتب المحتوى. أجب بالعربية.",
    max_loops=1,
    temperature=0.7,
)

reviewer = Agent(
    name="reviewer",
    model_name=MODEL,
    system_prompt="أنت المراجع. راجع المخرج وقدم ملاحظات. أجب بالعربية.",
    max_loops=1,
    temperature=0.7,
)

audit_log = []

# Test 1: Sequential
print("\n📋 اختبار 1: تسلسل المهام")
print("-" * 40)

task = "اكتب جملة واحدة عن أهمية Web3 للمبتدئين العرب"
print(f"المهمة: {task}")

workflow = SequentialWorkflow(
    agents=[aurora, planner, executor, reviewer],
    max_loops=1,
)

try:
    result = workflow.run(task)
    print(f"\n✅ النتيجة:\n{result}")
    audit_log.append({"timestamp": datetime.now().isoformat(), "test": "sequential", "status": "success"})
except Exception as e:
    print(f"\n❌ خطأ: {e}")
    audit_log.append({"timestamp": datetime.now().isoformat(), "test": "sequential", "status": "error", "error": str(e)[:200]})

# Test 2: Round Robin
print("\n📋 اختبار 2: دوران المهام")
print("-" * 40)

task2 = "اقترح فكرة واحدة لمحتوى Web3 عربي"
print(f"المهمة: {task2}")

rr = RoundRobinSwarm(
    agents=[aurora, planner, executor, reviewer],
    max_loops=1,
)

try:
    result2 = rr.run(task2)
    print(f"\n✅ النتيجة:\n{result2}")
    audit_log.append({"timestamp": datetime.now().isoformat(), "test": "round_robin", "status": "success"})
except Exception as e:
    print(f"\n❌ خطأ: {e}")
    audit_log.append({"timestamp": datetime.now().isoformat(), "test": "round_robin", "status": "error", "error": str(e)[:200]})

# Save audit log
with open('/root/silent-giants/deliverables/reports/swarm-audit-log.json', 'w') as f:
    json.dump(audit_log, f, indent=2, ensure_ascii=False)

print("\n" + "=" * 60)
print("📊 سجل التدقيق:")
for entry in audit_log:
    print(f"  [{entry['timestamp']}] {entry['test']}: {entry['status']}")
print("=" * 60)
