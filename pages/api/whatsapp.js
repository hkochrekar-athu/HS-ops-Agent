import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@notionhq/client";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const notion = new Client({
  auth: process.env.NOTION_SECRET,
});

const CLIENTS_DB = process.env.NOTION_CLIENTS_DB_ID;
const PROJECTS_DB = process.env.NOTION_PROJECTS_DB_ID;
const INVOICES_DB = process.env.NOTION_INVOICES_DB_ID;

const OWNER_NUMBER = "whatsapp:+918830635281";

const tools = [
  {
    name: "add_client",
    description: "Add a new client to the CRM database.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        status: {
          type: "string",
          enum: ["Active", "Lead", "Paused", "Completed"],
        },
        phone: { type: "string" },
        deal_value: { type: "number" },
        last_contacted: { type: "string", description: "YYYY-MM-DD" },
        next_action: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "get_clients",
    description: "Fetch clients from CRM database.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["Active", "Lead", "Paused", "Completed", "all"],
        },
      },
      required: [],
    },
  },
  {
    name: "add_project",
    description: "Add a project to the Projects database.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        status: {
          type: "string",
          enum: ["Not Started", "In Progress", "Completed", "Paused"],
        },
        due_date: { type: "string", description: "YYYY-MM-DD" },
        budget: { type: "number" },
      },
      required: ["name"],
    },
  },
  {
    name: "get_projects",
    description: "Fetch projects from Projects database.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["Not Started", "In Progress", "Completed", "Paused", "all"],
        },
      },
      required: [],
    },
  },
  {
    name: "get_invoices",
    description: "Fetch invoices from Invoices database.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["Paid", "Pending", "Overdue", "all"],
        },
      },
      required: [],
    },
  },
  {
    name: "get_dashboard_summary",
    description: "Get dashboard summary from Clients, Projects, and Invoices.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

function escapeXml(text = "") {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function twilioXml(message) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(
    message
  )}</Message></Response>`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function addClient(input) {
  if (!CLIENTS_DB) throw new Error("NOTION_CLIENTS_DB_ID is missing");

  const properties = {
    Name: {
      title: [{ text: { content: input.name.trim() } }],
    },
  };

  if (input.status) {
    properties["Status"] = { select: { name: input.status } };
  }

  if (input.phone) {
    properties["Phone"] = { phone_number: input.phone };
  }

  if (typeof input.deal_value === "number") {
    properties["Deal Value"] = { number: input.deal_value };
  }

  if (input.last_contacted) {
    properties["Last Contacted"] = { date: { start: input.last_contacted } };
  }

  if (input.next_action) {
    properties["Next Action"] = {
      rich_text: [{ text: { content: input.next_action } }],
    };
  }

  const page = await notion.pages.create({
    parent: { database_id: CLIENTS_DB },
    properties,
  });

  return {
    success: true,
    id: page.id,
    name: input.name,
  };
}

async function getClients(input = {}) {
  if (!CLIENTS_DB) throw new Error("NOTION_CLIENTS_DB_ID is missing");

  const filter =
    input.status && input.status !== "all"
      ? {
          property: "Status",
          select: { equals: input.status },
        }
      : undefined;

  const response = await notion.databases.query({
    database_id: CLIENTS_DB,
    filter,
    page_size: 50,
  });

  return response.results.map((page) => ({
    name: page.properties["Name"]?.title?.[0]?.plain_text || "Unnamed",
    status: page.properties["Status"]?.select?.name || "—",
    phone: page.properties["Phone"]?.phone_number || "—",
    deal_value: page.properties["Deal Value"]?.number ?? null,
    last_contacted: page.properties["Last Contacted"]?.date?.start || "—",
    next_action:
      page.properties["Next Action"]?.rich_text?.[0]?.plain_text || "—",
  }));
}

async function addProject(input) {
  if (!PROJECTS_DB) throw new Error("NOTION_PROJECTS_DB_ID is missing");

  const properties = {
    "Project Name": {
      title: [{ text: { content: input.name.trim() } }],
    },
  };

  if (input.status) {
    properties["Status"] = { select: { name: input.status } };
  }

  if (input.due_date) {
    properties["Due Date"] = { date: { start: input.due_date } };
  }

  if (typeof input.budget === "number") {
    properties["Budget"] = { number: input.budget };
  }

  const page = await notion.pages.create({
    parent: { database_id: PROJECTS_DB },
    properties,
  });

  return {
    success: true,
    id: page.id,
    name: input.name,
  };
}

async function getProjects(input = {}) {
  if (!PROJECTS_DB) throw new Error("NOTION_PROJECTS_DB_ID is missing");

  const filter =
    input.status && input.status !== "all"
      ? {
          property: "Status",
          select: { equals: input.status },
        }
      : undefined;

  const response = await notion.databases.query({
    database_id: PROJECTS_DB,
    filter,
    page_size: 50,
  });

  return response.results.map((page) => ({
    name: page.properties["Project Name"]?.title?.[0]?.plain_text || "Unnamed",
    status: page.properties["Status"]?.select?.name || "—",
    due_date: page.properties["Due Date"]?.date?.start || "—",
    budget: page.properties["Budget"]?.number ?? null,
  }));
}

async function getInvoices(input = {}) {
  if (!INVOICES_DB) throw new Error("NOTION_INVOICES_DB_ID is missing");

  const filter =
    input.status && input.status !== "all"
      ? {
          property: "Status",
          select: { equals: input.status },
        }
      : undefined;

  const response = await notion.databases.query({
    database_id: INVOICES_DB,
    filter,
    page_size: 50,
  });

  return response.results.map((page) => ({
    invoice_no:
      page.properties["Invoices No"]?.title?.[0]?.plain_text || "Unnamed",
    status: page.properties["Status"]?.select?.name || "—",
    client:
      page.properties["Clients"]?.rich_text?.[0]?.plain_text ||
      page.properties["Clients"]?.title?.[0]?.plain_text ||
      "—",
    phone: page.properties["Phone"]?.phone_number || "—",
  }));
}

async function getDashboardSummary() {
  if (!CLIENTS_DB || !PROJECTS_DB || !INVOICES_DB) {
    throw new Error("One or more DB IDs are missing");
  }

  const [clientsRes, projectsRes, invoicesRes] = await Promise.all([
    notion.databases.query({ database_id: CLIENTS_DB, page_size: 100 }),
    notion.databases.query({ database_id: PROJECTS_DB, page_size: 100 }),
    notion.databases.query({ database_id: INVOICES_DB, page_size: 100 }),
  ]);

  const clients = clientsRes.results;
  const projects = projectsRes.results;
  const invoices = invoicesRes.results;

  const activeClients = clients.filter(
    (p) => p.properties["Status"]?.select?.name === "Active"
  ).length;

  const leads = clients.filter(
    (p) => p.properties["Status"]?.select?.name === "Lead"
  ).length;

  const pausedClients = clients.filter(
    (p) => p.properties["Status"]?.select?.name === "Paused"
  ).length;

  const projectsInProgress = projects.filter(
    (p) => p.properties["Status"]?.select?.name === "In Progress"
  ).length;

  const completedProjects = projects.filter(
    (p) => p.properties["Status"]?.select?.name === "Completed"
  ).length;

  const overdueInvoices = invoices.filter(
    (p) => p.properties["Status"]?.select?.name === "Overdue"
  ).length;

  const pendingInvoices = invoices.filter(
    (p) => p.properties["Status"]?.select?.name === "Pending"
  ).length;

  return {
    active_clients: activeClients,
    leads,
    paused_clients: pausedClients,
    projects_in_progress: projectsInProgress,
    completed_projects: completedProjects,
    overdue_invoices: overdueInvoices,
    pending_invoices: pendingInvoices,
  };
}

async function executeTool(name, input) {
  try {
    switch (name) {
      case "add_client":
        return await addClient(input);
      case "get_clients":
        return await getClients(input || {});
      case "add_project":
        return await addProject(input);
      case "get_projects":
        return await getProjects(input || {});
      case "get_invoices":
        return await getInvoices(input || {});
      case "get_dashboard_summary":
        return await getDashboardSummary();
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (error) {
    console.error(`Tool error in ${name}:`, error);
    return { error: error.message || "Tool execution failed" };
  }
}

async function autoLogLead({ from, message }) {
  try {
    if (!CLIENTS_DB) return;

    await notion.pages.create({
      parent: { database_id: CLIENTS_DB },
      properties: {
        Name: {
          title: [{ text: { content: `WhatsApp Lead ${from}` } }],
        },
        Status: {
          select: { name: "Lead" },
        },
        Phone: {
          phone_number: from.replace("whatsapp:", ""),
        },
        "Last Contacted": {
          date: { start: todayISO() },
        },
        "Next Action": {
          rich_text: [
            {
              text: {
                content: message
                  ? `Review incoming message: ${message.slice(0, 150)}`
                  : "Review incoming WhatsApp lead",
              },
            },
          ],
        },
      },
    });
  } catch (error) {
    console.error("Auto lead log failed:", error);
  }
}

const SYSTEM_PROMPT = `
You are the Harshada Solutions Ops Agent for WhatsApp.

You have live access to:
- Clients CRM
- Projects
- Invoices

Rules:
- Keep replies short and operational
- Use tools whenever the user asks about clients, projects, invoices, or summary
- Never invent Notion data
- If a user asks to add a client or project, use the correct tool
`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  const incomingMsg = req.body?.Body?.trim();
  const from = req.body?.From?.trim();

  if (!incomingMsg) {
    res.setHeader("Content-Type", "text/xml");
    return res.status(200).send(twilioXml("Send me a message to get started."));
  }

  try {
    if (from !== OWNER_NUMBER) {
      await autoLogLead({ from, message: incomingMsg });
    }

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
        finalReply = response.content
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("")
          .trim();
        break;
      }

      if (response.stop_reason === "tool_use") {
        const toolUseBlocks = response.content.filter(
          (b) => b.type === "tool_use"
        );

        const toolResults = [];
        for (const toolUse of toolUseBlocks) {
          const result = await executeTool(toolUse.name, toolUse.input);
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          });
        }

        messages = [
          ...messages,
          { role: "assistant", content: response.content },
          { role: "user", content: toolResults },
        ];
        continue;
      }

      break;
    }

    res.setHeader("Content-Type", "text/xml");
    return res
      .status(200)
      .send(twilioXml(finalReply || "Done. Check Notion."));
  } catch (error) {
    console.error("WhatsApp agent error:", error);
    res.setHeader("Content-Type", "text/xml");
    return res
      .status(200)
      .send(twilioXml("Something went wrong. Try again in a moment."));
  }
}

export const config = {
  api: {
    bodyParser: {
      type: "application/x-www-form-urlencoded",
    },
  },
};