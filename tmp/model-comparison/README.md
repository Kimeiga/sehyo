# Workers AI model comparison

Prompt: Do you trust your instincts or logic more when making important decisions?
Host: http://127.0.0.1:5174

| Model | Status | Latency |
|---|---|---|
| [Llama 3.3 70B fp8 (current)](./meta-llama-3-3-70b-instruct-fp8-fast.md) | ✓ | 16551ms |
| [Llama 3.1 70B (non-fp8)](./meta-llama-3-1-70b-instruct.md) | ✓ | 23704ms |
| [Llama 3.1 8B](./meta-llama-3-1-8b-instruct.md) | ✓ | 9220ms |
| [Llama 4 Scout 17B](./meta-llama-4-scout-17b-16e-instruct.md) | ✓ | 10971ms |
| [Kimi K2.6 (Moonshot)](./moonshotai-kimi-k2-6.md) | ✓ | 67329ms |
| [Kimi K2.5 (Moonshot)](./moonshotai-kimi-k2-5.md) | ✗ Error: <html>
<head><title>504 Gateway Time-out</title></head>
<body>
<center><h1>504 Gateway Time-out</h1></center>
<hr><center>cloudflare</center>
</body>
</html>
 | 60177ms |
| [Nemotron 3 120B (NVIDIA)](./nvidia-nemotron-3-120b-a12b.md) | ✓ | 34588ms |
| [Gemma 4 26B IT](./google-gemma-4-26b-a4b-it.md) | ✓ | 74431ms |
| [Gemma 3 12B IT](./google-gemma-3-12b-it.md) | ✓ | 10545ms |
| [Qwen 3 30B fp8](./qwen-qwen3-30b-a3b-fp8.md) | ✗ Error: 4006: you have used up your daily free allocation of 10,000 neurons, please upgrade to Cloudflare's Workers Paid plan if you would like to continue usage. | 14018ms |
| [GPT-OSS 20B](./openai-gpt-oss-20b.md) | ✗ Error: 4006: you have used up your daily free allocation of 10,000 neurons, please upgrade to Cloudflare's Workers Paid plan if you would like to continue usage. | 229ms |
| [Mistral Small 3.1 24B](./mistralai-mistral-small-3-1-24b-instruct.md) | ✗ Error: 4006: you have used up your daily free allocation of 10,000 neurons, please upgrade to Cloudflare's Workers Paid plan if you would like to continue usage. | 225ms |
| [Granite 4.0 H Micro (IBM)](./ibm-granite-granite-4-0-h-micro.md) | ✗ Error: 4006: you have used up your daily free allocation of 10,000 neurons, please upgrade to Cloudflare's Workers Paid plan if you would like to continue usage. | 208ms |
| [QwQ 32B (reasoning)](./qwen-qwq-32b.md) | ✗ Error: 4006: you have used up your daily free allocation of 10,000 neurons, please upgrade to Cloudflare's Workers Paid plan if you would like to continue usage. | 187ms |
| [DeepSeek R1 distill Qwen 32B](./deepseek-ai-deepseek-r1-distill-qwen-32b.md) | ✗ Error: 4006: you have used up your daily free allocation of 10,000 neurons, please upgrade to Cloudflare's Workers Paid plan if you would like to continue usage. | 159ms |