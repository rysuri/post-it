const Stripe = require("stripe");
const express = require("express");
const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const dbClient = require("../config/database");
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET;

// Half-sizes in board-space pixels, matching PostIt's Tailwind classes:
//   S → w-32 = 128px → half = 64
//   M → w-48 = 192px → half = 96
//   L → w-64 = 256px → half = 128
const HALF_SIZE = { S: 64, M: 96, L: 128 };

// Returns true if two center-based rectangles of given sizes overlap.
// All values are in board-space pixels.
function overlaps(x1, y1, size1, x2, y2, size2) {
  const h1 = HALF_SIZE[size1];
  const h2 = HALF_SIZE[size2];
  return Math.abs(x1 - x2) < h1 + h2 && Math.abs(y1 - y2) < h1 + h2;
}

// ── GET /protected-posts ────────────────────────────────────────────────────
// Returns the minimal shape of every protected post so the frontend can
// run the same overlap check before even hitting the checkout endpoint.
router.get("/protected-posts", async (req, res) => {
  try {
    const result = await dbClient.query(
      `SELECT position_x, position_y, size
       FROM posts
       WHERE protected = true`,
    );
    res.json({ posts: result.rows });
  } catch (err) {
    console.error("Protected posts fetch error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /create-checkout-session ───────────────────────────────────────────
router.post("/create-checkout-session", async (req, res) => {
  try {
    // ── Auth ────────────────────────────────────────────────────────────────
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

    const {
      message,
      drawing,
      link,
      size,
      position_x,
      position_y,
      color,
      expiration,
      protected: isProtected,
    } = req.body;

    const priceLookup = {
      S: "price_1SzmUEFIxcv5FU93X6BCMaQA",
      M: "price_1SzmUAFIxcv5FU93L9p0lJLV",
      L: "price_1SzmUDFIxcv5FU93f6LAQAvs",
    };

    const priceId = priceLookup[size];
    if (!priceId) return res.status(400).json({ error: "Invalid size" });

    if (!HALF_SIZE[size])
      return res.status(400).json({ error: "Invalid size" });

    // ── Protected-overlap check (BEFORE insert) ──────────────────────────
    // Fetch all protected posts and test each one in JS.
    // This avoids complex CASE expressions in SQL and is fast enough in
    // practice — protected posts will be a tiny fraction of the total.
    const protectedResult = await dbClient.query(
      `SELECT position_x, position_y, size
       FROM posts
       WHERE protected = true`,
    );

    const blocking = protectedResult.rows.find((p) =>
      overlaps(
        position_x,
        position_y,
        size,
        p.position_x,
        p.position_y,
        p.size,
      ),
    );

    if (blocking) {
      return res.status(409).json({
        code: "PROTECTED_OVERLAP",
        error:
          "This spot is occupied by a protected post. Please choose a different location.",
      });
    }

    // ── Insert into unverified_posts ────────────────────────────────────
    const result = await dbClient.query(
      `INSERT INTO unverified_posts
        (author, message, drawing, link, size, exp, color, position_x, position_y, protected)
       VALUES ($1, $2, $3, $4, $5, NOW() + $6::INTERVAL, $7, $8, $9, $10)
       RETURNING id`,
      [
        userId,
        message?.trim() || null,
        drawing ?? null,
        link ?? null,
        size,
        expiration,
        color,
        position_x,
        position_y,
        isProtected ?? false,
      ],
    );

    const unverifiedPostId = result.rows[0].id;

    // ── Build Stripe line items ─────────────────────────────────────────
    const lineItems = [{ price: priceId, quantity: 1 }];

    if (isProtected) {
      lineItems.push({
        price: "price_1SzmTzFIxcv5FU93i9htQkgh",
        quantity: 1,
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      success_url: `${process.env.CLIENT_URL}/`,
      cancel_url: `${process.env.CLIENT_URL}/operations`,
      allow_promotion_codes: true,
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
