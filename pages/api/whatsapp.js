/**
 * Agency OS Agent — WhatsApp Webhook
 * Flow: WhatsApp msg → Twilio → this endpoint → Claude → Notion → WhatsApp reply
 */

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const NOTION_VERSION = "2022-06-28";

// ── SYSTEM PROMPT ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are the Agency OS Agent — a WhatsApp AI assistant for freelancers.
You receive short WhatsApp messages and take real actions in the user's Notion workspace.

## YOUR TOOLS
- add_client: Add a new client to Notion CRM
- add_project: Add a new project to Notion Projects
- add_invoice: Create an invoice in Notion Invoices
- query_notion: Read from any Notion database

## PARSING RULES
Extract data from casual, short messages. Examples:
- "New client Raj Sharma, restaurant, 15k chatbot" → add_client(name=Raj Sharma, contact="", service=AI Chatbot, value=15000, status=Lead)
- "Project for Goa Eats website, due 2026-04-30" → add_project(title=Goa Eats Website, client=Goa Eats, due_date=2026-04-30, status=Planning)
- "Invoice Coconut Grove 12000 pending" → add_invoice(client=Coconut Grove, amount=12000, status=Pending)
- "Show me my active clients" → query_notion(database=crm)
- "Show projects" → query_notion(database=projects)
- "Show invoices" → query_notion(database=invoices)

## RESPONSE STYLE
- You are replying via WhatsApp so keep responses SHORT (2-3 lines max)
- Use ✅ to confirm actions done
- Use emojis naturally
- If unclear, ask ONE question only
- Never write long paragraphs`;

// ── NOTION HELPERS ────────────────────────────────────────────────────────────
async function notionReq(endpoint, method, body) {
  const notionApiKey = process.env.NOTION_API_KEY || process.env.NOTION_SECRET;

  const res = await fetch(`https://api.notion.com/v1${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${notionApiKey}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_VERSION,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || "Notion error");
  }

  return data;
}

async function createPage(dbId, props) {
  return notionReq("/pages", "POST", {
    parent: { database_id: dbId },
    properties: props,
  });
}

async function queryDb(dbId) {
  return notionReq(`/databases/${dbId}/query`, "POST", { page_size: 10 });
}

// ── TOOL DEFINITIONS ──────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: "add_client",
    description: "Add a new client to the Notion CRM database",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        contact: { type: "string" },
        service: { type: "string" },
        value: { type: "number" },
        status: {
          type: "string",
          enum: ["Lead", "Proposal", "Active", "Completed"],
        },
      },
      required: ["name"],
    },
  },
  {
    name: "add_project",
    description: "Add a new project to Notion Projects database",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        client: { type: "string" },
        status: {
          type: "string",
          enum: ["Planning", "In Progress", "Review", "Completed", "On Hold"],
        },
        due_date: { type: "string", description: "YYYY-MM-DD format" },
        budget: { type: "number" },
      },
      required: ["title"],
    },
  },
  {
    name: "add_invoice",
    description: "Create a new invoice in Notion",
    input_schema: {
      type: "object",
      properties: {
        client: { type: "string" },
        amount: { type: "number" },
        status: {
          type: "string",
          enum: ["Draft", "Sent", "Pending", "Paid", "Overdue"],
        },
      },
      required: ["client", "amount"],
    },
  },
  {
    name: "query_notion",
    description: "Read data from a Notion database",
    input_schema: {
      type: "object",
      properties: {
        database: {
          type: "string",
          enum: ["crm", "projects", "invoices"],
        },
      },
      required: ["database"],
    },
  },
];

