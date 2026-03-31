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

if (!CLIENTS_DB || !PROJECTS_DB || !INVOICES_DB) {
  console.warn(
    "WARNING: One or more Notion DB IDs are missing. Check NOTION_CLIENTS_DB_ID, NOTION_PROJECTS_DB_ID, NOTION_INVOICES_DB_ID."
  );
}

const tools = [
  {
    name: "add_client",
    description: "Add a new client to the CRM database.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Client or business name" },
        status: {
          type: "string",
          enum: ["Active", "Lead", "Paused", "Completed"],
          description: "Client status",
        },
        deal_value: {
          type: "number",
          description: "Deal value in rupees",
        },
        last_contacted: {
          type: "string",
          description: "Last contacted date in YYYY-MM-DD format",
        },
        next_action: {
          type: "string",
          description: "Next action for this client",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "get_clients",
    description: "Fetch and list clients from the CRM database.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["Active", "Lead", "Paused", "Completed", "all"],
          description: "Filter by status",
        },
      },
      required: [],
    },
  },
  {
    name: "add_project",
    description: "Add a new project to the Projects database.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project name" },
        client_name: {
          type: "string",
          description: "Client this project is for",
        },
        status: {
          type: "string",
          enum: ["Not Started", "In Progress", "Completed", "Paused"],
          description: "Project status",
        },
        due_date: {
          type: "string",
          description: "Due date in YYYY-MM-DD format",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "get_projects",
    description: "Fetch and list projects.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["Not Started", "In Progress", "Completed", "Paused", "all"],
          description: "Filter by project status",
        },
      },
      required: [],
    },
  },
  {
    name: "get_invoices",
    description: "Fetch and list invoices.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["Paid", "Pending", "Overdue", "all"],
          description: "Filter by invoice status",
        },
      },
      required: [],
    },
  },
  {
    name: "get_dashboard_summary",
    description:
      "Get a dashboard summary of clients, projects, and invoices.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

async function findClientPageIdByName(ClientName) {
  if (!clientName || !CLIENTS_DB) return null;

  const response = await notion.databases.query({
    database_id: CLIENTS_DB,
    filter: {
      property: "Client Name",
      title: {
        equals: clientName,
      },
    },
    page_size: 1,
  });

  return response.results[0]?.id || null;
}

async function addClient(input) {
  if (!CLIENTS_DB) throw new Error("CLIENTS_DB environment variable is not set");
  if (!input.name?.trim()) throw new Error("Client Name is required");

  const props = {
   "Client Name": {
      title: [{ text: { content: input.name.trim() } }],
    },
  };

  if (input.status) {
    props["Status"] = { select: { name: input.status } };
  }

  if (typeof input.deal_value === "number") {
    props["Deal Value"] = { number: input.deal_value };
  }

  if (input.last_contacted) {
    props["Last Contacted"] = { date: { start: input.last_contacted } };
  }

  if (input.next_action) {
    props["Next Action"] = {
      rich_text: [{ text: { content: input.next_action } }],
    };
  }

  const page = await notion.pages.create({
    parent: { database_id: CLIENTS_DB },
    properties: props,
  });

  return {
    success: true,
    id: page.id,
    name: input.name,
  };
}

async function getClients(input) {
  if (!CLIENTS_DB) throw new Error("CLIENTS_DB environment variable is not set");

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
    name: page.properties["Client Name"]?.title?.[0]?.plain_text || "Unnamed",
    status: page.properties["Status"]?.select?.name || "—",
    deal_value: page.properties["Deal Value"]?.number ?? null,
    last_contacted: page.properties["Last Contacted"]?.date?.start || "—",
    next_action:
      page.properties["Next Action"]?.rich_text?.[0]?.plain_text || "—",
  }));
}

