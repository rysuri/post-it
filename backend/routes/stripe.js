const Stripe = require("stripe");
const express = require("express");
const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

router.post("/create-checkout-session", async (req, res) => {
  const { message, link, size, position_x, position_y, color, expiration } =
    req.body;

  const priceLookup = {
    S: "price_1SyzC3F6rYe2uhLgPj9YwxYD",
    M: "price_1SyzCVF6rYe2uhLgGfylmHDb",
    L: "price_1SyzCiF6rYe2uhLgOocGxuab",
  };

  const priceId = priceLookup[size];
  if (!priceId) return res.status(400).json({ error: "Invalid size" });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.CLIENT_URL}/success`,
      cancel_url: `${process.env.CLIENT_URL}/cancel`,
      metadata: {
        message,
        link: link ?? "",
        size: String(size),
        position_x: String(position_x),
        position_y: String(position_y),
        color,
        expiration,
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Stripe error:", err.message);
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
