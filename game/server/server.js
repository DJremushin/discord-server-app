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
const DISCORD_API = "https://discord.com/api/v10";

app.set("trust proxy", 1);

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true
  })
);

app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || "change-this-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: IS_PRODUCTION,
      sameSite: IS_PRODUCTION ? "none" : "lax"
    }
  })
);

function buildAvatarUrl(user) {
  if (user.avatar) {
    const isAnimated = String(user.avatar).startsWith("a_");
    const format = isAnimated ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${format}`;
  }

  const defaultAvatarIndex = Number(BigInt(user.id) % 5n);
  return `https://cdn.discordapp.com/embed/avatars/${defaultAvatarIndex}.png`;
}

async function refreshDiscordToken(refreshToken) {
  const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  });

  const tokenData = await tokenRes.json();

  if (!tokenRes.ok) {
    throw new Error(`Token refresh failed: ${JSON.stringify(tokenData)}`);
  }

  return tokenData;
}

async function ensureValidAccessToken(req) {
  if (!req.session.discord) {
    throw new Error("No Discord session");
  }

  const now = Date.now();
  const expiresAt = req.session.discord.expires_at || 0;

  if (req.session.discord.access_token && now < expiresAt - 60 * 1000) {
    return req.session.discord.access_token;
  }

  if (!req.session.discord.refresh_token) {
    throw new Error("No refresh token");
  }

  const refreshed = await refreshDiscordToken(req.session.discord.refresh_token);

  req.session.discord.access_token = refreshed.access_token;
  req.session.discord.refresh_token =
    refreshed.refresh_token || req.session.discord.refresh_token;
  req.session.discord.expires_at =
    Date.now() + (Number(refreshed.expires_in || 0) * 1000);

  return req.session.discord.access_token;
}

async function fetchDiscordUser(accessToken) {
  const userRes = await fetch(`${DISCORD_API}/users/@me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  const userData = await userRes.json();

  if (!userRes.ok) {
    throw new Error(`Failed to fetch user: ${JSON.stringify(userData)}`);
  }

  return userData;
}

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

    const userData = await fetchDiscordUser(tokenData.access_token);

    req.session.discord = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: Date.now() + (Number(tokenData.expires_in || 0) * 1000)
    };

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

app.get("/api/me", async (req, res) => {
  if (!req.session.user || !req.session.discord) {
    return res.status(401).json({ loggedIn: false });
  }

  try {
    const accessToken = await ensureValidAccessToken(req);
    const freshUser = await fetchDiscordUser(accessToken);

    req.session.user = {
      id: freshUser.id,
      username: freshUser.username,
      global_name: freshUser.global_name,
      avatar: freshUser.avatar,
      email: freshUser.email || null
    };

    const avatarUrl = buildAvatarUrl(req.session.user);

    return res.json({
      loggedIn: true,
      user: {
        ...req.session.user,
        avatarUrl
      }
    });
  } catch (error) {
    console.error("/api/me failed:", error);

    return res.status(401).json({
      loggedIn: false,
      error: "Failed to refresh Discord user"
    });
  }
});

app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});