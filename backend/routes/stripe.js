const Stripe = require("stripe");
const express = require("express");
const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const dbClient = require("../config/database");
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET;

router.post("/create-checkout-session", async (req, res) => {
  try {
    // Auth - same pattern as createPost
    const token = req.cookies.session;
    if (!token) return res.status(401).json({ error: "Not authenticated" });

    const decoded = jwt.verify(token, JWT_SECRET);
    const googleId = decoded.sub;

    const userResult = await dbClient.query(
      `SELECT id FROM users WHERE google_id = $1`,
      [googleId],
    );
    if (userResult.rows.length === 0)
      return res.status(401).json({ error: "User not found" });

    const userId = userResult.rows[0].id;

    const { message, link, size, position_x, position_y, color, expiration } =
      req.body;

    const priceLookup = {
      S: "price_1SyzC3F6rYe2uhLgPj9YwxYD",
      M: "price_1SyzCVF6rYe2uhLgGfylmHDb",
      L: "price_1SyzCiF6rYe2uhLgOocGxuab",
    };

    const priceId = priceLookup[size];
    if (!priceId) return res.status(400).json({ error: "Invalid size" });

    // Insert into unverified_posts
    const result = await dbClient.query(
      `INSERT INTO unverified_posts 
        (author, message, link, size, exp, color, position_x, position_y)
       VALUES ($1, $2, $3, $4, NOW() + $5::INTERVAL, $6, $7, $8)
       RETURNING id`,
      [
        userId,
        message?.trim() || null,
        link ?? null,
        size,
        expiration,
        color,
        position_x,
        position_y,
      ],
    );

    const unverifiedPostId = result.rows[0].id;

    // Pass only the id through Stripe
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.CLIENT_URL}/success`,
      cancel_url: `${process.env.CLIENT_URL}/cancel`,
      metadata: {
        unverified_post_id: unverifiedPostId,
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Invalid or expired session" });
    }
    console.error("Checkout error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
