// pages/api/whatsapp.js
// WhatsApp webhook — Twilio receives message, Claude + Notion handles it

const Anthropic = require('@anthropic-ai/sdk');
const { Client } = require('@notionhq/client');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const notion = new Client({ auth: process.env.NOTION_SECRET });

const CLIENTS_DB = process.env.NOTION_CLIENTS_DB_ID;
const PROJECTS_DB = process.env.NOTION_PROJECTS_DB_ID;

// ── TOOLS ─────────────────────────────────────────────────────────────────────
const tools = [
  {
    name: "add_client",
    description: "Add a new client to the Notion CRM database.",
    input_schema: {
      type: "object",
      properties: {
        name:          { type: "string" },
        status:        { type: "string", enum: ["Active", "Lead", "Paused", "Completed"] },
        business_type: { type: "string" },
        contact_name:  { type: "string" },
        whatsapp:      { type: "string" },
        location:      { type: "string" },
        retainer:      { type: "number" },
        notes:         { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "get_clients",
    description: "Fetch clients from the Notion CRM.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["Active", "Lead", "Paused", "Completed", "all"] },
      },
      required: [],
    },
  },
  {
    name: "add_project",
    description: "Add a new project to Notion Projects database.",
    input_schema: {
      type: "object",
      properties: {
        name:           { type: "string" },
        client_name:    { type: "string" },
        status:         { type: "string", enum: ["Not Started", "In Progress", "Review", "Done", "On Hold"] },
        service_type:   { type: "string" },
        deadline:       { type: "string" },
        value:          { type: "number" },
        payment_status: { type: "string", enum: ["Unpaid", "50% Paid", "Fully Paid"] },
        notes:          { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "get_projects",
    description: "Fetch projects from Notion.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["Not Started", "In Progress", "Review", "Done", "On Hold", "all"] },
      },
      required: [],
    },
  },
  {
    name: "get_dashboard_summary",
    description: "Get a full agency summary — active clients, projects, pending payments.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
];

// ── NOTION ACTIONS ─────────────────────────────────────────────────────────────
async function addClient(input) {
  const props = { "Name": { title: [{ text: { content: input.name } }] } };
  if (input.status)        props["Status"]           = { select: { name: input.status } };
  if (input.business_type) props["Business Type"]    = { select: { name: input.business_type } };
  if (input.contact_name)  props["Contact Name"]     = { rich_text: [{ text: { content: input.contact_name } }] };
  if (input.whatsapp)      props["WhatsApp"]         = { phone_number: input.whatsapp };
  if (input.location)      props["Location"]         = { rich_text: [{ text: { content: input.location } }] };
  if (input.retainer)      props["Monthly Retainer"] = { number: input.retainer };
  if (input.notes)         props["Notes"]            = { rich_text: [{ text: { content: input.notes } }] };
  const page = await notion.pages.create({ parent: { database_id: CLIENTS_DB }, properties: props });
  return { success: true, id: page.id, name: input.name };
}

async function getClients(input) {
  const filter = input.status && input.status !== "all"
    ? { property: "Status", select: { equals: input.status } } : undefined;
  const response = await notion.databases.query({
    database_id: CLIENTS_DB, filter,
    sorts: [{ property: "Name", direction: "ascending" }], page_size: 20,
  });
  return response.results.map(p => ({
    name:     p.properties["Name"]?.title?.[0]?.text?.content || "Unnamed",
    status:   p.properties["Status"]?.select?.name || "—",
    type:     p.properties["Business Type"]?.select?.name || "—",
    location: p.properties["Location"]?.rich_text?.[0]?.text?.content || "—",
    retainer: p.properties["Monthly Retainer"]?.number || null,
  }));
}

async function addProject(input) {
  const props = { "Project Name": { title: [{ text: { content: input.name } }] } };
  if (input.status)         props["Status"]         = { select: { name: input.status || "Not Started" } };
  if (input.service_type)   props["Service Type"]   = { select: { name: input.service_type } };
  if (input.deadline)       props["Deadline"]       = { date: { start: input.deadline } };
  if (input.value)          props["Project Value"]  = { number: input.value };
  if (input.payment_status) props["Payment Status"] = { select: { name: input.payment_status || "Unpaid" } };
  if (input.notes)          props["Notes"]          = { rich_text: [{ text: { content: input.notes } }] };
  const page = await notion.pages.create({ parent: { database_id: PROJECTS_DB }, properties: props });
  return { success: true, id: page.id, name: input.name };
}

async function getProjects(input) {
  const filter = input.status && input.status !== "all"
    ? { property: "Status", select: { equals: input.status } } : undefined;
  const response = await notion.databases.query({
    database_id: PROJECTS_DB, filter,
    sorts: [{ property: "Deadline", direction: "ascending" }], page_size: 20,
  });
  return response.results.map(p => ({
    name:     p.properties["Project Name"]?.title?.[0]?.text?.content || "Unnamed",
    status:   p.properties["Status"]?.select?.name || "—",
    deadline: p.properties["Deadline"]?.date?.start || "—",
    value:    p.properties["Project Value"]?.number || null,
    payment:  p.properties["Payment Status"]?.select?.name || "—",
  }));
}

async function getDashboardSummary() {
  const [allClients, allProjects] = await Promise.all([
    notion.databases.query({ database_id: CLIENTS_DB, page_size: 50 }),
    notion.databases.query({ database_id: PROJECTS_DB, page_size: 50 }),
  ]);
  const clients = allClients.results;
  const projects = allProjects.results;
  const activeClients = clients.filter(p => p.properties["Status"]?.select?.name === "Active").length;
  const leads = clients.filter(p => p.properties["Status"]?.select?.name === "Lead").length;
  const inProgress = projects.filter(p => p.properties["Status"]?.select?.name === "In Progress").length;
  const unpaidProjects = projects.filter(p => p.properties["Payment Status"]?.select?.name === "Unpaid");
  const pendingValue = unpaidProjects.reduce((sum, p) => sum + (p.properties["Project Value"]?.number || 0), 0);
  return {
    active_clients: activeClients, leads,
    projects_in_progress: inProgress, total_projects: projects.length,
    pending_payment_value: pendingValue,
    unpaid_projects: unpaidProjects.map(p => p.properties["Project Name"]?.title?.[0]?.text?.content || "Unnamed"),
  };
}

async function executeTool(name, input) {
  switch (name) {
    case "add_client":            return await addClient(input);
    case "get_clients":           return await getClients(input);
    case "add_project":           return await addProject(input);
    case "get_projects":          return await getProjects(input);
    case "get_dashboard_summary": return await getDashboardSummary();
    default: return { error: "Unknown tool" };
  }
}

// ── SYSTEM PROMPT ──────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are the Agency OS Agent for Harshada Solutions — a WhatsApp AI assistant that manages the agency's Notion workspace in real time.

You have live access to the Clients CRM and Projects database in Notion. You can add, read and summarise data instantly.

EXAMPLES of what you understand:
- "New client Raj Sharma, restaurant in Calangute, 15k chatbot" → add_client
- "Add project: Goa Eats website, due April 30, 25000" → add_project
- "Show my active clients" → get_clients
- "What projects are in progress?" → get_projects
- "Dashboard" or "How's the agency doing?" → get_dashboard_summary

REPLY RULES (this is WhatsApp):
- Keep replies SHORT — 3-5 lines max
- Use ✅ to confirm actions
- Use ₹ for money
- Be warm and direct — like texting a smart assistant
- After adding something, always say which Notion database it went into`;

// ── TWILIO HELPER ──────────────────────────────────────────────────────────────
function twilioXml(msg) {
  // Escape XML special chars
  const safe = msg.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${safe}</Message></Response>`;
}

// ── MAIN HANDLER ───────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  const incomingMsg = req.body?.Body?.trim();
  if (!incomingMsg) {
    res.setHeader("Content-Type", "text/xml");
    return res.status(200).send(twilioXml("Hey! Send me a message to get started 👋"));
  }

  try {
    let messages = [{ role: "user", content: incomingMsg }];
    let finalReply = "";

    for (let i = 0; i < 5; i++) {
      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        tools,
        messages,
      });

      if (response.stop_reason === "end_turn") {
        finalReply = response.content.filter(b => b.type === "text").map(b => b.text).join("").trim();
        break;
      }

      if (response.stop_reason === "tool_use") {
        const toolUseBlocks = response.content.filter(b => b.type === "tool_use");
        const toolResults = [];
        for (const t of toolUseBlocks) {
          const result = await executeTool(t.name, t.input);
          toolResults.push({ type: "tool_result", tool_use_id: t.id, content: JSON.stringify(result) });
        }
        messages = [...messages, { role: "assistant", content: response.content }, { role: "user", content: toolResults }];
        continue;
      }
      break;
    }

    res.setHeader("Content-Type", "text/xml");
    return res.status(200).send(twilioXml(finalReply || "Done! ✅ Check your Notion."));
  } catch (err) {
    console.error("WhatsApp agent error:", err);
    res.setHeader("Content-Type", "text/xml");
    return res.status(200).send(twilioXml("Something went wrong 🙏 Try again in a moment."));
  }
}

export const config = {
  api: { bodyParser: { type: "application/x-www-form-urlencoded" } },
};
