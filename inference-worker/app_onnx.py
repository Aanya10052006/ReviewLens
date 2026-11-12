import hmac
import os
import threading
from pathlib import Path
from contextlib import asynccontextmanager

import numpy as np
import onnxruntime as ort

from tokenizers import Tokenizer
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field


ROOT = Path(__file__).resolve().parent

MODEL_ROOT = (
    ROOT / "models-onnx"
    if (ROOT / "models-onnx").exists()
    else ROOT.parent / "models-onnx"
)

lock = threading.Lock()
models = {}


def load_model(folder, max_length):
    model_dir = MODEL_ROOT / folder

    tokenizer = Tokenizer.from_file(
        str(model_dir / "tokenizer.json")
    )
    tokenizer.enable_padding()
    tokenizer.enable_truncation(max_length=max_length)

    options = ort.SessionOptions()

    # Limit CPU threads
    options.intra_op_num_threads = 1
    options.inter_op_num_threads = 1

    # Reduce retained memory allocations
    options.enable_cpu_mem_arena = False
    options.enable_mem_pattern = False

    # Use sequential execution
    options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL

    session = ort.InferenceSession(
        str(model_dir / "model_quantized.onnx"),
        sess_options=options,
        providers=["CPUExecutionProvider"]
    )

    return tokenizer, session


@asynccontextmanager
async def lifespan(app):
    if not os.getenv("INFERENCE_API_KEY"):
        raise RuntimeError(
            "Set INFERENCE_API_KEY before starting the worker"
        )

    models["sentiment"] = load_model(
        "distilbert-int8", 512
    )
    models["embedding"] = load_model(
        "minilm-int8", 256
    )

    yield

    models.clear()


app = FastAPI(lifespan=lifespan)


class InferenceRequest(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=100)


@app.get("/health")
def health():
    if len(models) != 2:
        raise HTTPException(503, "Models not ready")

    return {"status": "ready"}


def run_onnx(tokenizer, session, texts):
    encoded = tokenizer.encode_batch(texts)

    inputs = {
        "input_ids": np.asarray(
            [e.ids for e in encoded],
            dtype=np.int64
        ),
        "attention_mask": np.asarray(
            [e.attention_mask for e in encoded],
            dtype=np.int64
        )
    }

    return session.run(
        None,
        {
            item.name: inputs[item.name]
            for item in session.get_inputs()
        }
    ), inputs


def predict_sentiment(texts):
    tokenizer, session = models["sentiment"]

    results = []

    for start in range(0, len(texts), 8):
        batch = [t[:512] for t in texts[start:start + 8]]

        outputs, _ = run_onnx(tokenizer, session, batch)
        logits = outputs[0]

        shifted = logits - logits.max(axis=1, keepdims=True)
        exp_scores = np.exp(shifted)
        probabilities = exp_scores / exp_scores.sum(
            axis=1, keepdims=True
        )

        for scores in probabilities:
            index = int(np.argmax(scores))
            results.append({
                "label": "POSITIVE" if index == 1 else "NEGATIVE",
                "score": float(scores[index])
            })

    return results


def predict_embeddings(texts):
    tokenizer, session = models["embedding"]

    vectors = []

    for start in range(0, len(texts), 8):
        batch = texts[start:start + 8]

        outputs, inputs = run_onnx(tokenizer, session, batch)

        token_embeddings = outputs[0]

        mask = inputs["attention_mask"][:, :, None]

        pooled = (
            (token_embeddings * mask).sum(axis=1)
            / np.maximum(mask.sum(axis=1), 1)
        )

        norms = np.linalg.norm(
            pooled, axis=1, keepdims=True
        )

        normalized = pooled / np.maximum(norms, 1e-12)

        vectors.extend(normalized.tolist())

    return vectors


@app.post("/infer")
def infer(
    request: InferenceRequest,
    authorization: str = Header(default="")
):
    expected = os.getenv("INFERENCE_API_KEY", "")

    if not expected or not hmac.compare_digest(
        authorization,
        "Bearer " + expected
    ):
        raise HTTPException(401, "Invalid worker credentials")

    if any(
        not t.strip() or len(t) > 10000
        for t in request.texts
    ):
        raise HTTPException(
            422,
            "Texts must contain 1 to 10000 characters"
        )

    if not lock.acquire(timeout=110):
        raise HTTPException(
            503,
            "Worker busy. Retry shortly.",
            headers={"Retry-After": "5"}
        )

    try:
        sentiments = predict_sentiment(request.texts)
        embeddings = predict_embeddings(request.texts)

        return {
            "sentiments": sentiments,
            "embeddings": embeddings
        }

    finally:
        lock.release()
