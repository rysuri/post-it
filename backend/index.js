require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const nodemailer = require("nodemailer");
const authRoutes = require("./routes/auth");
const dataRoutes = require("./routes/data");
const stripeRoutes = require("./routes/stripe");
const dbClient = require("./config/database");
const app = express();

app.use(cookieParser());

const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((url) => url.trim().replace(/\/$/, ""));

// Add localhost variants if not in production
if (process.env.NODE_ENV !== "production") {
  const localhostOrigins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
  ];

  localhostOrigins.forEach((origin) => {
    if (!allowedOrigins.includes(origin)) {
      allowedOrigins.push(origin);
    }
  });
}

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      console.error("❌ Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const { unverified_post_id } = session.metadata;

      console.log("✅ Payment received!");
      console.log("Session ID:", session.id);
      console.log("Customer email:", session.customer_details?.email);
      console.log(
        "Amount total:",
        session.amount_total / 100,
        session.currency?.toUpperCase(),
      );
      console.log("Unverified Post ID:", unverified_post_id);

      if (!unverified_post_id) {
        console.error("❌ No unverified_post_id in metadata");
        return res.json({ received: true });
      }

      try {
        await dbClient.query("BEGIN");

        // Fetch the unverified post
        const { rows } = await dbClient.query(
          `SELECT * FROM unverified_posts WHERE id = $1`,
          [unverified_post_id],
        );

        if (rows.length === 0) {
          await dbClient.query("ROLLBACK");
          console.error("❌ Unverified post not found:", unverified_post_id);
          return res.json({ received: true });
        }

        const post = rows[0];
        console.log(
          "post protected value:",
          post["protected"],
          typeof post["protected"],
        );
        console.log("post keys:", Object.keys(post));

        // Insert into posts
        await dbClient.query(
          `INSERT INTO posts 
            (author, message, drawing, link, size, exp, color, position_x, position_y, "protected")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            post.author,
            post.message,
            post.drawing,
            post.link,
            post.size,
            post.exp,
            post.color,
            post.position_x,
            post.position_y,
            post["protected"],
          ],
        );

        // Increment posts_made on the user
        await dbClient.query(
          `UPDATE users SET posts_made = posts_made + 1 WHERE id = $1`,
          [post.author],
        );

        // Delete from unverified_posts
        await dbClient.query(`DELETE FROM unverified_posts WHERE id = $1`, [
          unverified_post_id,
        ]);

        await dbClient.query("COMMIT");
        console.log(
          "✅ Post promoted from unverified_posts to posts:",
          unverified_post_id,
        );
      } catch (err) {
        await dbClient.query("ROLLBACK");
        console.error("❌ Failed to promote post:", err.message);
      }
    }

    res.json({ received: true });
  },
);
app.use(express.json());

// Routes
app.use("/auth", authRoutes);
app.use("/data", dataRoutes);
app.use("/stripe", stripeRoutes);

app.post("/contact", async (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ error: "All fields required." });
  }

  try {
    const { address } = await require("dns").promises.lookup("smtp.gmail.com", {
      family: 4,
    });

    const transporter = nodemailer.createTransport({
      host: address,
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      tls: {
        servername: "smtp.gmail.com",
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      replyTo: email,
      subject: `New message from ${name}`,
      html: `<p><strong>From:</strong> ${name} (${email})</p><p>${message}</p>`,
    });

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to send message." });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
