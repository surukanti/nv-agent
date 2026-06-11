"""NV-Agent — Quick CLI Smoke Test.

A minimal, standalone script that calls the NVIDIA NIM API directly
(without the RAG pipeline).  Useful for verifying API connectivity and
key validity before starting the full server.

For the production RAG web server, see main.py.
"""

import os

from openai import OpenAI

api_key = os.environ.get("NVIDIA_API_KEY")
if not api_key:
    raise OSError(
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
        # Model override for standalone testing.
        # main.py uses config.nvidia.chat_model (default: nvidia/nemotron-3-ultra-550b-a55b).
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
