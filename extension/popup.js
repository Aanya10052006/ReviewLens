document.addEventListener("DOMContentLoaded", async () => {

    const status = document.getElementById("status");
    const analyzeBtn = document.getElementById("analyzeBtn");
    const reviewsContainer =
        document.getElementById("reviewsContainer");
    const summaryContainer =
    document.getElementById("summaryContainer");

    const findMatchBtn =
        document.getElementById("findMatchBtn");

    const productMatchContainer =
        document.getElementById("productMatchContainer");

    const comparisonContainer =
        document.getElementById("comparisonContainer");

    let currentTab;
    let matchedProduct = null;
    let originalProduct = null;
    let searchTabId = null;

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
        status.textContent = "Unable to detect page.";
        analyzeBtn.disabled = true;
        return;
    }

    const url = currentTab.url;

    const isAmazon =
        url.includes("amazon.in") ||
        url.includes("amazon.com");

    const isFlipkart =
        url.includes("flipkart.com");

    if (isAmazon || isFlipkart) {
        status.textContent = isAmazon
            ? "Amazon page detected ✓"
            : "Flipkart page detected ✓";

        analyzeBtn.disabled = false;
    } else {
        status.textContent =
            "Please open an Amazon or Flipkart product page.";

        analyzeBtn.disabled = true;
    }

} catch (error) {
    console.error(error);

    status.textContent = "Something went wrong.";
    analyzeBtn.disabled = true;
}



    // -----------------------------
    // Find matching product
    // -----------------------------


function waitForTabToLoad(tabId, expectedUrl = null) {
    return new Promise((resolve, reject) => {
        let finished = false;

        const timeout = setTimeout(() => {
            finish(new Error("Timed out waiting for product page."));
        }, 30000);

        function finish(error) {
            if (finished) return;
            finished = true;

            clearTimeout(timeout);
            chrome.tabs.onUpdated.removeListener(listener);

            if (error) reject(error);
            else resolve();
        }

        function checkTab() {
            chrome.tabs.get(tabId, (tab) => {
                if (chrome.runtime.lastError || !tab) return;
                if (tab.status !== "complete") return;

                if (expectedUrl) {
                    try {
                        const actual = new URL(tab.url);
                        const expected = new URL(expectedUrl);

                        if (
                            actual.hostname !== expected.hostname ||
                            actual.pathname !== expected.pathname
                        ) {
                            return;
                        }
                    } catch {
                        return;
                    }
                }

                finish();
            });
        }

        function listener(updatedTabId, changeInfo) {
            if (updatedTabId === tabId && changeInfo.status === "complete") {
                checkTab();
            }
        }

        chrome.tabs.onUpdated.addListener(listener);
        checkTab();
    });
}


    async function sendMessageWithRetry(tabId, message) {
        let lastError;

        for (let attempt = 0; attempt < 5; attempt++) {
            try {
                return await chrome.tabs.sendMessage(tabId, message);
            } catch (error) {
                lastError = error;
                await new Promise(resolve => setTimeout(resolve, 700));
            }
        }

        throw lastError || new Error("Could not contact the product page.");
    }


async function analyzeProductReviews(product, reviews) {
    const response = await fetch(
        "http://127.0.0.1:8001/analyze",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                platform: product.platform,
                product_name: product.title,
                reviews: reviews
            })
        }
    );

    if (!response.ok) {
        throw new Error(
            `AI analysis failed for ${product.platform}: ${response.status}`
        );
    }

    return await response.json();
}

function getComparisonStats(data) {
    const results = data.results || [];

    let positive = 0;
    let negative = 0;
    let ratingTotal = 0;
    let ratedCount = 0;

    results.forEach(result => {
        if (result.sentiment === "POSITIVE") positive++;
        if (result.sentiment === "NEGATIVE") negative++;

        if (result.rating !== null && result.rating !== undefined) {
            const rating = Number(result.rating);

            if (Number.isFinite(rating)) {
                ratingTotal += rating;
                ratedCount++;
            }
        }
    });

    return {
        reviewCount: results.length,
        positive,
        negative,
        averageRating: ratedCount
            ? (ratingTotal / ratedCount).toFixed(1)
            : "N/A",
        overallSentiment:
            positive > negative ? "Positive" :
            negative > positive ? "Negative" : "Mixed"
    };
}

