// /api/whatsapp.js
// WhatsApp webhook handler - logs messages to Notion and uses Claude for processing

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const NOTION_API_KEY = process.env.NOTION_API_KEY;
  const NOTION_CLIENTS_DB = process.env.NOTION_CLIENTS_DATABASE_ID;
  const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY;

  try {
    const { phoneNumber, message, senderName } = req.body;

    if (!phoneNumber || !message) {
      return res.status(400).json({ error: 'Missing phoneNumber or message' });
    }

    console.log(`WhatsApp from ${phoneNumber}: ${message}`);

    // ── STEP 1: Check if client exists in Notion ──────────────────────────────
    let clientExists = false;
    let clientId = null;

    try {
      const queryResponse = await fetch(
        `https://api.notion.com/v1/databases/${NOTION_CLIENTS_DB}/query`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${NOTION_API_KEY}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            filter: {
              property: 'Phone',
              phone_number: { equals: phoneNumber },
            },
          }),
        }
      );

      const queryData = await queryResponse.json();
      if (queryData.results && queryData.results.length > 0) {
        clientExists = true;
        clientId = queryData.results[0].id;
      }
    } catch (err) {
      console.log('Query check passed - treating as new client');
    }

    // ── STEP 2: If new client, create in Notion ──────────────────────────────
    if (!clientExists) {
      try {
        const createResponse = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${NOTION_API_KEY}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            parent: { database_id: NOTION_CLIENTS_DB },
            properties: {
              'Client name': {
                title: [
                  {
                    text: {
                      content: senderName || `Lead from ${phoneNumber}`,
                    },
                  },
                ],
              },
              'Phone': {
                phone_number: phoneNumber,
              },
              'status': {
                select: { name: 'Lead' },
              },
              'Last Contacted': {
                date: {
                  start: new Date().toISOString().split('T')[0],
                },
              },
              'Next Action': {
                rich_text: [
                  {
                    text: {
                      content: 'Follow up via WhatsApp',
                    },
                  },
                ],
              },
            },
          }),
        });

        const newPage = await createResponse.json();
        clientId = newPage.id;
        console.log(`Created new client: ${clientId}`);
      } catch (err) {
        console.error('Error creating client:', err);
      }
    }

    // ── STEP 3: Generate reply with Claude ────────────────────────────────────
    let reply = 'Thanks for your message! We will get back to you soon.';

    if (CLAUDE_API_KEY) {
      try {
        const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': CLAUDE_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 150,
            messages: [
              {
                role: 'user',
                content: `A client sent this WhatsApp message: "${message}"\n\nGenerate a warm, professional 1-2 sentence response acknowledging their message. Be helpful and concise.`,
              },
            ],
          }),
        });

        const claudeData = await claudeResponse.json();
        if (claudeData.content && claudeData.content[0]) {
          reply = claudeData.content[0].text;
        }
      } catch (err) {
        console.error('Claude API error:', err);
      }
    }

    return res.status(200).json({
      success: true,
      clientId,
      message: 'Message logged to Notion',
      reply,
    });
  } catch (err) {
    console.error('WhatsApp handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
