import express from "express";
import session from "express-session";
import fetch from "node-fetch";
import dotenv from "dotenv";
import crypto from "crypto";
import cors from "cors";

dotenv.config();

const app = express();

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5500";
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

app.set("trust proxy", 1);

app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));

app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || "change-this-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: IS_PRODUCTION ? "none" : "lax"
  }
}));

const DISCORD_API = "https://discord.com/api/v10";

app.get("/", (req, res) => {
  res.send("API is running");
});

app.get("/auth/discord", (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  req.session.discord_oauth_state = state;

  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: process.env.DISCORD_REDIRECT_URI,
    response_type: "code",
    scope: "identify email",
    state,
    prompt: "consent"
  });

  res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
});

app.get("/auth/discord/callback", async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state || state !== req.session.discord_oauth_state) {
    return res.status(400).send("OAuth state mismatch");
  }

  try {
    const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code: String(code),
        redirect_uri: process.env.DISCORD_REDIRECT_URI
      })
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      console.error("Token exchange failed:", tokenData);
      return res.status(400).send("Token exchange failed");
    }

    const userRes = await fetch(`${DISCORD_API}/users/@me`, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`
      }
    });

    const userData = await userRes.json();

    if (!userRes.ok) {
      console.error("Failed to fetch user:", userData);
      return res.status(400).send("Failed to fetch user");
    }

    req.session.user = {
      id: userData.id,
      username: userData.username,
      global_name: userData.global_name,
      avatar: userData.avatar,
      email: userData.email || null
    };

    req.session.save((err) => {
      if (err) {
        console.error("session save error:", err);
        return res.status(500).send("Session save failed");
      }

      res.redirect(`${FRONTEND_URL}/`);
    });
  } catch (error) {
    console.error("Discord login failed:", error);
    res.status(500).send("Discord login failed");
  }
});

app.get("/api/me", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ loggedIn: false });
  }

  const user = req.session.user;

  const avatarUrl = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
    : "https://cdn.discordapp.com/embed/avatars/0.png";

  return res.json({
    loggedIn: true,
    user: {
      ...user,
      avatarUrl
    }
  });
});

app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});