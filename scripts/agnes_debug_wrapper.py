import os, sys, requests, json
from dotenv import load_dotenv
load_dotenv('/root/silent-giants/.env')

class AgnesLLMDebug:
    def __init__(self):
        self.api_url = os.getenv("AGNES_API_URL", "https://apihub.agnes-ai.com/v1")
        self.api_key = os.getenv("AGNES_API_KEY", "")
        self.model = os.getenv("AGNES_MODEL", "agnes-2.0-flash")
    
    def run(self, task: str, **kwargs) -> str:
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}"
        }
        
        # Build messages from task
        messages = []
        
        # Check if task is a list of messages (Swarms format)
        if isinstance(task, list):
            for msg in task:
                if isinstance(msg, dict):
                    role = msg.get("role", "user")
                    content = msg.get("content", "")
                    if role in ("system", "user", "assistant"):
                        messages.append({"role": role, "content": str(content)})
                else:
                    messages.append({"role": "user", "content": str(msg)})
        else:
            # Single string task
            system_prompt = kwargs.get("system_prompt", "")
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": str(task)})
        
        if not messages:
            messages = [{"role": "user", "content": str(task)}]
        
        payload = {
            "model": self.model,
            "messages": messages,
            "max_tokens": 1024,
            "temperature": 0.7,
            "stream": False
        }
        
        # Debug: print what we're sending
        print(f"[DEBUG] Messages count: {len(messages)}")
        for m in messages:
            print(f"[DEBUG] {m['role']}: {str(m['content'])[:100]}")
        
        try:
            response = requests.post(
                f"{self.api_url}/chat/completions",
                headers=headers,
                json=payload,
                timeout=30
            )
            print(f"[DEBUG] Status: {response.status_code}")
            if response.status_code != 200:
                print(f"[DEBUG] Error: {response.text[:200]}")
                return f"Error {response.status_code}: {response.text[:200]}"
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]
        except Exception as e:
            return f"Error: {str(e)}"
    
    def __call__(self, task: str, **kwargs) -> str:
        return self.run(task, **kwargs)

# Quick test
if __name__ == "__main__":
    llm = AgnesLLMDebug()
    print("Testing debug wrapper...")
    result = llm.run("مرحبا بالعربية")
    print(f"Result: {result}")
