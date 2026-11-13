"""Offline smoke test against the actual cached models; no fabricated predictions."""
import asyncio
import importlib.util
import os
from pathlib import Path

os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ['INFERENCE_API_KEY'] = 'local-test-only'
spec = importlib.util.spec_from_file_location('worker', Path(__file__).parent / 'inference-worker/app.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


async def run():
    async with worker.lifespan(worker.app):
        data = worker.infer(worker.InferenceRequest(texts=['Soft comfortable fabric', 'Terrible weak material', 'Soft comfortable fabric']), 'Bearer local-test-only')
        assert [x['label'] for x in data['sentiments']] == ['POSITIVE','NEGATIVE','POSITIVE']
        assert len(data['embeddings']) == 3 and len(data['embeddings'][0]) == 384
        import sys
        sys.path.insert(0, str(Path(__file__).parent / 'backend'))
        from inference_client import max_similarities
        assert max_similarities(data['embeddings'])[0] > 0.99
        print('PASS: real DistilBERT sentiment, MiniLM 384-dimensional embeddings, duplicate semantic similarity')


asyncio.run(run())
