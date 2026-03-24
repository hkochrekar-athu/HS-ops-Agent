// pages/api/agent.js
// Drop this into your existing hs-ops-agent Next.js project
// replacing or alongside your existing API route

const Anthropic = require('@anthropic-ai/sdk');
const { Client } = require('@notionhq/client');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const notion = new Client({ auth: process.env.NOTION_SECRET });

const CLIENTS_DB = process.env.NOTION_CLIENTS_DB_ID;
const PROJECTS_DB = process.env.NOTION_PROJECTS_DB_ID;

// ── NOTION TOOLS ──────────────────────────────────────────────────────────────
const tools = [
  {
    name: "add_client",
    description: "Add a new client to the Notion CRM database. Use when user says 'add client', 'new client', 'I have a new client' etc.",
    input_schema: {
      type: "object",
      properties: {
        name:         { type: "string", description: "Client or business name" },
        status:       { type: "string", enum: ["Active", "Lead", "Paused", "Completed"], description: "Client status - default to Lead for new contacts" },
        business_type:{ type: "string", description: "Type of business e.g. Restaurant, Real Estate, Hotel" },
        contact_name: { type: "string", description: "Contact person's name" },
        whatsapp:     { type: "string", description: "WhatsApp number" },
        location:     { type: "string", description: "City or area" },
        retainer:     { type: "number", description: "Monthly retainer amount in rupees" },
        notes:        { type: "string", description: "Any additional notes" },
      },
      required: ["name"],
    },
  },
  {
    name: "get_clients",
    description: "Fetch and list clients from the Notion CRM. Use when user asks 'show my clients', 'list clients', 'who are my clients', 'active clients' etc.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["Active", "Lead", "Paused", "Completed", "all"], description: "Filter by status. Use 'all' for everything." },
      },
      required: [],
    },
  },
  {
    name: "add_project",
    description: "Add a new project to the Notion Projects database. Use when user says 'new project', 'add project', 'create project' etc.",
    input_schema: {
      type: "object",
      properties: {
        name:           { type: "string", description: "Project name" },
        client_name:    { type: "string", description: "Client this project is for" },
        status:         { type: "string", enum: ["Not Started", "In Progress", "Review", "Done", "On Hold"], description: "Project status" },
        service_type:   { type: "string", description: "Type of service e.g. Chatbot, Website, Automation" },
        deadline:       { type: "string", description: "Deadline date in YYYY-MM-DD format" },
        value:          { type: "number", description: "Project value in rupees" },
        payment_status: { type: "string", enum: ["Unpaid", "50% Paid", "Fully Paid"], description: "Payment status" },
        notes:          { type: "string", description: "Project notes or deliverables" },
      },
      required: ["name"],
    },
  },
  {
    name: "get_projects",
    description: "Fetch and list projects from Notion. Use when user asks 'show projects', 'what projects do I have', 'in progress projects', 'overdue projects' etc.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["Not Started", "In Progress", "Review", "Done", "On Hold", "all"], description: "Filter by status" },
      },
      required: [],
    },
  },
  {
    name: "get_dashboard_summary",
    description: "Get a full summary of the agency — active clients, in-progress projects, pending payments. Use when user says 'dashboard', 'summary', 'how is my agency doing', 'what is on my plate' etc.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

// ── NOTION ACTIONS ────────────────────────────────────────────────────────────
async function addClient(input) {
  const props = {
    "Name": { title: [{ text: { content: input.name } }] },
  };
  if (input.status)        props["Status"]          = { select: { name: input.status } };
  if (input.business_type) props["Business Type"]   = { select: { name: input.business_type } };
  if (input.contact_name)  props["Contact Name"]    = { rich_text: [{ text: { content: input.contact_name } }] };
  if (input.whatsapp)      props["WhatsApp"]        = { phone_number: input.whatsapp };
  if (input.location)      props["Location"]        = { rich_text: [{ text: { content: input.location } }] };
  if (input.retainer)      props["Monthly Retainer"]= { number: input.retainer };
  if (input.notes)         props["Notes"]           = { rich_text: [{ text: { content: input.notes } }] };

  const page = await notion.pages.create({
    parent: { database_id: CLIENTS_DB },
    properties: props,
  });
  return { success: true, id: page.id, name: input.name };
}

async function getClients(input) {
  const filter = input.status && input.status !== "all"
    ? { property: "Status", select: { equals: input.status } }
    : undefined;

  const response = await notion.databases.query({
    database_id: CLIENTS_DB,
    filter,
    sorts: [{ property: "Name", direction: "ascending" }],
    page_size: 20,
  });

  return response.results.map(page => ({
    name:     page.properties["Name"]?.title?.[0]?.text?.content || "Unnamed",
    status:   page.properties["Status"]?.select?.name || "—",
    type:     page.properties["Business Type"]?.select?.name || "—",
    location: page.properties["Location"]?.rich_text?.[0]?.text?.content || "—",
    retainer: page.properties["Monthly Retainer"]?.number || null,
  }));
}

async function addProject(input) {
  const props = {
    "Project Name": { title: [{ text: { content: input.name } }] },
  };
  if (input.status)         props["Status"]         = { select: { name: input.status || "Not Started" } };
  if (input.service_type)   props["Service Type"]   = { select: { name: input.service_type } };
  if (input.deadline)       props["Deadline"]       = { date: { start: input.deadline } };
  if (input.value)          props["Project Value"]  = { number: input.value };
  if (input.payment_status) props["Payment Status"] = { select: { name: input.payment_status || "Unpaid" } };
  if (input.notes)          props["Notes"]          = { rich_text: [{ text: { content: input.notes } }] };

  const page = await notion.pages.create({
    parent: { database_id: PROJECTS_DB },
    properties: props,
  });
  return { success: true, id: page.id, name: input.name };
}

async function getProjects(input) {
  const filter = input.status && input.status !== "all"
    ? { property: "Status", select: { equals: input.status } }
    : undefined;

  const response = await notion.databases.query({
    database_id: PROJECTS_DB,
    filter,
    sorts: [{ property: "Deadline", direction: "ascending" }],
    page_size: 20,
  });

  return response.results.map(page => ({
    name:     page.properties["Project Name"]?.title?.[0]?.text?.content || "Unnamed",
    status:   page.properties["Status"]?.select?.name || "—",
    deadline: page.properties["Deadline"]?.date?.start || "—",
    value:    page.properties["Project Value"]?.number || null,
    payment:  page.properties["Payment Status"]?.select?.name || "—",
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
    active_clients: activeClients,
    leads,
    projects_in_progress: inProgress,
    total_projects: projects.length,
    pending_payment_value: pendingValue,
    unpaid_projects: unpaidProjects.map(p => p.properties["Project Name"]?.title?.[0]?.text?.content || "Unnamed"),
  };
}

// ── TOOL EXECUTOR ─────────────────────────────────────────────────────────────
async function executeTool(name, input) {
  switch (name) {
    case "add_client":          return await addClient(input);
    case "get_clients":         return await getClients(input);
    case "add_project":         return await addProject(input);
    case "get_projects":        return await getProjects(input);
    case "get_dashboard_summary": return await getDashboardSummary();
    default: return { error: "Unknown tool" };
  }
}

// ── SYSTEM PROMPT ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are the Harshada Solutions Agency OS Agent — a powerful AI operations assistant for a Goa-based digital and AI agency.

You have direct access to the agency's Notion workspace. You can read and write to the Clients/CRM database and Projects database in real time.

YOUR CAPABILITIES:
- Add new clients to the CRM
- View and filter existing clients
- Create new projects
- View and filter projects
- Give a full dashboard summary of the agency

YOUR PERSONALITY:
- Warm, sharp and efficient — like a brilliant EA who knows the business inside out
- Always confirm what you did after taking an action
- If information is missing, make reasonable assumptions and mention them
- Format lists cleanly using bullet points
- Use ₹ for currency amounts
- Always mention the Notion database when you create or update something

AGENCY CONTEXT:
- Agency: Harshada Solutions, Goa, India
- Website: harshadasolutions.com (LIVE)
- Digital products store: labs.harshadasolutions.com (Axiom Assets)
- WhatsApp: +918830635281
- Services: AI Chatbots, WhatsApp Automation, Website Design, Workflow Automation, Lead Generation, AI Strategy Sessions
- Pricing: Rs12,000-25,000 setup, Rs3,000-5,000/month retainer
- Owner: Harshada, solo founder in Goa serving local businesses (restaurants, real estate, hospitality) and global freelance clients
- Digital products sold via Gumroad and Axiom Assets
- Live products: Digital Clarity OS, AI Chatbot templates, Restaurant Website Template, AI Document Generator, Client Management Toolkit
- Fiverr shop active with 5 gigs: AI Chatbot, Website Design, Pitch Deck, WhatsApp Automation, Notion Business System
- Tagline: Goa to the World

When users ask about clients or projects, always use the Notion tools to get live data — never make up information.
When users want to add something, use the appropriate tool immediately.`;

// ── MAIN HANDLER ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {

  
 res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { messages } = req.body;
  if (!messages?.length) return res.status(400).json({ error: "No messages provided" });

  try {
    let currentMessages = [...messages];
    let finalResponse = "";

    // Agentic loop — keeps going until Claude stops using tools
    for (let i = 0; i < 5; i++) {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools,
        messages: currentMessages,
      });

      // If Claude is done — return the text response
      if (response.stop_reason === "end_turn") {
        finalResponse = response.content
          .filter(b => b.type === "text")
          .map(b => b.text)
          .join("");
        break;
      }

      // If Claude wants to use tools
      if (response.stop_reason === "tool_use") {
        const toolUseBlocks = response.content.filter(b => b.type === "tool_use");
        const toolResults = [];

        for (const toolUse of toolUseBlocks) {
          const result = await executeTool(toolUse.name, toolUse.input);
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          });
        }

        // Add Claude's response and tool results to message history
        currentMessages = [
          ...currentMessages,
          { role: "assistant", content: response.content },
          { role: "user", content: toolResults },
        ];
        continue;
      }

      break;
    }

    return res.status(200).json({ response: finalResponse });

  } catch (error) {
    console.error("Agent error:", error);
    return res.status(500).json({ error: error.message || "Agent failed" });
  }
}
