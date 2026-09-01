"""
Swarms + Agnes AI - Full Integration Test
تفويض المهام بين الوكلاء باستخدام Agnes AI
"""
import os
import sys
import json
import time
from datetime import datetime

sys.path.insert(0, '/root/silent-giants')
sys.path.insert(0, '/root/silent-giants/scripts')

from dotenv import load_dotenv
load_dotenv('/root/silent-giants/.env')

from agnes_llm_wrapper import AgnesLLM
from swarms import Agent, SequentialWorkflow, RoundRobinSwarm

# Create LLM instance
llm = AgnesLLM()

print("=" * 60)
print("🔄 اختبار Swarms + Agnes AI - التفويض الكامل")
print("=" * 60)

# Define the four agents with custom LLM
aurora = Agent(
    name="aurora",
    llm=llm,
    system_prompt="""أنت أورورا، منسقة فريق عمالقة الصمت.
مهمتك: تنسيق المهام بين الوكلاء، إرسال التقارير للقائد، ومراقبة التقدم.
أجب بالعربية الفصحى دائماً. قدم إجابة مختصرة وواضحة.""",
    max_loops=1,
)

planner = Agent(
    name="planner",
    llm=llm,
    system_prompt="""أنت المخطط في فريق عمالقة الصمت.
مهمتك: تحليل المهام، تحديد الأولويات، توزيع العمل على الوكلاء.
أجب بالعربية الفصحى دائماً. قدم خطة واضحة ومختصرة.""",
    max_loops=1,
)

executor = Agent(
    name="executor",
    llm=llm,
    system_prompt="""أنت المنفذ في فريق عمالقة الصمت.
مهمتك: تنفيذ المهام المطلوبة، كتابة المحتوى، إعداد الملفات.
أجب بالعربية الفصحى دائماً. قدم محتوى جاهز للتنفيذ.""",
    max_loops=1,
)

reviewer = Agent(
    name="reviewer",
    llm=llm,
    system_prompt="""أنت المراجع في فريق عمالقة الصمت.
مهمتك: مراجعة المخرجات، التأكد من الجودة، اقتراح التحسينات.
أجب بالعربية الفصحى دائماً. قدم ملاحظات بناءة.""",
    max_loops=1,
)

# Audit log
audit_log = []

def log_audit(agent, action, result):
    entry = {
        "timestamp": datetime.now().isoformat(),
        "agent": agent,
        "action": action,
        "result_preview": str(result)[:200]
    }
    audit_log.append(entry)
    print(f"  📝 Audit: {agent} - {action}")

# Test 1: Sequential Workflow
print("\n📋 اختبار 1: تسلسل المهام (Sequential Workflow)")
print("-" * 40)

workflow = SequentialWorkflow(
    agents=[aurora, planner, executor, reviewer],
    max_loops=1,
)

task = "اكتب مقالاً قصيراً (30 كلمة) عن أهمية تعليم Web3 للمبتدئين العرب"
print(f"المهمة: {task}")
print("جاري التنفيذ...")

try:
    result = workflow.run(task)
    print(f"\n✅ النتيجة:\n{result}")
    log_audit("workflow", "sequential_task", result)
except Exception as e:
    print(f"\n❌ خطأ: {e}")
    log_audit("workflow", "sequential_error", str(e))

# Test 2: Round Robin
print("\n📋 اختبار 2: دوران المهام (Round Robin)")
print("-" * 40)

rr_swarm = RoundRobinSwarm(
    agents=[aurora, planner, executor, reviewer],
    max_loops=1,
)

task2 = "اقترح فكرة واحدة لمحتوى Web3 عربي"
print(f"المهمة: {task2}")
print("جاري التنفيذ...")

try:
    result2 = rr_swarm.run(task2)
    print(f"\n✅ النتيجة:\n{result2}")
    log_audit("rr_swarm", "round_robin_task", result2)
except Exception as e:
    print(f"\n❌ خطأ: {e}")
    log_audit("rr_swarm", "round_robin_error", str(e))

# Save audit log
print("\n" + "=" * 60)
print("📊 سجل التدقيق (Audit Log)")
print("=" * 60)
for entry in audit_log:
    print(f"  [{entry['timestamp']}] {entry['agent']}: {entry['action']}")

# Save to file
with open('/root/silent-giants/deliverables/reports/swarm-audit-log.json', 'w') as f:
    json.dump(audit_log, f, indent=2, ensure_ascii=False)

print(f"\n✅ حُفظ سجل التدقيق في: deliverables/reports/swarm-audit-log.json")
print("=" * 60)
print("✅ اكتمل اختبار Swarms + Agnes AI بنجاح!")
print("=" * 60)
