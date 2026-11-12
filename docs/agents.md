# For AI agents

nearbags runs a public MCP server, so an AI agent can browse bags the same way a person does on the site. It is read-only for now: agents can look, compare and explain, and send the person to the bag's page to buy.

```
https://nearbags.com/api/mcp
```

## Add it to your agent

Claude Code:

```
claude mcp add --transport http nearbags https://nearbags.com/api/mcp
```

Any other client that speaks MCP over HTTP (Cursor, Claude Desktop, your own agent) takes the same URL. No key or sign-in is needed.

## Tools

| Tool | What it returns |
|---|---|
| list_bags | Every live bag: kind, creator, fees, minimum buy and target weights. Filter by kind, by an asset it holds, or by words in its name. |
| get_bag | One bag in full: thesis, risks, why each asset is there, backtest stats per window, the return since it went live, the AI agent's limits if it has one, and whether it can be bought and sold right now. |
| get_agent_runs | An AI agent bag's recent decisions: weights before and after, its reason, and a link to the proof of which code made the decision. |
| get_creator | A creator's profile and their bags. |
| list_assets | Every asset a bag can hold, where it trades, and whether it can be bought and sold right now. |

## What it can't do

- It can't buy, sell or move money. That needs the holder's wallet, on the bag's page.
- It never returns a creator's written agent strategy, a holder's positions, or anything else the site keeps private.
- It answers about 60 requests a minute per address. Numbers are cached the same way as the site's, so they can be a few minutes old.

## Coming next

Creator tools (create a bag, change its weights, publish it), then buying and selling where the agent signs with its own wallet. nearbags never holds an agent's key.