async function addProject(input) {
  if (!PROJECTS_DB) {
    throw new Error("PROJECTS_DB environment variable is not set");
  }
  if (!input.name?.trim()) throw new Error("Project name is required");

  const props = {
    "Project Name": {
      title: [{ text: { content: input.name.trim() } }],
    },
  };

  if (input.status) {
    props["Status"] = { select: { name: input.status } };
  }

  if (input.due_date) {
    props["Due Date"] = { date: { start: input.due_date } };
  }

  if (input.client_name) {
    const clientPageId = await findClientPageIdByName(input.client_name);
    if (clientPageId) {
      props["Client"] = {
        relation: [{ id: clientPageId }],
      };
    }
  }

  const page = await notion.pages.create({
    parent: { database_id: PROJECTS_DB },
    properties: props,
  });

  return {
    success: true,
    id: page.id,
    name: input.name,
  };
}

async function getProjects(input) {
  if (!PROJECTS_DB) {
    throw new Error("PROJECTS_DB environment variable is not set");
  }

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
    client:
      page.properties["Client"]?.relation?.length > 0
        ? `${page.properties["Client"].relation.length} linked`
        : "—",
    status: page.properties["Status"]?.select?.name || "—",
    due_date: page.properties["Due Date"]?.date?.start || "—",
  }));
}

async function getInvoices(input) {
  if (!INVOICES_DB) {
    throw new Error("INVOICES_DB environment variable is not set");
  }

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
    invoice: page.properties["Invoice"]?.title?.[0]?.plain_text || "Unnamed",
    client:
      page.properties["Client"]?.relation?.length > 0
        ? `${page.properties["Client"].relation.length} linked`
        : "—",
    amount: page.properties["Amount"]?.number ?? null,
    status: page.properties["Status"]?.select?.name || "—",
  }));
}

async function getDashboardSummary() {
  if (!CLIENTS_DB || !PROJECTS_DB || !INVOICES_DB) {
    throw new Error("One or more DB environment variables are missing");
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

  const paused = clients.filter(
    (p) => p.properties["Status"]?.select?.name === "Paused"
  ).length;

  const completedProjects = projects.filter(
    (p) => p.properties["Status"]?.select?.name === "Completed"
  ).length;

  const inProgressProjects = projects.filter(
    (p) => p.properties["Status"]?.select?.name === "In Progress"
  ).length;

  const overdueInvoices = invoices.filter(
    (p) => p.properties["Status"]?.select?.name === "Overdue"
  );

  const pendingInvoices = invoices.filter(
    (p) => p.properties["Status"]?.select?.name === "Pending"
  );

  const pendingInvoiceValue = pendingInvoices.reduce(
    (sum, p) => sum + (p.properties["Amount"]?.number || 0),
    0
  );

  return {
    active_clients: activeClients,
    leads,
    paused_clients: paused,
    projects_in_progress: inProgressProjects,
    completed_projects: completedProjects,
    overdue_invoices: overdueInvoices.length,
    pending_invoice_value: pendingInvoiceValue,
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
        return { error: "Unknown tool" };
    }
  } catch (error) {
    return { error: error.message || "Tool execution failed" };
  }
}

const SYSTEM_PROMPT = `
You are the Harshada Solutions Ops Agent — an AI operations assistant for Harshada Solutions.

You have live access to Notion databases for:
- CRM / Clients
- Projects
- Invoices

YOUR CAPABILITIES:
- Add and list clients
- Add and list projects
- List invoices
- Give dashboard summaries

RULES:
- Always use live Notion tools when asked about clients, projects, invoices, or summaries
- Never invent database results
- Be concise, clear, and operational
- Use ₹ for amounts where relevant
- Confirm actions clearly after they happen
`;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { messages } = req.body;
  if (!messages?.length) {
    return res.status(400).json({ error: "No messages provided" });
  }

  try {
    let currentMessages = [...messages];
    let finalResponse = "";

    for (let i = 0; i < 5; i++) {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools,
        messages: currentMessages,
      });

      if (response.stop_reason === "end_turn") {
        finalResponse = response.content
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("");

        if (!finalResponse) {
          finalResponse = "Action completed successfully.";
        }
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

        currentMessages = [
          ...currentMessages,
          { role: "assistant", content: response.content },
          { role: "user", content: toolResults },
        ];
        continue;
      }

      break;
    }

    return res.status(200).json({
      response: finalResponse || "No response generated.",
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Internal server error",
    });
  }
}