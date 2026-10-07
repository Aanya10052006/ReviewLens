document.addEventListener("DOMContentLoaded", async () => {

    const status = document.getElementById("status");
    const analyzeBtn = document.getElementById("analyzeBtn");
    const reviewsContainer =
        document.getElementById("reviewsContainer");
    const summaryContainer =
        document.getElementById("summaryContainer");

    let currentTab;

    // -----------------------------
    // Check current page
    // -----------------------------

    try {

        const tabs = await chrome.tabs.query({
            active: true,
            currentWindow: true
        });

        currentTab = tabs[0];

        if (!currentTab || !currentTab.url) {

            status.textContent =
                "Unable to detect page.";

            analyzeBtn.disabled = true;

            return;
        }

        const url = currentTab.url;

        if (
            url.includes("amazon.in") ||
            url.includes("amazon.com")
        ) {

            status.textContent =
                "Amazon page detected ✓";

            analyzeBtn.disabled = false;

        } else {

            status.textContent =
                "Please open an Amazon product page.";

            analyzeBtn.disabled = true;
        }

    } catch (error) {

        console.error(error);

        status.textContent =
            "Something went wrong.";

        analyzeBtn.disabled = true;
    }


    // -----------------------------
    // Analyze Reviews button
    // -----------------------------

    analyzeBtn.addEventListener("click", async () => {

        status.textContent =
            "Extracting reviews...";

        reviewsContainer.innerHTML = "";
        summaryContainer.innerHTML = "";

        try {

            // -----------------------------
            // Get reviews from content.js
            // -----------------------------

            const response = await chrome.tabs.sendMessage(
                currentTab.id,
                {
                    action: "extractReviews"
                }
            );

            const reviews = response.reviews;

            console.log(
                "ReviewLens extracted reviews:",
                reviews
            );

            // -----------------------------
            // Check if reviews were found
            // -----------------------------

            if (!reviews || reviews.length === 0) {

                status.textContent =
                    "No reviews found on this page.";

                return;
            }

            status.textContent =
                `Found ${reviews.length} reviews. Analyzing with AI...`;


            // -----------------------------
            // Send reviews to FastAPI
            // -----------------------------

            const apiResponse = await fetch(
                "http://127.0.0.1:8001/analyze",
                {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json"
                    },

                    body: JSON.stringify({
                        reviews: reviews
                    })
                }
            );


            // -----------------------------
            // Check backend response
            // -----------------------------

            if (!apiResponse.ok) {

                throw new Error(
                    `Backend error: ${apiResponse.status}`
                );
            }


            // Convert backend response to JSON

            const data = await apiResponse.json();

            console.log(
                "AI Results:",
                data
            );


            // -----------------------------
            // Analysis complete
            // -----------------------------

            status.textContent =
                "AI analysis complete";


            // -----------------------------
            // Count sentiment
            // -----------------------------

            let positive = 0;
            let negative = 0;

            data.results.forEach((result) => {

                if (result.sentiment === "POSITIVE") {

                    positive++;

                } else if (result.sentiment === "NEGATIVE") {

                    negative++;
                }

            });

            // Count detected aspects
            const aspectCounts = {};

            data.results.forEach((result) => {
                result.aspects.forEach((aspect) => {

                    if (!aspectCounts[aspect]) {
                        aspectCounts[aspect] = 0;
                    }

                    aspectCounts[aspect]++;
                });
            });

            const total = positive + negative;


// -----------------------------
// Calculate dashboard insights
// -----------------------------

let totalRating = 0;
let ratedReviews = 0;

data.results.forEach((result) => {

    if (result.rating !== null && result.rating !== undefined) {
        totalRating += result.rating;
        ratedReviews++;
    }

});

const averageRating =
    ratedReviews > 0
        ? (totalRating / ratedReviews).toFixed(1)
        : "N/A";

let overallSentiment = "Mixed";

if (positive > negative) {
    overallSentiment = "Positive";
} else if (negative > positive) {
    overallSentiment = "Negative";
}


// -----------------------------
// Build aspect analysis
// -----------------------------

let aspectHTML = "";

Object.entries(data.aspect_sentiments).forEach(
    ([aspect, sentimentData]) => {

        const positive = sentimentData.positive;
        const negative = sentimentData.negative;

        let sentiment = "Mixed";
        let emoji = "😐";

        if (positive > negative) {
            sentiment = "Positive";
            emoji = "😊";
        } else if (negative > positive) {
            sentiment = "Negative";
            emoji = "😞";
        }

        const totalAspectReviews = positive + negative;

        aspectHTML += `
            <div class="aspect-item">
                <span>${aspect}</span>
                <span>
                    ${emoji} ${sentiment}
                    (${totalAspectReviews})
                </span>
            </div>
        `;
    }
);


// -----------------------------
// Display ReviewLens dashboard
// -----------------------------

summaryContainer.innerHTML = `

    <div class="dashboard-title">
        ReviewLens Insights
    </div>

    <div class="dashboard-grid">

        <div class="dashboard-card">
            <div class="dashboard-icon">📊</div>
            <div class="dashboard-value">${total}</div>
            <div class="dashboard-label">Reviews</div>
        </div>

        <div class="dashboard-card">
            <div class="dashboard-icon">⭐</div>
            <div class="dashboard-value">${averageRating}</div>
            <div class="dashboard-label">Avg Rating</div>
        </div>

        <div class="dashboard-card">
            <div class="dashboard-icon">😊</div>
            <div class="dashboard-value">${positive}</div>
            <div class="dashboard-label">Positive</div>
        </div>

        <div class="dashboard-card">
            <div class="dashboard-icon">😞</div>
            <div class="dashboard-value">${negative}</div>
            <div class="dashboard-label">Negative</div>
        </div>

    </div>

    <div class="overall-sentiment">
        <strong>Overall Sentiment:</strong>
        ${overallSentiment}
    </div>

    <div class="aspect-title">
        Aspect Analysis
    </div>

    ${aspectHTML}

`;

            // -----------------------------
            // Display individual reviews
            // -----------------------------

            reviewsContainer.innerHTML = "";

            data.results.forEach((result, index) => {

                const reviewDiv =
                    document.createElement("div");

                reviewDiv.className = "review";


                const number =
                    document.createElement("div");

                number.className =
                    "review-number";

                number.textContent =
                    `Review ${index + 1}`;


                const text =
                    document.createElement("div");

                text.textContent =
                    result.review;


                const rating =
                    document.createElement("div");

                rating.textContent =
                    `Rating: ${result.rating ?? "N/A"} / 5`;


                const sentiment =
                    document.createElement("div");

                sentiment.textContent =
                    `Sentiment: ${result.sentiment} ` +
                    `(${(result.confidence * 100).toFixed(1)}%)`;

                const mismatch =
                    document.createElement("div");

                if (result.mismatch) {
                    mismatch.textContent =
                        "⚠️ Rating and sentiment may not match";
                } else {
                    mismatch.textContent =
                        "✓ Rating and sentiment are consistent";
                }

                const duplicate =
                    document.createElement("div");

                if (result.is_duplicate) {
                    duplicate.textContent =
                        "⚠️ Duplicate review detected";
                }

                const similarity =
                    document.createElement("div");

                if (result.is_similar) {

                    similarity.textContent =
                        `⚠️ Similar review detected (${(result.similarity * 100).toFixed(1)}% similar)`;

                } else {

                    similarity.textContent =
                        `Similarity: ${(result.similarity * 100).toFixed(1)}%`;
                }

                reviewDiv.appendChild(number);

                reviewDiv.appendChild(text);

                reviewDiv.appendChild(rating);

                reviewDiv.appendChild(sentiment);

                reviewDiv.appendChild(mismatch);

                if (result.is_duplicate) {
                    reviewDiv.appendChild(duplicate);
                }

                reviewDiv.appendChild(similarity);

                reviewsContainer.appendChild(reviewDiv);

            });


        } catch (error) {

            console.error(
                "ReviewLens error:",
                error
            );

            status.textContent =
                "Error analyzing reviews.";

        }

    });

});