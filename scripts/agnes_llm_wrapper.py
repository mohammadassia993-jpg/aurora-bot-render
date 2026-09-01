"""
Custom LLM Wrapper for Agnes AI - compatible with Swarms
"""
import os
import requests
from dotenv import load_dotenv

load_dotenv('/root/silent-giants/.env')

class AgnesLLM:
    """Custom LLM wrapper for Agnes AI API"""
    
    def __init__(self):
        self.api_url = os.getenv("AGNES_API_URL", "https://apihub.agnes-ai.com/v1")
        self.api_key = os.getenv("AGNES_API_KEY", "")
        self.model = os.getenv("AGNES_MODEL", "agnes-2.0-flash")
    
    def run(self, task: str, **kwargs) -> str:
        """Run a task and return the response"""
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}"
        }
        
        # Extract system prompt if provided
        system_prompt = kwargs.get("system_prompt", "")
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": task})
        
        payload = {
            "model": self.model,
            "messages": messages,
            "max_tokens": 1024,
            "temperature": 0.7,
            "stream": False
        }
        
        try:
            response = requests.post(
                f"{self.api_url}/chat/completions",
                headers=headers,
                json=payload,
                timeout=30
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]
        except Exception as e:
            return f"Error: {str(e)}"
    
    def __call__(self, task: str, **kwargs) -> str:
        """Make the wrapper callable"""
        return self.run(task, **kwargs)

# Test the wrapper
if __name__ == "__main__":
    llm = AgnesLLM()
    print("Testing Agnes LLM Wrapper...")
    result = llm.run("مرحبا بالعربية، رد كلمة واحدة فقط")
    print(f"Response: {result}")
