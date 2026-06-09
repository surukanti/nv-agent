import os
from openai import OpenAI

api_key = os.environ.get("NVIDIA_API_KEY")
if not api_key:
    raise EnvironmentError(
        "NVIDIA_API_KEY environment variable is not set. "
        "Export it before running: export NVIDIA_API_KEY='your-key-here'"
    )

client = OpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key=api_key,
)

prompt = input("Enter your prompt: ") if os.isatty(0) else "Hello!"

try:
    completion = client.chat.completions.create(
        model="deepseek-ai/deepseek-v4-pro",
        messages=[{"role": "user", "content": prompt}],
        temperature=1,
        top_p=0.95,
        max_tokens=16384,
        extra_body={"chat_template_kwargs": {"thinking": False}},
        stream=True,
    )

    for chunk in completion:
        if not getattr(chunk, "choices", None):
            continue
        if chunk.choices and chunk.choices[0].delta.content is not None:
            print(chunk.choices[0].delta.content, end="")

    print()  # newline after streaming output
except Exception as e:
    print(f"\nError: {e}")


