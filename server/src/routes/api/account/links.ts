import express, { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { createHash, randomBytes } from "crypto";
import z from "zod";

import { LinkedAccounts } from "shared/types/LinkedAccounts";
import { accountAuthenticator } from "@/lib/security/account";
import { User } from "@/database/models/account";

const chessComUserAgent = "VinkChess account linking (chess.binbi.space)";

// Lichess allows OAuth with PKCE without registering a client
const lichessClientId = "vinkchess";

const chessComUsernameSchema = z.string().regex(/^[a-z0-9_-]{3,25}$/i);

interface LinkFields {
    linkedAccounts?: LinkedAccounts;
    chessComLinkPending?: { username: string; code: string };
    lichessLinkPending?: { state: string; verifier: string };
}

function getLichessRedirectUri() {
    return `${process.env.ORIGIN}/api/account/links/lichess/callback`;
}

function toBase64Url(buffer: Buffer) {
    return buffer.toString("base64url");
}

async function getLinkFields(username: string) {
    return await User.findOne({ username }).lean() as LinkFields | null;
}

const router = Router();

router.use("/links", express.json());

router.get("/links", accountAuthenticator(), async (req, res) => {
    if (!req.user) return res.sendStatus(StatusCodes.UNAUTHORIZED);

    const fields = await getLinkFields(req.user.username);

    res.json({
        ...fields?.linkedAccounts,
        chessComPending: fields?.chessComLinkPending
    });
});

// Chess.com has no OAuth for third parties, so ownership is proven by
// putting a one-time code in the account's public "Location" field
router.post("/links/chesscom/start", accountAuthenticator(), async (req, res) => {
    if (!req.user) return res.sendStatus(StatusCodes.UNAUTHORIZED);

    const parsedUsername = chessComUsernameSchema.safeParse(req.body?.username);

    if (!parsedUsername.success)
        return res.sendStatus(StatusCodes.BAD_REQUEST);

    const profileResponse = await fetch(
        `https://api.chess.com/pub/player/${parsedUsername.data.toLowerCase()}`,
        { headers: { "User-Agent": chessComUserAgent } }
    );

    if (profileResponse.status == StatusCodes.NOT_FOUND)
        return res.sendStatus(StatusCodes.NOT_FOUND);

    if (!profileResponse.ok)
        return res.sendStatus(StatusCodes.BAD_GATEWAY);

    const profile = await profileResponse.json();

    const pending = {
        username: String(profile.username),
        code: `vink-${randomBytes(3).toString("hex")}`
    };

    await User.updateOne(
        { username: req.user.username },
        { chessComLinkPending: pending }
    );

    res.json(pending);
});

router.post("/links/chesscom/verify", accountAuthenticator(), async (req, res) => {
    if (!req.user) return res.sendStatus(StatusCodes.UNAUTHORIZED);

    const pending = (await getLinkFields(req.user.username))
        ?.chessComLinkPending;

    if (!pending) return res.sendStatus(StatusCodes.BAD_REQUEST);

    const profileResponse = await fetch(
        `https://api.chess.com/pub/player/${pending.username}`,
        { headers: { "User-Agent": chessComUserAgent } }
    );

    if (!profileResponse.ok)
        return res.sendStatus(StatusCodes.BAD_GATEWAY);

    const profile = await profileResponse.json();

    if (!String(profile.location || "").includes(pending.code))
        return res.sendStatus(StatusCodes.UNPROCESSABLE_ENTITY);

    await User.updateOne(
        { username: req.user.username },
        {
            "linkedAccounts.chessCom": pending.username,
            $unset: { chessComLinkPending: "" }
        }
    );

    res.json({ chessCom: pending.username });
});

router.delete("/links/chesscom", accountAuthenticator(), async (req, res) => {
    if (!req.user) return res.sendStatus(StatusCodes.UNAUTHORIZED);

    await User.updateOne(
        { username: req.user.username },
        { $unset: { "linkedAccounts.chessCom": "", chessComLinkPending: "" } }
    );

    res.sendStatus(StatusCodes.OK);
});

router.get("/links/lichess/start", accountAuthenticator(true), async (req, res) => {
    if (!req.user) return res.redirect("/signin");

    const verifier = toBase64Url(randomBytes(32));
    const state = toBase64Url(randomBytes(16));

    await User.updateOne(
        { username: req.user.username },
        { lichessLinkPending: { state, verifier } }
    );

    const challenge = toBase64Url(
        createHash("sha256").update(verifier).digest()
    );

    const params = new URLSearchParams({
        response_type: "code",
        client_id: lichessClientId,
        redirect_uri: getLichessRedirectUri(),
        code_challenge_method: "S256",
        code_challenge: challenge,
        state
    });

    res.redirect(`https://lichess.org/oauth?${params}`);
});

router.get("/links/lichess/callback", accountAuthenticator(true), async (req, res) => {
    if (!req.user) return res.redirect("/signin");

    const failed = () => res.redirect("/settings?linkError=lichess");

    const pending = (await getLinkFields(req.user.username))
        ?.lichessLinkPending;

    if (
        !pending
        || typeof req.query.code != "string"
        || req.query.state != pending.state
    ) return failed();

    const tokenResponse = await fetch("https://lichess.org/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "authorization_code",
            code: req.query.code,
            code_verifier: pending.verifier,
            redirect_uri: getLichessRedirectUri(),
            client_id: lichessClientId
        })
    });

    if (!tokenResponse.ok) return failed();

    const accessToken: string = (await tokenResponse.json()).access_token;

    const accountResponse = await fetch("https://lichess.org/api/account", {
        headers: { Authorization: `Bearer ${accessToken}` }
    });

    // The token is only needed to read the username once
    fetch("https://lichess.org/api/token", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` }
    }).catch(() => undefined);

    if (!accountResponse.ok) return failed();

    const lichessUsername = String((await accountResponse.json()).username);

    await User.updateOne(
        { username: req.user.username },
        {
            "linkedAccounts.lichess": lichessUsername,
            $unset: { lichessLinkPending: "" }
        }
    );

    res.redirect("/settings?linked=lichess");
});

router.delete("/links/lichess", accountAuthenticator(), async (req, res) => {
    if (!req.user) return res.sendStatus(StatusCodes.UNAUTHORIZED);

    await User.updateOne(
        { username: req.user.username },
        { $unset: { "linkedAccounts.lichess": "", lichessLinkPending: "" } }
    );

    res.sendStatus(StatusCodes.OK);
});

export default router;
