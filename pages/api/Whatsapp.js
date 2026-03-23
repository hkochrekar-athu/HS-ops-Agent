import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const NOTION_VERSION = "2022-06-28";

const SYSTEM_PROMPT = `You are the Agency OS Agent for Harshada Solutions — a WhatsApp AI assistant that manages a Notion workspace through natural conversation.

You can take real actions in Notion:
- add_client: Add a new client to the CRM database
- add_project: Add a new project to the Projects database
- query_notion: Read data from a Notion database

Parse casual WhatsApp messages and extract data. Examples:
- "New client Raj Sharma, restaurant, 15k chatbot" → add_client(name=Raj Sharma, industry=Restaurant, value=₹15,000, service=AI Chatbot, status=Lead)
- "Project for Goa Eats website, due April 30" → add_project(title=Goa Eats Website, client=Goa Eats, status=Planning)
- "Show my active clients" → query_notion(database=crm)

Reply style: SHORT (2-3 lines max). Use ✅ for confirmations. This is WhatsApp — be casual and warm.`;

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
        value: { type: "string" },
        status: { type: "string", enum: ["Lead", "Proposal", "Active", "Completed"] },
        industry: { type: "string" },
      },
      required: ["name", "service", "status"],
    },
  },
  {
    name: "add_project",
    description: "Add a new project to the Notion Projects database",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        client: { type: "string" },
        status: { type: "string", enum: ["Planning", "In Progress", "Review", "Completed", "On Hold"] },
        due_date: { type: "string", description: "YYYY-MM-DD format" },
        budget: { type: "string" },
      },
      required: ["title", "status"],
    },
  },
  {
    name: "query_notion",
    description: "Read data from a Notion database",
    input_schema: {
      type: "object",
      properties: {
        database: { type: "string", enum: ["crm", "projects"] },
      },
      required: ["database"],
    },
  },
];

async function notionReq(endpoint, method, body) {
  const res = await fetch(`https://api.notion.com/v1${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_VERSION,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Notion error");
  return data;
}

async function runTool(name, input) {
  const IDS = {
    crm: process.env.NOTION_CRM_DB_ID,
    projects: process.env.NOTION_PROJECTS_DB_ID,
  };

  try {
    if (name === "add_client") {
      if (!IDS.crm) return { ok: false, error: "CRM DB not connected — add NOTION_CRM_DB_ID to Vercel env vars" };
      await notionReq("/pages", "POST", {
        parent: { database_id: IDS.crm },
        properties: {
          Name: { title: [{ text: { content: input.name } }] },
          Status: { select: { name: input.status || "Lead" } },
          Service: { rich_text: [{ text: { content: input.service || "" } }] },
          Value: { rich_text: [{ text: { content: input.value || "" } }] },
          Industry: { rich_text: [{ text: { content: input.industry || "" } }] },
          Contact: { rich_text: [{ text: { content: input.contact || "" } }] },
        },
      });
      return { ok: true, msg: `Client "${input.name}" added to CRM` };
    }

    if (name === "add_project") {
      if (!IDS.projects) return { ok: false, error: "Projects DB not connected — add NOTION_PROJECTS_DB_ID to Vercel env vars" };
      const props = {
        Name: { title: [{ text: { content: input.title } }] },
        Status: { select: { name: input.status || "Planning" } },
        Client: { rich_text: [{ text: { content: input.client || "" } }] },
        Budget: { rich_text: [{ text: { content: input.budget || "" } }] },
      };
      if (input.due_date) props["Due Date"] = { date: { start: input.due_date } };
      await notionReq("/pages", "POST", { parent: { database_id: IDS.projects }, properties: props });
      return { ok: true, msg: `Project "${input.title}" created` };
    }

    if (name === "query_notion") {
      const dbKey = input.database;
      if (!IDS[dbKey]) return { ok: false, error: `${dbKey} DB not connected` };
      const result = await notionReq(`/databases/${IDS[dbKey]}/query`, "POST", { page_size: 10 });
      const items = (result.results || []).map((p) => ({
        name: p.properties.Name?.title?.[0]?.text?.content || "(unnamed)",
        status: p.properties.Status?.select?.name || "",
      }));
      return { ok: true, data: items };
    }

    return { ok: false, error: `Unknown tool: ${name}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function twilioXml(message) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  const body = req.body;
  const incomingMsg = body?.Body?.trim();

  if (!incomingMsg) {
    res.setHeader("Content-Type", "text/xml");
    return res.status(200).send(twilioXml("Hey! Send me a message to get started 👋"));
  }

  try {
    let messages = [{ role: "user", content: incomingMsg }];
    let finalReply = "";
    let iterations = 0;

    while (iterations < 5) {
      iterations++;
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      });

      if (response.stop_reason === "end_turn") {
        finalReply = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
        break;
      }

      if (response.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: response.content });
        const toolResults = await Promise.all(
          response.content.filte
