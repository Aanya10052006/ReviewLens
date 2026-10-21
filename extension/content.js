
console.log("ReviewLens content script loaded!");

function extractReviews() {
    const reviews = [];
    const hostname = window.location.hostname;

    const isAmazon =
        hostname.includes("amazon.in") ||
        hostname.includes("amazon.com");

    const isFlipkart = hostname.includes("flipkart.com");

    let reviewElements = [];

    if (isAmazon) {
        reviewElements = [
            ...document.querySelectorAll('[data-hook="review"]')
        ];
    } else if (isFlipkart) {
        reviewElements = [
            ...document.querySelectorAll("div.css-g5y9jx")
        ].filter(review => {
            const textElement = review.querySelector("span.css-1jxf684");
            const ratingElement = review.querySelector("div.css-146c3p1");

            return Boolean(textElement && ratingElement) &&
                /^[0-5](?:\.[0-9]+)?$/.test(
                    ratingElement.innerText.trim()
                );
        });
    } else {
        console.warn("Unsupported shopping website:", hostname);
        return reviews;
    }

    console.log("Review elements found:", reviewElements.length);

    reviewElements.forEach((review, index) => {
        let text = "";
        let rating = null;

        if (isAmazon) {
            const textElement = review.querySelector(
                '[data-hook="reviewRichContentContainer"] span, [data-hook="review-body"] span'
            );

            const ratingElement = review.querySelector(
                '[data-hook="review-star-rating"], [data-hook="cmps-review-star-rating"]'
            );

            if (textElement) {
                text = textElement.innerText.trim();
            }

            if (ratingElement) {
                const match = ratingElement.innerText.match(
                    /([0-5](?:\.[0-9]+)?)\s*out of/
                );

                if (match) {
                    rating = parseFloat(match[1]);
                }
            }
        } else if (isFlipkart) {
            const textElement = review.querySelector(
                "span.css-1jxf684"
            );

            const ratingElement = review.querySelector(
                "div.css-146c3p1"
            );

            if (textElement) {
                text = textElement.innerText
                    .replace(/\s*READ MORE\s*$/i, "")
                    .trim();
            }

            if (ratingElement) {
                const match = ratingElement.innerText.trim().match(
                    /^([0-5](?:\.[0-9]+)?)$/
                );

                if (match) {
                    rating = parseFloat(match[1]);
                }
            }
        }

        if (text) {
            reviews.push({ text, rating });

            console.log(
                `Review ${index + 1}:`,
                text,
                "Rating:",
                rating
            );
        }
    });

    console.log("Final extracted reviews:", reviews);
    return reviews;
}


function extractProductDetails() {
    const hostname = window.location.hostname;

    const isAmazon =
        hostname.includes("amazon.in") ||
        hostname.includes("amazon.com");

    const isFlipkart = hostname.includes("flipkart.com");

    let title = "";
    let image = "";
    let price = "";

    if (isAmazon) {
        title =
            document.querySelector("#productTitle")
                ?.innerText.trim() || document.title;

        image =
            document.querySelector("#landingImage")
                ?.src || "";

        price =
            document.querySelector(".a-price .a-offscreen")
                ?.innerText.trim() || "";
    } else if (isFlipkart) {
        title =
            document.querySelector("span.VU-ZEz")
                ?.innerText.trim() || document.title;

        image =
            document.querySelector("img.DByuf4")
                ?.src || "";

        price =
            document.querySelector(".Nx9bqj.CxhGGd")
                ?.innerText.trim() || "";
    }

    return {
        platform: isAmazon ? "amazon" : isFlipkart ? "flipkart" : "unknown",
        title,
        image,
        price,
        url: window.location.href
    };
}


chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) => {
        if (message.action === "extractReviews") {
            sendResponse({
                success: true,
                reviews: extractReviews()
            });
        }

        if (message.action === "extractProductDetails") {
            sendResponse({
                success: true,
                product: extractProductDetails()
            });
        }

        return true;
    }
);