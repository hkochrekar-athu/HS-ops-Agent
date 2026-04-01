import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const NOTION_VERSION = "2022-06-28";

const SYSTEM_PROMPT = `You are the Agency OS Agent — a WhatsApp AI assistant for freelancers.
You receive short messages and take real actions in the user's Notion workspace.

## YOUR TOOLS
- add_client: Add a new client to Notion Clients
- add_project: Add a new project to Notion Projects
- add_invoice: Create an invoice in Notion Invoices
- query_notion: Read from any Notion database

## PARSING RULES
Extract data from casual messages. Examples:
- "New client Raj Sharma, restaurant, 15k chatbot" → add_client
- "Show my clients" → query_notion(database=clients)

## RESPONSE STYLE
Keep responses SHORT (2-3 lines max). Use ✅ emojis.`;

const TOOLS = [
  {
    name: "add_client",
    description: "Add a new client",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        contact: { type: "string" },
        service: { type: "string" },
        value: { type: "number" },
        status: { type: "string", enum: ["Lead", "Proposal", "Active", "Completed"] },
      },
      required: ["name"],
    },
  },
  {
    name: "add_project",
    description: "Add a new project",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        client: { type: "string" },
        status: { type: "string", enum: ["Planning", "In Progress", "Review", "Completed"] },
        due_date: { type: "string" },
        budget: { type: "number" },
      },
      required: ["title"],
    },
  },
  {
    name: "add_invoice",
    description: "Create a new invoice",
    input_schema: {
      type: "object",
      properties: {
        client: { type: "string" },
        amount: { type: "number" },
        status: { type: "string", enum: ["Draft", "Sent", "Pending", "Paid"] },
      },
      required: ["client", "amount"],
    },
  },
  {
    name: "query_notion",
    description: "Read from a Notion database",
    input_schema: {
      type: "object",
      properties: {
        database: { type: "string", enum: ["clients", "projects", "invoices"] },
      },
      required: ["database"],
    },
  },
];

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
  if (!res.ok) throw new Error(data.message || "Notion error");
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

async function runTool(name, input) {
  const IDS = {
    clients: process.env.NOTION_CLIENTS_DATABASE_ID || process.env.NOTION_CLIENTS_DB_ID,
    projects: process.env.NOTION_PROJECTS_DATABASE_ID || process.env.NOTION_PROJECTS_DB_ID,
    invoices: process.env.NOTION_INVOICES_DATABASE_ID || process.env.NOTION_INVOICES_DB_ID,
  };

  try {
    if (name === "add_client") {
      if (!IDS.clients) return { ok: false, error: "Clients DB not connected" };
      await createPage(IDS.clients, {
        "Client Name": {
          title: [{ text: { content: input.name || "New Client" } }],
        },
      });
      return { ok: true, msg: `✅ Client "${input.name}" added` };
    }

    if (name === "add_project") {
      if (!IDS.projects) return { ok: false, error: "Projects DB not connected" };
      const props = {
        "Project Name": {
          title: [{ text: { content: input.title || "New Project" } }],
        },
        "Status": { select: { name: input.status || "Planning" } },
      };
      if (input.due_date) props["Due date"] = { date: { start: input.due_date } };
      await createPage(IDS.projects, props);
      return { ok: true, msg: `✅ Project "${input.title}" created` };
    }

    if (name === "add_invoice") {
      if (!IDS.invoices) return { ok: false, error: "Invoices DB not connected" };
      await createPage(IDS.invoices, {
        "Invoice no": { title: [{ text: { content: `INV-${input.client}` } }] },
        "Status": { select: { name: input.status || "Draft" } },
        "Amount": { number: input.amount },
      });
      return { ok: true, msg: `✅ Invoice for ${input.client} created` };
    }

    if (name === "query_notion") {
      const dbKey = input.database;
      if (!IDS[dbKey]) return { ok: false, error: `${dbKey} DB not connected` };
      const result = await queryDb(IDS[dbKey]);
      const items = (result.results || []).map((p) => ({
        name: p.properties["Client Name"]?.title?.[0]?.plain_text ||
               p.properties["Project Name"]?.title?.[0]?.plain_text ||
               p.properties["Invoice no"]?.title?.[0]?.plain_text || "(unnamed)",
        status: p.properties["Status"]?.select?.name || "",
      }));
      return { ok: true, data: items };
    }

    return { ok: false, error: `Unknown tool: ${name}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "messages array required" });
  }

  try {
    let allMessages = [...messages];
    let finalReply = "";
    let iterations = 0;

    while (iterations < 5) {
      iterations++;

      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages: allMessages,
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
        allMessages.push({ role: "assistant", content: response.content });

        const toolResults = await Promise.all(
          response.content
            .filter((b) => b.type === "tool_use")
            .map(async (t) => ({
              type: "tool_result",
              tool_use_id: t.id,
              content: JSON.stringify(await runTool(t.name, t.input)),
            }))
        );

        allMessages.push({ role: "user", content: toolResults });
        continue;
      }

      finalReply = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      break;
    }

    return res.status(200).json({ response: finalReply || "Done! ✅" });
  } catch (err) {
    console.error("Agent error:", err);
    return res.status(500).json({ error: err.message });
  }
}