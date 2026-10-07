console.log("ReviewLens content script loaded!");

function extractReviews() {

    const reviews = [];

    const reviewElements =
        document.querySelectorAll('[data-hook="review"]');

    console.log(
        "Review elements found:",
        reviewElements.length
    );

    reviewElements.forEach((review, index) => {

        // Extract review text
        const reviewTextElement =
            review.querySelector(
                '[data-hook="reviewRichContentContainer"] span'
            );

        // Extract star rating
        const ratingElement =
            review.querySelector(
                '[data-hook="review-star-rating"]'
            );

        let text = "";
        let rating = null;

        if (reviewTextElement) {
            text = reviewTextElement.innerText.trim();
        }

        if (ratingElement) {

            const ratingText =
                ratingElement.innerText.trim();

            const match =
                ratingText.match(/([0-9.]+)\s+out of/);

            if (match) {
                rating = parseFloat(match[1]);
            }
        }

        if (text) {

            reviews.push({
                text: text,
                rating: rating
            });

            console.log(
                `Review ${index + 1}:`,
                text,
                "Rating:",
                rating
            );
        }
    });

    console.log(
        "Final extracted reviews:",
        reviews
    );

    return reviews;
}


chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) => {

        if (message.action === "extractReviews") {

            const reviews = extractReviews();

            sendResponse({
                success: true,
                reviews: reviews
            });
        }

        return true;
    }
);