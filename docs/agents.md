# For AI agents

nearbags runs a public MCP server, so an AI agent can browse bags the same way a person does on the site. With an agent key from your profile, it can also create and manage your own bags. It can never buy, sell or move money.

```
https://nearbags.com/api/mcp
```

## Add it to your agent

To browse (no key needed), in Claude Code:

```
claude mcp add --transport http nearbags https://nearbags.com/api/mcp
```

To manage your own bags, make a key under **Agent keys** on your profile page (you need to be signed in, and to have accepted the risk notice). The key is shown once, with the full command to copy:

```
claude mcp add --transport http nearbags https://nearbags.com/api/mcp --header "Authorization: Bearer nbk_..."
```

Any other client that speaks MCP over HTTP (Cursor, Claude Desktop, your own agent) takes the same URL and header.

## Tools anyone can use

| Tool | What it returns |
|---|---|
| list_bags | Every live bag: kind, creator, fees, minimum buy and target weights. Filter by kind, by an asset it holds, or by words in its name. |
| get_bag | One bag in full: thesis, risks, why each asset is there, backtest stats per window, the return since it went live, the AI agent's limits if it has one, and whether it can be bought and sold right now. |
| get_agent_runs | An AI agent bag's recent decisions: weights before and after, its reason, and a link to the proof of which code made the decision. |
| get_creator | A creator's profile and their bags. |
| list_assets | Every asset a bag can hold, where it trades, and whether it can be bought and sold right now. |

## Tools with an agent key

| Tool | What it does |
|---|---|
| whoami | The account the key belongs to and what it may do. |
| my_bags | Your bags, including pending ones. |
| preview_bag | Checks a set of weights against the rules and returns backtest stats and the minimum buy. Up to 20 an hour. |
| create_bag | Creates a bag under your account, optionally run by the AI agent with a rule or your own strategy. Same rules as the site, up to 5 a day. |
| edit_bag | Changes the tagline, thesis, risks, exit signal or why an asset is there. Every change shows in the bag's public edit history. |
| close_bag | Stops new buys. Holders can still sell and withdraw. Needs confirm: true. |
| run_agent | Starts a rebalance now on one of your live AI-agent bags, inside its limits. At most once every 10 minutes. |

## What a key can't do

- It can't buy, sell, withdraw or sign anything.
- A bag an agent creates starts as pending. It goes live only after you buy it yourself, with your wallet, on its page.
- After a bag goes live, its name, assets, weights and fee can't change. An AI-agent bag's weights move only through its agent, inside the limits set when it was created.
- It can't make other keys or touch other people's bags.

Only a fingerprint of each key is stored. Your profile shows when each key was last used, and revoking one stops it on the next request. Every change made with a key is recorded with the key's name.

## Limits

About 60 requests a minute per key or address. Numbers are cached the same way as the site's, so they can be a few minutes old.

## Coming next

Buying and selling through an agent that signs with its own wallet. nearbags never holds an agent's key.
