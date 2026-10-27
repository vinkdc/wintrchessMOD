import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { StatusCodes } from "http-status-codes";

import { LinkedAccountsResponse } from "shared/types/LinkedAccounts";
import Button from "@/components/common/Button";
import TextField from "@/components/common/TextField";
import LogMessage from "@/components/common/LogMessage";

import * as settingsStyles from "@/apps/settings/index.module.css";
import * as styles from "./LinkedAccounts.module.css";

const strings = "account.linkedAccounts";

function LinkedAccounts() {
    const { t } = useTranslation("settings");

    const [ links, setLinks ] = useState<LinkedAccountsResponse>();
    const [ chessComInput, setChessComInput ] = useState("");
    const [ message, setMessage ] = useState<{
        text: string;
        theme?: "warn" | "success";
    }>();

    async function refreshLinks() {
        const linksResponse = await fetch("/api/account/links");
        if (linksResponse.ok) setLinks(await linksResponse.json());
    }

    useEffect(() => {
        refreshLinks();

        // Result of returning from the Lichess authorisation page
        const params = new URLSearchParams(location.search);

        if (params.get("linked") == "lichess") {
            setMessage({ text: t(`${strings}.lichessLinked`), theme: "success" });
        } else if (params.get("linkError") == "lichess") {
            setMessage({ text: t(`${strings}.lichessFailed`) });
        }
    }, []);

    async function startChessComLink() {
        setMessage(undefined);

        const startResponse = await fetch("/api/account/links/chesscom/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: chessComInput.trim() })
        });

        if (startResponse.status == StatusCodes.NOT_FOUND) {
            return setMessage({ text: t(`${strings}.chessComNotFound`) });
        } else if (!startResponse.ok) {
            return setMessage({ text: t(`${strings}.chessComInvalid`) });
        }

        refreshLinks();
    }

    async function verifyChessComLink() {
        setMessage(undefined);

        const verifyResponse = await fetch("/api/account/links/chesscom/verify", {
            method: "POST"
        });

        if (verifyResponse.status == StatusCodes.UNPROCESSABLE_ENTITY) {
            return setMessage({ text: t(`${strings}.chessComCodeMissing`) });
        } else if (!verifyResponse.ok) {
            return setMessage({ text: t(`${strings}.chessComInvalid`) });
        }

        setMessage({ text: t(`${strings}.chessComLinked`), theme: "success" });
        refreshLinks();
    }

    async function unlink(platform: "chesscom" | "lichess") {
        setMessage(undefined);

        await fetch(`/api/account/links/${platform}`, { method: "DELETE" });
        refreshLinks();
    }

    return <div className={styles.wrapper}>
        <span className={styles.description}>
            {t(`${strings}.description`)}
        </span>

        <span>Lichess</span>

        {links?.lichess
            ? <div className={styles.row}>
                <TextField
                    wrapperClassName={styles.field}
                    className={settingsStyles.inputField}
                    value={links.lichess}
                    readOnly
                />

                <Button onClick={() => unlink("lichess")}>
                    {t(`${strings}.unlink`)}
                </Button>
            </div>
            : <Button
                className={styles.connectButton}
                onClick={() => location.href = "/api/account/links/lichess/start"}
            >
                {t(`${strings}.connectLichess`)}
            </Button>
        }

        <span>Chess.com</span>

        {links?.chessCom
            ? <div className={styles.row}>
                <TextField
                    wrapperClassName={styles.field}
                    className={settingsStyles.inputField}
                    value={links.chessCom}
                    readOnly
                />

                <Button onClick={() => unlink("chesscom")}>
                    {t(`${strings}.unlink`)}
                </Button>
            </div>
            : <>
                <div className={styles.row}>
                    <TextField
                        wrapperClassName={styles.field}
                        className={settingsStyles.inputField}
                        placeholder={t(`${strings}.chessComPlaceholder`)}
                        value={chessComInput}
                        onChange={setChessComInput}
                    />

                    <Button
                        onClick={startChessComLink}
                        disabled={chessComInput.trim().length < 3}
                    >
                        {t(`${strings}.getCode`)}
                    </Button>
                </div>

                {links?.chessComPending && <div className={styles.verifyBox}>
                    <span>
                        {t(`${strings}.chessComInstructions`, {
                            username: links.chessComPending.username
                        })}
                    </span>

                    <TextField
                        className={settingsStyles.inputField}
                        value={links.chessComPending.code}
                        readOnly
                        copyable
                    />

                    <a
                        href="https://www.chess.com/settings/profile"
                        target="_blank"
                    >
                        {t(`${strings}.openChessComSettings`)}
                    </a>

                    <Button
                        className={styles.connectButton}
                        onClick={verifyChessComLink}
                    >
                        {t(`${strings}.verify`)}
                    </Button>
                </div>}
            </>
        }

        {message && <LogMessage theme={message.theme}>
            {message.text}
        </LogMessage>}
    </div>;
}

export default LinkedAccounts;