function renderProductComparison(first, firstData, second, secondData) {
    if (!comparisonContainer) {
        throw new Error(
            "Comparison container is missing from popup.html."
        );
    }

    comparisonContainer.style.display = "block";
    comparisonContainer.replaceChildren();

    const heading = document.createElement("div");
    heading.className = "comparison-title";
    heading.textContent = "Amazon vs Flipkart — Review Comparison";
    comparisonContainer.appendChild(heading);

    const grid = document.createElement("div");
    grid.className = "comparison-grid";

    const products = [
        { product: first, data: firstData },
        { product: second, data: secondData }
    ];

    products.forEach(({ product, data }) => {
        const stats = getComparisonStats(data);

        const card = document.createElement("div");
        card.className = "comparison-card";

        const name = document.createElement("h3");
        name.textContent =
            `${product.platform === "amazon" ? "Amazon" : "Flipkart"}: ${product.title}`;
        card.appendChild(name);

        const details = [
            `Reviews analyzed: ${stats.reviewCount}`,
            `Average review rating: ${stats.averageRating} / 5`,
            `Positive reviews: ${stats.positive}`,
            `Negative reviews: ${stats.negative}`,
            `Overall sentiment: ${stats.overallSentiment}`
        ];

        details.forEach(detail => {
            const line = document.createElement("div");
            line.className = "comparison-metric";
            line.textContent = detail;
            card.appendChild(line);
        });

        grid.appendChild(card);
    });

    comparisonContainer.appendChild(grid);

    const firstStats = getComparisonStats(firstData);
    const secondStats = getComparisonStats(secondData);

    const verdict = document.createElement("p");
    verdict.className = "match-note";

    if (
        firstStats.averageRating !== "N/A" &&
        secondStats.averageRating !== "N/A"
    ) {
        const firstRating = Number(firstStats.averageRating);
        const secondRating = Number(secondStats.averageRating);

        if (firstRating > secondRating) {
            verdict.textContent =
                `${first.platform === "amazon" ? "Amazon" : "Flipkart"} ` +
                `has the higher average rating ` +
                `(${firstStats.averageRating}/5 vs ` +
                `${secondStats.averageRating}/5).`;
        } else if (secondRating > firstRating) {
            verdict.textContent =
                `The ${second.platform === "amazon" ? "Amazon" : "Flipkart"} listing has the higher average rating in the reviews analyzed.`;
        } else {
            verdict.textContent =
                "Both listings have the same average rating in the reviews analyzed.";
        }
    } else {
        verdict.textContent =
            "There were not enough rating values to compare average ratings reliably.";
    }

    comparisonContainer.appendChild(verdict);
    comparisonContainer.style.display = "block";
    comparisonContainer.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}


    findMatchBtn.addEventListener("click", async () => {
        findMatchBtn.disabled = true;
        productMatchContainer.innerHTML = "";
        comparisonContainer.innerHTML = "";
        matchedProduct = null;

        try {
            status.textContent = "Reading current product details...";

            const detailsResponse = await sendMessageWithRetry(
                currentTab.id,
                { action: "extractProductDetails" }
            );

            originalProduct = detailsResponse?.product;

            if (
                !detailsResponse?.success ||
                !originalProduct?.title ||
                !["amazon", "flipkart"].includes(originalProduct.platform)
            ) {
                throw new Error("Could not identify the current product.");
            }

            const oppositePlatform =
                originalProduct.platform === "amazon"
                    ? "flipkart"
                    : "amazon";

            const searchUrl =
                oppositePlatform === "flipkart"
                    ? `https://www.flipkart.com/search?q=${encodeURIComponent(originalProduct.title)}`
                    : `https://www.amazon.in/s?k=${encodeURIComponent(originalProduct.title)}`;

            status.textContent =
                `Searching ${oppositePlatform === "amazon" ? "Amazon" : "Flipkart"} for this product...`;

            // Open search results in a background tab.
            const searchTab = await chrome.tabs.create({
                url: searchUrl,
                active: false
            });

            searchTabId = searchTab.id;

            await waitForTabToLoad(searchTabId);
            // Ask content.js to extract products from search results.
            const candidateResponse = await sendMessageWithRetry(
                searchTabId,
                { action: "extractProductCandidates" }
            );

            const candidates = (candidateResponse?.candidates || [])
                .filter(product =>
                    product.title &&
                    product.url &&
                    product.platform === oppositePlatform
                );

            if (candidates.length === 0) {
                productMatchContainer.textContent =
                    "No product suggestions were found. Try searching the other marketplace manually.";
                status.textContent = "No matching products found.";
                return;
            }

            const heading = document.createElement("div");
            heading.className = "match-title";
            heading.textContent = "Confirm the matching product";

            productMatchContainer.appendChild(heading);

            const explanation = document.createElement("p");
            explanation.className = "match-note";
            explanation.textContent =
                "Choose the same product, checking its model, size, storage, or variant before confirming.";
            productMatchContainer.appendChild(explanation);

            candidates.forEach((product, index) => {
                const card = document.createElement("div");
                card.className = "product-match-card";

                if (product.image) {
                    const image = document.createElement("img");
                    image.src = product.image;
                    image.alt = product.title;
                    card.appendChild(image);
                }

                const title = document.createElement("div");
                title.className = "product-match-name";
                title.textContent = product.title;
                card.appendChild(title);

                const price = document.createElement("div");
                price.className = "product-match-price";
                price.textContent = product.price || "Price unavailable";
                card.appendChild(price);

                const openLink = document.createElement("a");
                openLink.href = product.url;
                openLink.target = "_blank";
                openLink.rel = "noopener noreferrer";
                openLink.textContent = "View product listing";
                card.appendChild(openLink);

                const actions = document.createElement("div");
                actions.className = "match-actions";

                const confirmBtn = document.createElement("button");
                confirmBtn.className = "match-btn confirm-match-btn";
                confirmBtn.textContent = "Confirm match";


confirmBtn.addEventListener("click", async () => {
    if (!originalProduct || !product || !searchTabId) {
        status.textContent = "Product information is missing.";
        return;
    }

    confirmBtn.disabled = true;
    status.textContent = "Extracting reviews from both products...";

    try {
        matchedProduct = product;

        // Extract reviews from the original product first.
        const originalResponse = await sendMessageWithRetry(
            currentTab.id,
            { action: "extractReviews" }
        );

        const originalReviews = originalResponse?.reviews || [];

        if (originalReviews.length === 0) {
            throw new Error(
                "No reviews found on the original product page."
            );
        }

        // Navigate the background search tab to the confirmed listing.

 // Validate the selected listing before navigating.
if (
    !matchedProduct ||
    !matchedProduct.url ||
    !/^https:\/\/(www\.)?(amazon\.(in|com)|flipkart\.com)\//i.test(
        matchedProduct.url
    )
) {
    throw new Error("The selected product URL is invalid.");
}

// Open the selected product in the background tab.
await chrome.tabs.update(searchTabId, {
    url: matchedProduct.url,
    active: false
});

// Wait for the selected product page to load.
await waitForTabToLoad(searchTabId, matchedProduct.url);

// Extract reviews from the selected product.
const matchedResponse = await sendMessageWithRetry(
    searchTabId,
    { action: "extractReviews" }
);

const matchedReviews = matchedResponse?.reviews || [];

if (matchedReviews.length === 0) {
    throw new Error(
        "No reviews found on the matching product page. " +
        "Check whether the listing has reviews and is fully loaded."
    );
}

        status.textContent = "Analyzing reviews with AI...";

        // Analyze each product independently.
        const [originalData, matchedData] = await Promise.all([
            analyzeProductReviews(originalProduct, originalReviews),
            analyzeProductReviews(matchedProduct, matchedReviews)
        ]);

        // Display the comparison.
        renderProductComparison(
            originalProduct,
            originalData,
            matchedProduct,
            matchedData
        );

        if (!comparisonContainer || comparisonContainer.children.length === 0) {
            throw new Error(
                "Analysis finished, but the comparison could not be displayed."
            );
        }

        status.textContent = "Product comparison complete ✓";
        confirmBtn.textContent = "Comparison complete ✓";


    } catch (error) {
        console.error("ReviewLens comparison error:", error);

        const errorMessage = error?.message || String(error);

        status.textContent = `Comparison failed: ${errorMessage}`;

        comparisonContainer.textContent =
            `Error details: ${errorMessage}`;

        confirmBtn.disabled = false;
    }
    });


                const rejectBtn = document.createElement("button");
                rejectBtn.className = "match-btn reject-match-btn";
                rejectBtn.textContent = "Not this one";

                rejectBtn.addEventListener("click", () => {
                    card.style.display = "none";
                });

                actions.appendChild(confirmBtn);
                actions.appendChild(rejectBtn);
                card.appendChild(actions);

                productMatchContainer.appendChild(card);
            });

            status.textContent =
                `Found ${candidates.length} product suggestions. Confirm the correct match.`;


        } catch (error) {
            console.error("ReviewLens matching error:", error);

            status.textContent = "Product search failed.";

            productMatchContainer.textContent =
                `Search error: ${error?.message || String(error)}`;
        }

    });



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
                    platform: currentTab.url.includes("flipkart.com")
                        ? "flipkart"
                        : "amazon",
                    product_name: currentTab.title || "Product",
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


            if (!data || !Array.isArray(data.results)) {
                throw new Error(
                    "The backend returned an invalid analysis response."
                );
            }

            data.aspect_sentiments =
                data.aspect_sentiments || {};

            data.results = data.results.map(result => ({
                ...result,
                aspects: Array.isArray(result.aspects)
                    ? result.aspects
                    : [],
                confidence: Number(result.confidence) || 0,
                similarity: Number(result.similarity) || 0
            }));


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