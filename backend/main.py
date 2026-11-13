from fastapi import FastAPI
from pydantic import BaseModel
from inference_client import infer, max_similarities
from pydantic import Field
from fastapi.middleware.cors import CORSMiddleware

ASPECT_KEYWORDS = {
    "Quality": [
        "quality", "fabric", "material", "cloth"
    ],
    "Comfort": [
        "comfortable", "comfort", "soft", "lightweight", "stretchable"
    ],
    "Fit": [
        "fit", "size", "tight", "loose", "short", "long"
    ],
    "Value": [
        "price", "worth", "value", "expensive", "cheap"
    ],
    "Durability": [
        "durable", "lasting", "strong", "weak", "tear"
    ]
}


app = FastAPI(title="ReviewLens AI Backend")


# Allow the Chrome Extension to communicate with the backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8000",
        "http://127.0.0.1:8000"
    ],
    allow_origin_regex=r"chrome-extension://.*",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Review(BaseModel):
    text: str = Field(min_length=1, max_length=10000)
    rating: float | None = None


class ReviewRequest(BaseModel):
    platform: str = "amazon"
    product_name: str | None = None
    product_id: str | None = None
    reviews: list[Review] = Field(max_length=100)

def detect_aspects(review):
    review_lower = review.lower()

    detected_aspects = []

    for aspect, keywords in ASPECT_KEYWORDS.items():

        for keyword in keywords:

            if keyword in review_lower:
                detected_aspects.append(aspect)
                break

    return detected_aspects


@app.get("/")
def root():
    return {
        "message": "ReviewLens AI Backend is running"
    }

def normalize_review(text):
    return " ".join(text.lower().split())


@app.post("/analyze")
def analyze_reviews(request: ReviewRequest):

    seen_reviews = set()
    results = []

    review_texts = [
        review.text for review in request.reviews
    ]

    aspect_sentiments = {}

    predictions, embeddings = infer(review_texts) if review_texts else ([], [])
    similarities = max_similarities(embeddings)

    for current_index, review in enumerate(request.reviews):

        text = review.text

        max_similarity = similarities[current_index]

        is_similar = max_similarity >= 0.80

        normalized_text = normalize_review(text)

        is_duplicate = normalized_text in seen_reviews

        seen_reviews.add(normalized_text)

        result = predictions[current_index]

        aspects = detect_aspects(text)

        sentiment = result["label"]

        for aspect in aspects:

            if aspect not in aspect_sentiments:
                aspect_sentiments[aspect] = {
                    "positive": 0,
                    "negative": 0
                }

            if sentiment == "POSITIVE":
                aspect_sentiments[aspect]["positive"] += 1
            else:
                aspect_sentiments[aspect]["negative"] += 1

        mismatch = False

        if review.rating is not None:

            if review.rating >= 4 and sentiment == "NEGATIVE":
                mismatch = True

            elif review.rating <= 2 and sentiment == "POSITIVE":
                mismatch = True


        results.append({
            "review": text,
            "rating": review.rating,
            "sentiment": sentiment,
            "confidence": round(result["score"], 4),
            "aspects": aspects,
            "mismatch": mismatch,
            "is_duplicate": is_duplicate,
            "similarity": float(round(max_similarity, 4)),
            "is_similar": is_similar
        })

    return {
    "platform": request.platform,
    "product_name": request.product_name,
    "product_id": request.product_id,
    "total_reviews": len(results),
    "results": results,
    "aspect_sentiments": aspect_sentiments
}

@app.get("/health")
def health():
    return {"status": "ok", "inference": "external"}
