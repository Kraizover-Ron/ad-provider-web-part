const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { db } = require("./firebase");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

const WINDOW_MS_DEFAULT = 10_000;
const THRESHOLD_CLICKS_DEFAULT = 20;
const ELIGIBILITY_TTL_MS = 180_000;
const COOLDOWN_MS = 180_000;

function parseEventTime(e, now) {
  if (typeof e?.at === "number") return e.at;
  if (typeof e?.ts === "number") return e.ts;
  if (typeof e?.ts === "string") {
    const t = Date.parse(e.ts);
    if (!Number.isNaN(t)) return t;
  }
  return now;
}

function requireAdmin(req, res, next) {
  const required = process.env.ADMIN_KEY;
  if (!required) return next();
  const key = req.header("X-ADMIN-KEY") || req.query.adminKey;
  if (key !== required) return res.status(401).json({ error: "unauthorized" });
  next();
}

async function resolveUserIdFromSession(sessionId) {
  const snap = await db.ref(`sessions/${sessionId}/userId`).get();
  return snap.exists() ? snap.val() : null;
}

async function getRecentClicks(userId) {
  const snap = await db.ref(`users/${userId}/recentClicks`).get();
  const val = snap.exists() ? snap.val() : [];
  return Array.isArray(val) ? val : [];
}

function computeWindowClicks(clickTimes, now, windowMs) {
  const minTs = now - windowMs;
  const filtered = clickTimes.filter((t) => typeof t === "number" && t >= minTs);
  return { filtered, count: filtered.length };
}

async function readEligibility(userId) {
  const snap = await db.ref(`users/${userId}/adEligibility`).get();
  return snap.exists() ? snap.val() : null;
}

async function writeEligibility(userId, payload) {
  await db.ref(`users/${userId}/adEligibility`).set(payload);
  return payload;
}

async function normalizeEligibility(userId, now) {
  const val = (await readEligibility(userId)) || {};
  const eligibleUntil = typeof val.eligibleUntil === "number" ? val.eligibleUntil : null;
  const cooldownUntil = typeof val.cooldownUntil === "number" ? val.cooldownUntil : null;
  let changed = false;

  if (val.eligible && eligibleUntil && now > eligibleUntil) {
    val.eligible = false;
    val.reason = "expired";
    val.eligibleUntil = null;
    val.lastUpdatedAt = now;
    changed = true;
  }

  if (cooldownUntil && now > cooldownUntil) {
    val.cooldownUntil = null;
    val.lastUpdatedAt = now;
    changed = true;
  }

  if (changed) await writeEligibility(userId, val);
  return val;
}

async function getEligibility(userId, now) {
  const val = await normalizeEligibility(userId, now);
  const eligibleUntil = typeof val.eligibleUntil === "number" ? val.eligibleUntil : null;
  const cooldownUntil = typeof val.cooldownUntil === "number" ? val.cooldownUntil : null;
  const eligible = !!val.eligible && (!eligibleUntil || now <= eligibleUntil) && (!cooldownUntil || now >= cooldownUntil);
  const inCooldown = !!cooldownUntil && now < cooldownUntil;
  return {
    eligible,
    inCooldown,
    reason: val.reason || null,
    lastUpdatedAt: typeof val.lastUpdatedAt === "number" ? val.lastUpdatedAt : null,
    eligibleUntil,
    cooldownUntil,
    earnedAt: typeof val.earnedAt === "number" ? val.earnedAt : null,
    lastServedAt: typeof val.lastServedAt === "number" ? val.lastServedAt : null
  };
}

async function setEligible(userId, reason, now) {
  const payload = {
    eligible: true,
    reason: reason || null,
    lastUpdatedAt: now,
    eligibleUntil: now + ELIGIBILITY_TTL_MS,
    cooldownUntil: null,
    earnedAt: now,
    lastServedAt: null
  };
  return writeEligibility(userId, payload);
}

async function clearEligible(userId, reason, now) {
  const prev = (await readEligibility(userId)) || {};
  const payload = {
    eligible: false,
    reason: reason || null,
    lastUpdatedAt: now,
    eligibleUntil: null,
    cooldownUntil: prev.cooldownUntil || null,
    earnedAt: prev.earnedAt || null,
    lastServedAt: prev.lastServedAt || null
  };
  return writeEligibility(userId, payload);
}