// ── TOOL EXECUTOR ─────────────────────────────────────────────────────────────
async function runTool(name, input) {
    const IDS = {
  crm:
    process.env.NOTION_CLIENTS_DATABASE_ID ||
    process.env.NOTION_CLIENTS_DB_ID ||
    process.env.NOTION_CRM_DB_ID,

  projects:
    process.env.NOTION_PROJECTS_DATABASE_ID ||
    process.env.NOTION_PROJECTS_DB_ID,

  invoices:
    process.env.NOTION_INVOICES_DATABASE_ID ||
    process.env.NOTION_INVOICES_DB_ID,
};
  try {
    if (name === "add_client") {
      if (!IDS.crm) return { ok: false, error: "CRM DB not connected" };

      await createPage(IDS.crm, {
        "Client Name": {
          title: [{ text: { content: input.name || "New Client" } }],
        },
        "Status": {
          select: { name: input.status || "Lead" },
        },
        "Phone": {
          phone_number: input.contact || "",
        },
        "Deal Value": {
          number: typeof input.value === "number" ? input.value : null,
        },
        "Next Action": {
          rich_text: [
            {
              text: {
                content: input.service || "Follow up via WhatsApp",
              },
            },
          ],
        },
      });

      return { ok: true, msg: `Client "${input.name}" added to CRM` };
    }

    if (name === "add_project") {
      if (!IDS.projects) return { ok: false, error: "Projects DB not connected" };

      const props = {
        "Project Name": {
          title: [{ text: { content: input.title || "New Project" } }],
        },
        "Status": {
          select: { name: input.status || "Planning" },
        },
        "Budget": {
          number: typeof input.budget === "number" ? input.budget : null,
        },
      };

      if (input.due_date) {
        props["Due date"] = { date: { start: input.due_date } };
      }

      await createPage(IDS.projects, props);

      return { ok: true, msg: `Project "${input.title}" created` };
    }

    if (name === "add_invoice") {
      if (!IDS.invoices) return { ok: false, error: "Invoices DB not connected" };

      await createPage(IDS.invoices, {
        "Invoice no": {
          title: [{ text: { content: `Invoice — ${input.client}` } }],
        },
        "Status": {
          select: { name: input.status || "Draft" },
        },
        "Amount": {
          number: typeof input.amount === "number" ? input.amount : null,
        },
      });

      return { ok: true, msg: `Invoice for ${input.client} created` };
    }

    if (name === "query_notion") {
      const dbKey = input.database;
      if (!IDS[dbKey]) return { ok: false, error: `${dbKey} DB not connected` };

      const result = await queryDb(IDS[dbKey]);
      const items = (result.results || []).map((p) => {
        const pr = p.properties || {};
        return {
          name:
            pr["Client Name"]?.title?.[0]?.plain_text ||
            pr["Project Name"]?.title?.[0]?.plain_text ||
            pr["Invoice no"]?.title?.[0]?.plain_text ||
            "(unnamed)",
          status:
            pr["Status"]?.select?.name ||
            pr["Status"]?.status?.name ||
            "",
          value:
            pr["Deal Value"]?.number ??
            pr["Amount"]?.number ??
            "",
        };
      });

      return { ok: true, data: items };
    }

    return { ok: false, error: `Unknown tool: ${name}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── TWILIO REPLY ──────────────────────────────────────────────────────────────
function twilioXml(message) {
  const safeMessage = String(message || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${safeMessage}</Message></Response>`;
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  const body = req.body;
  const incomingMsg = body?.Body?.trim();
  const fromNumber = body?.From || "unknown";

  if (!incomingMsg) {
    res.setHeader("Content-Type", "text/xml");
    return res.status(200).send(twilioXml("Hey! Send me a message to get started 👋"));
  }

  console.log(`[WhatsApp] From: ${fromNumber} | Message: ${incomingMsg}`);

  try {
    let messages = [{ role: "user", content: incomingMsg }];
    let finalReply = "";
    let iterations = 0;

    while (iterations < 5) {
      iterations++;

      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      });

      if (response.stop_reason === "end_turn") {
        finalReply = response.content
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        break;
      }

      if (response.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: response.content });

        const toolResults = await Promise.all(
          response.content
            .filter((b) => b.type === "tool_use")
            .map(async (t) => ({
              type: "tool_result",
              tool_use_id: t.id,
              content: JSON.stringify(await runTool(t.name, t.input)),
            }))
        );

        messages.push({ role: "user", content: toolResults });
        continue;
      }

      finalReply = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      break;
    }

    res.setHeader("Content-Type", "text/xml");
    return res.status(200).send(twilioXml(finalReply || "Done! ✅ Check your Notion."));
  } catch (err) {
    console.error("Agent error:", err);
    res.setHeader("Content-Type", "text/xml");
    return res.status(200).send(twilioXml("Something went wrong. Try again in a moment 🙏"));
  }
}

export const config = {
  api: { bodyParser: { type: "application/x-www-form-urlencoded" } },
};
