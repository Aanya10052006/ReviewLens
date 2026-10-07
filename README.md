# 🔍 ReviewLens

### AI-Powered E-Commerce Review Analysis Chrome Extension

ReviewLens is an AI-powered Chrome extension that analyzes customer reviews on e-commerce websites such as Amazon and provides meaningful insights beyond traditional star ratings.

It uses NLP and semantic analysis to identify sentiment, aspects, duplicate reviews, semantically similar reviews, and rating-sentiment mismatches.

---

## 🚀 Features

### 🤖 AI Sentiment Analysis
Uses a Transformer-based NLP model to classify reviews as:

- Positive
- Negative

The system also provides a confidence score for each prediction.

### 📊 Review Insights Dashboard

ReviewLens provides an overall summary of the reviews, including:

- Total number of reviews
- Average star rating
- Number of positive reviews
- Number of negative reviews
- Overall sentiment

### 🧩 Aspect-Based Analysis

ReviewLens identifies important aspects discussed in reviews and analyzes their sentiment.

Current aspects include:

- Quality
- Comfort
- Fit
- Value
- Durability

For example:

> Quality → Positive  
> Fit → Negative  
> Value → Positive

### 🔎 Semantic Similarity Detection

ReviewLens converts reviews into vector representations using Sentence Transformers and calculates cosine similarity to identify reviews that express similar meanings.

A similarity threshold is used to flag highly similar reviews.

### 📋 Duplicate Review Detection

Exact duplicate reviews are detected using normalized text comparison.

### ⭐ Rating-Sentiment Mismatch

ReviewLens identifies cases where the written review sentiment does not match the given star rating.

For example:

> ⭐⭐⭐⭐⭐ + Negative sentiment → Possible mismatch

### 🌐 Chrome Extension

The system works directly with supported Amazon product pages and extracts customer reviews for analysis.

---

## 🧠 AI Models Used

### Sentiment Analysis

**Model:** `distilbert-base-uncased-finetuned-sst-2-english`

DistilBERT is a lightweight Transformer model used for sentiment classification.

**Input:**

```text
"This product is really comfortable and good quality."