async function startCooldown(userId, reason, now) {
  const prev = (await readEligibility(userId)) || {};
  const payload = {
    eligible: false,
    reason: reason || null,
    lastUpdatedAt: now,
    eligibleUntil: null,
    cooldownUntil: now + COOLDOWN_MS,
    earnedAt: prev.earnedAt || null,
    lastServedAt: now
  };
  return writeEligibility(userId, payload);
}

app.get("/health", (req, res) => res.status(200).json({ ok: true }));

app.get("/whoami", (req, res) => {
  res.json({ server: "cookieclicker-server", version: "v1", ts: Date.now() });
});

app.post("/v1/session/start", async (req, res) => {
  try {
    const { userId, displayName, device, appVersion } = req.body || {};
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const now = Date.now();
    const sessionId = db.ref("sessions").push().key;

    const firstSeenSnap = await db.ref(`users/${userId}/firstSeenAt`).get();
    const hasFirstSeen = firstSeenSnap.exists();

    await db.ref(`users/${userId}`).update({
      userId,
      displayName: displayName || "Player",
      device: device || null,
      appVersion: appVersion || null,
      lastSeenAt: now,
      ...(hasFirstSeen ? {} : { firstSeenAt: now })
    });

    await db.ref(`sessions/${sessionId}`).set({
      sessionId,
      userId,
      startedAt: now,
      endedAt: null,
      durationMs: 0,
      clicks: 0
    });

    res.json({ sessionId, userId, startedAt: new Date(now).toISOString(), startedAtMs: now });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/v1/session/end", async (req, res) => {
  try {
    const { sessionId, durationMs, clicks } = req.body || {};
    if (!sessionId) return res.status(400).json({ error: "sessionId is required" });

    const snap = await db.ref(`sessions/${sessionId}`).get();
    if (!snap.exists()) return res.status(404).json({ error: "session not found" });

    const now = Date.now();
    const session = snap.val();
    const userId = session.userId;

    await db.ref(`sessions/${sessionId}`).update({
      endedAt: now,
      durationMs: typeof durationMs === "number" ? durationMs : session.durationMs || 0,
      clicks: typeof clicks === "number" ? clicks : session.clicks || 0
    });

    await db.ref(`users/${userId}/metrics`).update({
      lastSessionEndedAt: now,
      lastSessionDurationMs: typeof durationMs === "number" ? durationMs : session.durationMs || 0
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/v1/events/batch", async (req, res) => {
  try {
    const { sessionId, userId: userIdFromBody, events } = req.body || {};
    if (!sessionId || !Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: "sessionId and events[] are required" });
    }

    const sessionSnap = await db.ref(`sessions/${sessionId}`).get();
    if (!sessionSnap.exists()) return res.status(404).json({ error: "session not found" });

    const userId = userIdFromBody || sessionSnap.val().userId || (await resolveUserIdFromSession(sessionId));
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const now = Date.now();
    const updates = {};
    const clickTimesNew = [];

    for (const e of events) {
      const key = db.ref(`events/${sessionId}`).push().key;
      const at = parseEventTime(e, now);
      const type = e?.type || "unknown";
      const meta = e?.meta ?? e?.props ?? null;
      updates[`events/${sessionId}/${key}`] = { type, at, meta };
      if (type === "click") clickTimesNew.push(at);
    }

    const clicksAdded = clickTimesNew.length;
    if (clicksAdded > 0) {
      const prevClicks = Number(sessionSnap.val().clicks || 0);
      updates[`sessions/${sessionId}/clicks`] = prevClicks + clicksAdded;
    }

    updates[`users/${userId}/lastSeenAt`] = now;
    await db.ref().update(updates);

    const existing = await getRecentClicks(userId);
    const merged = existing.concat(clickTimesNew);
    const { filtered, count } = computeWindowClicks(merged, now, WINDOW_MS_DEFAULT);

    await db.ref(`users/${userId}/recentClicks`).set(filtered);
    await db.ref(`users/${userId}/metrics`).update({ last10sClicks: count, metricsUpdatedAt: now });

    const current = await getEligibility(userId, now);

    let eligibleNow = current.eligible;
    let eligibleUntil = current.eligibleUntil;
    let cooldownUntil = current.cooldownUntil;
    let reason = current.reason;

    if (!current.inCooldown && count >= THRESHOLD_CLICKS_DEFAULT) {
      if (!current.eligible) {
        const payload = await setEligible(userId, `threshold_${THRESHOLD_CLICKS_DEFAULT}_in_${WINDOW_MS_DEFAULT}ms`, now);
        eligibleNow = true;
        eligibleUntil = payload.eligibleUntil;
        cooldownUntil = payload.cooldownUntil;
        reason = payload.reason;
      }
    }

    res.json({
      ok: true,
      received: events.length,
      clicksAdded,
      last10sClicks: count,
      eligible: eligibleNow,
      eligibleUntil,
      cooldownUntil,
      reason: reason || null,
      serverTime: now
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/v1/engagement/evaluate", async (req, res) => {
  try {
    const { sessionId, userId: userIdFromBody, windowMs, thresholdClicks } = req.body || {};
    if (!sessionId && !userIdFromBody) return res.status(400).json({ error: "sessionId or userId is required" });

    const userId = userIdFromBody || (sessionId ? await resolveUserIdFromSession(sessionId) : null);
    if (!userId) return res.status(400).json({ error: "userId could not be resolved" });

    const now = Date.now();
    const wm = typeof windowMs === "number" ? windowMs : WINDOW_MS_DEFAULT;
    const thr = typeof thresholdClicks === "number" ? thresholdClicks : THRESHOLD_CLICKS_DEFAULT;

    const existing = await getRecentClicks(userId);
    const { filtered, count } = computeWindowClicks(existing, now, wm);
    await db.ref(`users/${userId}/recentClicks`).set(filtered);

    const current = await getEligibility(userId, now);
    if (current.inCooldown) {
      return res.json({ eligible: false, reason: "cooldown", eligibleUntil: null, cooldownUntil: current.cooldownUntil, score: count, serverTime: now });
    }

    const eligible = count >= thr;
    const reason = eligible ? `threshold_${thr}_in_${wm}ms` : `below_threshold_${thr}_in_${wm}ms`;

    let eligibleUntil = null;
    let cooldownUntil = current.cooldownUntil;

    if (eligible) {
      if (current.eligible) {
        eligibleUntil = current.eligibleUntil;
      } else {
        const payload = await setEligible(userId, reason, now);
        eligibleUntil = payload.eligibleUntil;
        cooldownUntil = payload.cooldownUntil;
      }
    } else if (current.eligible) {
      await clearEligible(userId, reason, now);
    }

    res.json({ eligible, reason, eligibleUntil, cooldownUntil, score: count, serverTime: now });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get(["/v1/ad/eligibility", "/v1/engagement/status"], async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId is required" });
    const now = Date.now();
    const st = await getEligibility(String(userId), now);
    res.json({
      userId: String(userId),
      eligible: st.eligible,
      reason: st.reason,
      lastUpdatedAt: st.lastUpdatedAt,
      eligibleUntil: st.eligibleUntil,
      cooldownUntil: st.cooldownUntil,
      serverTime: now
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/v1/ads/next", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const now = Date.now();
    const st = await getEligibility(String(userId), now);
    if (!st.eligible) return res.status(204).send();

    const ad = {
      adId: "demo-ad-1",
      title: "Demo Ad",
      imageUrl: "https://via.placeholder.com/600x200?text=Demo+Ad",
      clickUrl: "https://example.com",
      eligibleUntil: st.eligibleUntil,
      cooldownUntil: now + COOLDOWN_MS,
      serverTime: now
    };

    const earnedAt = st.earnedAt;
    const delayMs = typeof earnedAt === "number" ? Math.max(0, now - earnedAt) : null;

    const adKey = db.ref("adServes").push().key;
    const userRef = db.ref(`users/${userId}`);
    const countSnap = await userRef.child("adServedCount").get();
    const prevCount = countSnap.exists() ? Number(countSnap.val() || 0) : 0;

    await Promise.all([
      startCooldown(String(userId), "served", now),
      db.ref(`users/${userId}/recentClicks`).set(null),
      userRef.update({ lastAdServedAt: now, lastAdId: ad.adId, adServedCount: prevCount + 1 }),
      db.ref(`adServes/${adKey}`).set({ at: now, userId: String(userId), adId: ad.adId, earnedAt: earnedAt || null, delayMs })
    ]);

    res.json(ad);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/admin/overview", requireAdmin, async (req, res) => {
  try {
    const now = Date.now();
    const [usersSnap, sessionsSnap, eventsSnap, adsSnap] = await Promise.all([
      db.ref("users").get(),
      db.ref("sessions").get(),
      db.ref("events").get(),
      db.ref("adServes").get()
    ]);

    const usersObj = usersSnap.exists() ? usersSnap.val() : {};
    const sessionsObj = sessionsSnap.exists() ? sessionsSnap.val() : {};
    const eventsObj = eventsSnap.exists() ? eventsSnap.val() : {};
    const adsObj = adsSnap.exists() ? adsSnap.val() : {};

    const totalUsers = Object.keys(usersObj || {}).length;
    const totalSessions = Object.keys(sessionsObj || {}).length;

    let totalEvents = 0;
    for (const sid of Object.keys(eventsObj || {})) {
      totalEvents += Object.keys(eventsObj[sid] || {}).length;
    }

    let sumClicks = 0;
    let sumDur = 0;
    let countedDur = 0;

    for (const sid of Object.keys(sessionsObj || {})) {
      const s = sessionsObj[sid] || {};
      sumClicks += Number(s.clicks || 0);
      const d = Number(s.durationMs || 0);
      if (d > 0) {
        sumDur += d;
        countedDur += 1;
      }
    }

    let eligibleUsersNow = 0;
    let cooldownUsersNow = 0;
    for (const uid of Object.keys(usersObj || {})) {
      const ae = usersObj[uid]?.adEligibility || {};
      const eligibleUntil = typeof ae.eligibleUntil === "number" ? ae.eligibleUntil : null;
      const cooldownUntil = typeof ae.cooldownUntil === "number" ? ae.cooldownUntil : null;
      if (cooldownUntil && now < cooldownUntil) cooldownUsersNow += 1;
      if (ae?.eligible && (!eligibleUntil || now <= eligibleUntil) && (!cooldownUntil || now >= cooldownUntil)) {
        eligibleUsersNow += 1;
      }
    }

    const totalAdsServed = Object.keys(adsObj || {}).length;
    const last24hFrom = now - 24 * 60 * 60 * 1000;

    let adsServedLast24h = 0;
    let sumDelay = 0;
    let delayCount = 0;

    for (const k of Object.keys(adsObj || {})) {
      const a = adsObj[k] || {};
      const at = Number(a.at || 0);
      if (at && at >= last24hFrom) adsServedLast24h += 1;
      const d = typeof a.delayMs === "number" ? a.delayMs : null;
      if (d !== null) {
        sumDelay += d;
        delayCount += 1;
      }
    }

    res.json({
      totalUsers,
      totalSessions,
      totalEvents,
      eligibleUsersNow,
      cooldownUsersNow,
      totalAdsServed,
      adsServedLast24h,
      avgTimeToServeMs: delayCount ? sumDelay / delayCount : 0,
      avgSessionDurationMs: countedDur ? sumDur / countedDur : 0,
      avgClicksPerSession: totalSessions ? sumClicks / totalSessions : 0,
      lastUpdatedAt: now
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/admin/users", requireAdmin, async (req, res) => {
  try {
    const now = Date.now();
    const [usersSnap, sessionsSnap] = await Promise.all([
      db.ref("users").get(),
      db.ref("sessions").get()
    ]);

    const usersObj = usersSnap.exists() ? usersSnap.val() : {};
    const sessionsObj = sessionsSnap.exists() ? sessionsSnap.val() : {};

    const agg = {};
    for (const sid of Object.keys(sessionsObj || {})) {
      const s = sessionsObj[sid] || {};
      const uid = s.userId;
      if (!uid) continue;
      if (!agg[uid]) agg[uid] = { totalSessions: 0, totalClicks: 0, sumDur: 0, durCount: 0 };
      agg[uid].totalSessions += 1;
      agg[uid].totalClicks += Number(s.clicks || 0);
      const d = Number(s.durationMs || 0);
      if (d > 0) {
        agg[uid].sumDur += d;
        agg[uid].durCount += 1;
      }
    }

    const rows = Object.keys(usersObj || {}).map((uid) => {
      const u = usersObj[uid] || {};
      const a = agg[uid] || { totalSessions: 0, totalClicks: 0, sumDur: 0, durCount: 0 };
      const ae = u.adEligibility || {};
      const eligibleUntil = typeof ae.eligibleUntil === "number" ? ae.eligibleUntil : null;
      const cooldownUntil = typeof ae.cooldownUntil === "number" ? ae.cooldownUntil : null;
      const eligible = !!ae.eligible && (!eligibleUntil || now <= eligibleUntil) && (!cooldownUntil || now >= cooldownUntil);

      return {
        userId: uid,
        displayName: u.displayName || null,
        device: u.device || null,
        appVersion: u.appVersion || null,
        firstSeenAt: u.firstSeenAt || null,
        lastSeenAt: u.lastSeenAt || null,
        totalSessions: a.totalSessions,
        totalClicks: a.totalClicks,
        avgSessionDurationMs: a.durCount ? a.sumDur / a.durCount : 0,
        eligible,
        eligibleUntil,
        cooldownUntil,
        lastAdServedAt: u.lastAdServedAt || null,
        adServedCount: Number(u.adServedCount || 0)
      };
    }).sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0));

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/admin/charts/clicks", requireAdmin, async (req, res) => {
  try {
    const now = Date.now();
    const range = String(req.query.range || '').toLowerCase();
    const baseMinutes = range === 'hour' ? 60 : range === 'day' ? 1440 : range === 'week' ? 10080 : Number(req.query.minutes || 60);
    const minutes = Math.max(10, Math.min(43200, baseMinutes));
    const from = now - minutes * 60_000;

    const eventsSnap = await db.ref("events").get();
    const eventsObj = eventsSnap.exists() ? eventsSnap.val() : {};

    const buckets = new Map();
    for (const sid of Object.keys(eventsObj || {})) {
      const per = eventsObj[sid] || {};
      for (const k of Object.keys(per || {})) {
        const e = per[k];
        if (e?.type !== "click") continue;
        const at = Number(e.at || 0);
        if (!at || at < from) continue;
        const minuteTs = Math.floor(at / 60_000) * 60_000;
        buckets.set(minuteTs, (buckets.get(minuteTs) || 0) + 1);
      }
    }

    const points = [];
    for (let t = Math.floor(from / 60_000) * 60_000; t <= now; t += 60_000) {
      points.push({ t, clicks: buckets.get(t) || 0 });
    }

    res.json(points);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/admin/charts/ads", requireAdmin, async (req, res) => {
  try {
    const now = Date.now();
    const range = String(req.query.range || '').toLowerCase();
    const baseMinutes = range === 'hour' ? 60 : range === 'day' ? 1440 : range === 'week' ? 10080 : Number(req.query.minutes || 60);
    const minutes = Math.max(10, Math.min(43200, baseMinutes));
    const from = now - minutes * 60_000;

    const adsSnap = await db.ref("adServes").get();
    const adsObj = adsSnap.exists() ? adsSnap.val() : {};

    const buckets = new Map();
    for (const k of Object.keys(adsObj || {})) {
      const a = adsObj[k] || {};
      const at = Number(a.at || 0);
      if (!at || at < from) continue;
      const minuteTs = Math.floor(at / 60_000) * 60_000;
      buckets.set(minuteTs, (buckets.get(minuteTs) || 0) + 1);
    }

    const points = [];
    for (let t = Math.floor(from / 60_000) * 60_000; t <= now; t += 60_000) {
      points.push({ t, ads: buckets.get(t) || 0 });
    }

    res.json(points);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/admin/users/:userId/metrics", requireAdmin, async (req, res) => {
  try {
    const userId = String(req.params.userId);
    const now = Date.now();
    const range = String(req.query.range || '').toLowerCase();
    const baseMinutes = range === 'hour' ? 60 : range === 'day' ? 1440 : range === 'week' ? 10080 : Number(req.query.minutes || 60);
    const minutes = Math.max(10, Math.min(43200, baseMinutes));
    const from = now - minutes * 60_000;

    const [sessionsSnap, eventsSnap, adsSnap] = await Promise.all([
      db.ref("sessions").get(),
      db.ref("events").get(),
      db.ref("adServes").get()
    ]);

    const sessionsObj = sessionsSnap.exists() ? sessionsSnap.val() : {};
    const eventsObj = eventsSnap.exists() ? eventsSnap.val() : {};
    const adsObj = adsSnap.exists() ? adsSnap.val() : {};

    const sessionIds = [];
    let sessionsInRange = 0;
    for (const sid of Object.keys(sessionsObj || {})) {
      const s = sessionsObj[sid] || {};
      if (String(s.userId) !== userId) continue;
      sessionIds.push(sid);
      const startedAt = Number(s.startedAt || 0);
      if (startedAt && startedAt >= from) sessionsInRange += 1;
    }

    let clicksInRange = 0;
    for (const sid of sessionIds) {
      const per = eventsObj[sid] || {};
      for (const k of Object.keys(per || {})) {
        const e = per[k];
        if (e?.type !== "click") continue;
        const at = Number(e.at || 0);
        if (!at || at < from) continue;
        clicksInRange += 1;
      }
    }

    let adsInRange = 0;
    for (const k of Object.keys(adsObj || {})) {
      const a = adsObj[k] || {};
      if (String(a.userId || '') !== userId) continue;
      const at = Number(a.at || 0);
      if (!at || at < from) continue;
      adsInRange += 1;
    }

    res.json({
      userId,
      range: range || null,
      from,
      to: now,
      sessions: sessionsInRange,
      clicks: clicksInRange,
      avgClicksPerSession: sessionsInRange ? clicksInRange / sessionsInRange : 0,
      adsServed: adsInRange
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/admin/users/:userId/charts/clicks", requireAdmin, async (req, res) => {
  try {
    const userId = String(req.params.userId);
    const now = Date.now();
    const range = String(req.query.range || '').toLowerCase();
    const baseMinutes = range === 'hour' ? 60 : range === 'day' ? 1440 : range === 'week' ? 10080 : Number(req.query.minutes || 60);
    const minutes = Math.max(10, Math.min(43200, baseMinutes));
    const from = now - minutes * 60_000;

    const [sessionsSnap, eventsSnap] = await Promise.all([
      db.ref("sessions").get(),
      db.ref("events").get()
    ]);
    const sessionsObj = sessionsSnap.exists() ? sessionsSnap.val() : {};
    const eventsObj = eventsSnap.exists() ? eventsSnap.val() : {};

    const sessionIds = [];
    for (const sid of Object.keys(sessionsObj || {})) {
      const s = sessionsObj[sid] || {};
      if (String(s.userId) !== userId) continue;
      sessionIds.push(sid);
    }

    const buckets = new Map();
    for (const sid of sessionIds) {
      const per = eventsObj[sid] || {};
      for (const k of Object.keys(per || {})) {
        const e = per[k];
        if (e?.type !== "click") continue;
        const at = Number(e.at || 0);
        if (!at || at < from) continue;
        const minuteTs = Math.floor(at / 60_000) * 60_000;
        buckets.set(minuteTs, (buckets.get(minuteTs) || 0) + 1);
      }
    }

    const points = [];
    for (let t = Math.floor(from / 60_000) * 60_000; t <= now; t += 60_000) {
      points.push({ t, clicks: buckets.get(t) || 0 });
    }
    res.json(points);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/admin/users/:userId/charts/ads", requireAdmin, async (req, res) => {
  try {
    const userId = String(req.params.userId);
    const now = Date.now();
    const range = String(req.query.range || '').toLowerCase();
    const baseMinutes = range === 'hour' ? 60 : range === 'day' ? 1440 : range === 'week' ? 10080 : Number(req.query.minutes || 60);
    const minutes = Math.max(10, Math.min(43200, baseMinutes));
    const from = now - minutes * 60_000;

    const adsSnap = await db.ref("adServes").get();
    const adsObj = adsSnap.exists() ? adsSnap.val() : {};

    const buckets = new Map();
    for (const k of Object.keys(adsObj || {})) {
      const a = adsObj[k] || {};
      if (String(a.userId || '') !== userId) continue;
      const at = Number(a.at || 0);
      if (!at || at < from) continue;
      const minuteTs = Math.floor(at / 60_000) * 60_000;
      buckets.set(minuteTs, (buckets.get(minuteTs) || 0) + 1);
    }

    const points = [];
    for (let t = Math.floor(from / 60_000) * 60_000; t <= now; t += 60_000) {
      points.push({ t, ads: buckets.get(t) || 0 });
    }
    res.json(points);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

const port = process.env.PORT || 5000;
app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${port}`);
});
