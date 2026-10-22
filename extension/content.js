
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



function extractProductCandidates() {
    const hostname = window.location.hostname;

    const isAmazon =
        hostname.includes("amazon.in") ||
        hostname.includes("amazon.com");

    const isFlipkart = hostname.includes("flipkart.com");

    const candidates = [];
    const seenUrls = new Set();

    function addCandidate(product) {
        if (!product.title || !product.url) return;

        if (seenUrls.has(product.url)) return;
        seenUrls.add(product.url);

        candidates.push(product);
    }

    // AMAZON SEARCH RESULTS
    if (isAmazon) {
        const cards = document.querySelectorAll(
            '[data-component-type="s-search-result"], [data-asin]'
        );

        cards.forEach(card => {
            const asin = card.getAttribute("data-asin");

            if (!asin || asin.length < 5) return;

            const link =
                card.querySelector('h2 a[href]') ||
                card.querySelector('a[href*="/dp/"]') ||
                card.querySelector('a[href*="/gp/product/"]');

            if (!link) return;

            const titleElement =
                card.querySelector("h2 a span") ||
                card.querySelector("h2 span") ||
                card.querySelector(".a-text-normal");

            const imageElement = card.querySelector("img");

            const priceElement =
                card.querySelector(".a-price .a-offscreen");

            const title =
                titleElement?.innerText?.trim() ||
                link.innerText?.trim() ||
                imageElement?.alt?.trim() ||
                "";

            let url;

            try {
                url = new URL(link.href, window.location.origin).href;
                const parsed = new URL(url);

                if (
                    !["www.amazon.in", "amazon.in",
                      "www.amazon.com", "amazon.com"].includes(parsed.hostname)
                ) {
                    return;
                }

                // Normalize Amazon product URLs.
                url = `${parsed.origin}/dp/${asin}`;
            } catch {
                return;
            }

            addCandidate({
                platform: "amazon",
                title,
                image: imageElement?.src || "",
                price: priceElement?.innerText?.trim() || "",
                url
            });
        });
    }

    // FLIPKART SEARCH RESULTS
    if (isFlipkart) {
        const links = document.querySelectorAll('a[href*="/p/"]');

        links.forEach(link => {
            let parsed;

            try {
                parsed = new URL(link.href, window.location.origin);

                if (parsed.hostname !== "www.flipkart.com" &&
                    parsed.hostname !== "flipkart.com") {
                    return;
                }
            } catch {
                return;
            }

            const productPath = parsed.pathname;
            const productLink = link.closest("a[href*='/p/']") || link;

            const card =
                productLink.closest('[data-id]') ||
                productLink.parentElement?.parentElement?.parentElement ||
                productLink;

            const imageElement = card.querySelector("img");

            const titleElement =
                card.querySelector("a[title]") ||
                card.querySelector("div[title]");

            const title =
                titleElement?.getAttribute("title")?.trim() ||
                productLink.getAttribute("title")?.trim() ||
                imageElement?.alt?.trim() ||
                productLink.innerText?.trim() ||
                "";

            const priceElement =
                card.querySelector('[class*="Nx9bqj"]');

            addCandidate({
                platform: "flipkart",
                title,
                image: imageElement?.src || "",
                price: priceElement?.innerText?.trim() || "",
                url: `${parsed.origin}${productPath}`
            });
        });
    }

    console.log(
        "ReviewLens candidate extraction:",
        hostname,
        "Cards found:",
        candidates.length,
        candidates
    );

    return candidates.slice(0, 15);
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

        if (message.action === "extractProductCandidates") {
            sendResponse({
                success: true,
                candidates: extractProductCandidates()
            });
        }

        return true;
    }
);