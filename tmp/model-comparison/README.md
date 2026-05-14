# Workers AI model comparison

Prompt: Do you trust your instincts or logic more when making important decisions?
Host: http://localhost:5174

| Model | Status | Latency |
|---|---|---|
| [Llama 3.3 70B fp8 (current)](./meta-llama-3-3-70b-instruct-fp8-fast.md) | ✓ | 29015ms |
| [Llama 4 Scout 17B](./meta-llama-4-scout-17b-16e-instruct.md) | ✓ | 9555ms |
| [GPT-OSS 120B](./openai-gpt-oss-120b.md) | ✓ | 22736ms |
| [Gemma 3 27B IT](./google-gemma-3-27b-it.md) | ✗ Error: 5007: No such model @cf/google/gemma-3-27b-it or task | 649ms |
| [Qwen 2.5 Coder 32B](./qwen-qwen2-5-coder-32b-instruct.md) | ✓ | 12172ms |