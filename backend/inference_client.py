"""Lightweight Render client. No ML packages are imported in this process."""
import math
import os
import httpx
from fastapi import HTTPException


def max_similarities(vectors):
    norms = [math.sqrt(sum(x*x for x in v)) for v in vectors]
    result = [0.0] * len(vectors)
    for i in range(len(vectors)):
        for j in range(i):
            denominator = norms[i] * norms[j]
            similarity = sum(a*b for a, b in zip(vectors[i], vectors[j])) / denominator if denominator else 0
            similarity = max(-1.0, min(1.0, similarity))
            result[i] = max(result[i], similarity)
            result[j] = max(result[j], similarity)
    return result


def infer(texts):
    url = os.getenv('INFERENCE_URL', '').rstrip('/')
    key = os.getenv('INFERENCE_API_KEY', '')
    if not url or not key:
        raise HTTPException(503, 'Inference worker is not configured.')
    try:
        response = httpx.post(url + '/infer', json={'texts': texts},
                              headers={'Authorization': 'Bearer ' + key},
                              timeout=httpx.Timeout(120, connect=10), follow_redirects=False)
        response.raise_for_status()
        data = response.json()
        predictions, embeddings = data['sentiments'], data['embeddings']
        if len(predictions) != len(texts) or len(embeddings) != len(texts):
            raise ValueError('Incorrect result count')
        for item in predictions:
            if item['label'] not in ('POSITIVE', 'NEGATIVE') or not 0 <= item['score'] <= 1:
                raise ValueError('Invalid sentiment')
        for vector in embeddings:
            if len(vector) != 384 or not all(isinstance(x, (float, int)) and math.isfinite(x) for x in vector):
                raise ValueError('Invalid embedding')
        return predictions, embeddings
    except httpx.TimeoutException as exc:
        raise HTTPException(504, 'Inference timed out. Wake the worker and retry.') from exc
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        import logging

        logger = logging.getLogger("uvicorn.error")

        if isinstance(exc, httpx.HTTPStatusError):
            logger.error(
                "Inference worker returned HTTP %s",
                exc.response.status_code
            )
        else:
            logger.error(
                "Inference failure: %s",
                type(exc).__name__
            )

        raise HTTPException(
            503,
            "Inference worker unavailable or returned invalid data. Retry shortly."
        ) from exc
