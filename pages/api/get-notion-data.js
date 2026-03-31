import { Client } from "@notionhq/client";

const notion = new Client({
  auth: process.env.NOTION_SECRET,
});

const DB_MAP = {
  clients: process.env.NOTION_CLIENTS_DB_ID,
  projects: process.env.NOTION_PROJECTS_DB_ID,
  invoices: process.env.NOTION_INVOICES_DB_ID,
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const { database } = req.query;

  if (!database || !DB_MAP[database]) {
    return res.status(400).json({ error: "Invalid database type" });
  }

  try {
    const response = await notion.databases.query({
      database_id: DB_MAP[database],
      page_size: 100,
    });

    return res.status(200).json({
      results: response.results,
    });
  } catch (error) {
    console.error("Notion fetch error:", error.message);
    return res.status(500).json({
      error: error.message || "Failed to fetch Notion data",
    });
  }
}