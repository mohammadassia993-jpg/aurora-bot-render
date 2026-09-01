"""
Swarms + Agnes AI Integration
تفويض المهام بين الوكلاء باستخدام Agnes AI
"""
import os
import sys
import json
import time
from datetime import datetime

# Add the silent-giants directory to path
sys.path.insert(0, '/root/silent-giants')

# Load environment variables
from dotenv import load_dotenv
load_dotenv('/root/silent-giants/.env')

# Configure Agnes AI as the LLM provider
os.environ["OPENAI_API_BASE"] = os.getenv("AGNES_API_URL", "https://apihub.agnes-ai.com/v1")
os.environ["OPENAI_API_KEY"] = os.getenv("AGNES_API_KEY", "")
os.environ["OPENAI_API_MODEL"] = os.getenv("AGNES_MODEL", "agnes-2.0-flash")

from swarms import Agent, SequentialWorkflow, RoundRobinSwarm

# Define the four agents
aurora = Agent(
    name="aurora",
    model_name=os.getenv("AGNES_MODEL", "agnes-2.0-flash"),
    system_prompt="""أنت أورورا، منسقة فريق عمالقة الصمت.
مهمتك: تنسيق المهام بين الوكلاء، إرسال التقارير للقائد، ومراقبة التقدم.
أجب بالعربية الفصحى دائماً.""",
    max_loops=1,
    temperature=0.7,
)

planner = Agent(
    name="planner",
    model_name=os.getenv("AGNES_MODEL", "agnes-2.0-flash"),
    system_prompt="""أنت المخطط في فريق عمالقة الصمت.
مهمتك: تحليل المهام، تحديد الأولويات، توزيع العمل على الوكلاء.
أجب بالعربية الفصحى دائماً.""",
    max_loops=1,
    temperature=0.7,
)

executor = Agent(
    name="executor",
    model_name=os.getenv("AGNES_MODEL", "agnes-2.0-flash"),
    system_prompt="""أنت المنفذ في فريق عمالقة الصمت.
مهمتك: تنفيذ المهام المطلوبة، كتابة المحتوى، إعداد الملفات.
أجب بالعربية الفصحى دائماً.""",
    max_loops=1,
    temperature=0.7,
)

reviewer = Agent(
    name="reviewer",
    model_name=os.getenv("AGNES_MODEL", "agnes-2.0-flash"),
    system_prompt="""أنت المراجع في فريق عمالقة الصمت.
مهمتك: مراجعة المخرجات، التأكد من الجودة، اقتراح التحسينات.
أجب بالعربية الفصحى دائماً.""",
    max_loops=1,
    temperature=0.7,
)

print("=" * 60)
print("🔄 اختبار Swarms + Agnes AI")
print("=" * 60)

# Test 1: Sequential Workflow
print("\n📋 اختبار 1: تسلسل المهام (Sequential Workflow)")
print("-" * 40)

workflow = SequentialWorkflow(
    agents=[aurora, planner, executor, reviewer],
    max_loops=1,
)

task = "اكتب مقالاً قصيراً (50 كلمة) عن أهمية DePIN للمبتدئين العرب"
print(f"المهمة: {task}")
print("جاري التنفيذ...")

try:
    result = workflow.run(task)
    print(f"\n✅ النتيجة:\n{result}")
except Exception as e:
    print(f"\n❌ خطأ: {e}")

# Test 2: Round Robin
print("\n📋 اختبار 2: دوران المهام (Round Robin)")
print("-" * 40)

rr_swarm = RoundRobinSwarm(
    agents=[aurora, planner, executor, reviewer],
    max_loops=1,
)

task2 = "اقترح 3 أفكار لمحتوى Web3 عربي"
print(f"المهمة: {task2}")
print("جاري التنفيذ...")

try:
    result2 = rr_swarm.run(task2)
    print(f"\n✅ النتيجة:\n{result2}")
except Exception as e:
    print(f"\n❌ خطأ: {e}")

print("\n" + "=" * 60)
print("✅ اكتمل اختبار Swarms + Agnes AI")
print("=" * 60)
