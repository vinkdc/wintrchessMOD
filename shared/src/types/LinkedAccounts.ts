export interface LinkedAccounts {
    chessCom?: string;
    lichess?: string;
}

export interface LinkedAccountsResponse extends LinkedAccounts {
    // Awaiting the code to appear in the Chess.com profile's location
    chessComPending?: { username: string; code: string };
}
