import { RequestHandler } from "express";
import { StatusCodes } from "http-status-codes";
import dotenv from "dotenv";

dotenv.config();

const originHostname = process.env.ORIGIN
    ? new URL(process.env.ORIGIN).hostname : undefined;

const whitelistedHostnames = [
    /^(.+\.)?wintrchess\.com$/,
    ...(originHostname
        ? [new RegExp(`^${originHostname.replace(/\./g, "\\.")}$`)] : []
    ),
    ...(process.env.NODE_ENV == "development"
        ? [/localhost/] : []
    )
];

const hostnameWhitelist: RequestHandler = (req, res, next) => {
    const hostWhitelisted = whitelistedHostnames.some(
        hostnameRegex => hostnameRegex.test(req.hostname)
    );

    if (!hostWhitelisted) {
        return res.sendStatus(StatusCodes.UNAUTHORIZED);
    }

    next();
};

export default hostnameWhitelist;