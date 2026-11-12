import hmac
import os
import threading
from contextlib import asynccontextmanager
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

lock = threading.Lock()
models = {}


@asynccontextmanager
async def lifespan(app):
    # Fail before readiness if a secret was omitted. Model imports stay in this worker.
    if not os.getenv('INFERENCE_API_KEY'):
        raise RuntimeError('Set INFERENCE_API_KEY before starting the worker')
    import torch
    from transformers import pipeline
    from sentence_transformers import SentenceTransformer
    torch.set_num_threads(2)
    models['sentiment'] = pipeline('sentiment-analysis',
        model='distilbert-base-uncased-finetuned-sst-2-english', device=-1)
    models['embedding'] = SentenceTransformer('all-MiniLM-L6-v2', device='cpu')
    yield
    models.clear()


app = FastAPI(lifespan=lifespan)


class InferenceRequest(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=100)


@app.get('/health')
def health():
    if not models:
        raise HTTPException(503, 'Models not ready')
    return {'status': 'ready'}


@app.post('/infer')
def infer(request: InferenceRequest, authorization: str = Header(default='')):
    expected = os.getenv('INFERENCE_API_KEY', '')
    if not expected or not hmac.compare_digest(authorization, 'Bearer ' + expected):
        raise HTTPException(401, 'Invalid worker credentials')
    if any(not t.strip() or len(t) > 10000 for t in request.texts):
        raise HTTPException(422, 'Texts must contain 1 to 10000 characters')
    if not lock.acquire(timeout=110):
        raise HTTPException(503, 'Worker busy. Retry shortly.', headers={'Retry-After': '5'})
    try:
        # Preserve the original sentiment input's 512-character cutoff.
        sentiments = models['sentiment']([t[:512] for t in request.texts],
                                          batch_size=8, truncation=True, max_length=512)
        vectors = models['embedding'].encode(request.texts, batch_size=8).tolist()
        return {'sentiments': sentiments, 'embeddings': vectors}
    finally:
        lock.release()
