// /api/notion-agent.js
// Secure backend endpoint - uses environment variables, not hardcoded secrets

export default async function handler(req, res) {
  const { database } = req.query;
  
  // Get secrets from environment variables (set in Vercel)
  const NOTION_API_KEY = process.env.NOTION_API_KEY;
  
  const DATABASES = {
    clients: process.env.NOTION_CLIENTS_DATABASE_ID,
    projects: process.env.NOTION_PROJECTS_DATABASE_ID,
    invoices: process.env.NOTION_INVOICES_DATABASE_ID,
  };

  const databaseId = DATABASES[database];

  if (!databaseId) {
    return res.status(400).json({ error: 'Invalid database parameter' });
  }

  if (!NOTION_API_KEY) {
    console.error('Missing NOTION_API_KEY environment variable');
    return res.status(500).json({ error: 'API configuration missing' });
  }

  try {
    const response = await fetch(
      `https://api.notion.com/v1/databases/${databaseId}/query`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${NOTION_API_KEY}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      }
    );

    if (!response.ok) {
      throw new Error(`Notion API returned ${response.status}`);
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    console.error('Notion API error:', error);
    res.status(500).json({ error: error.message });
  }
}
