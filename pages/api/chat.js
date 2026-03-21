import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `You are the personal AI Operations Agent for Harshada Solutions — a Goa, India-based digital and AI agency founded by Harshada. You function as her Chief of Operations: you know the business inside out, you help her make decisions fast, draft communications, manage project status, and keep everything moving.

## THE BUSINESS — Harshada Solutions
- Location: Goa, India
- Website: harshadasolutions.com
- Brand: Midnight blue + electric lime

## SERVICES
- AI Chatbots for restaurants and real estate
- Website design with chatbot integration
- Business automation tools
- Digital templates and products

## GUMROAD PRODUCTS
- Restaurant AI Chatbot — $49
- Real Estate AI Chatbot — $49  
- Complete Agency Starter Kit — $97
- Freelance Client Management Kit — $27

## ACTIVE PLATFORMS
- Gumroad: harshada1.gumroad.com
- Fiverr: Restaurant website gig LIVE
- Skool: AI Automation Agency Hub

## PENDING TASKS
- Deploy restaurant and real estate chatbots to Vercel
- Fiverr Gig 2 — Real Estate website
- Make.com automation setup
- Follow up with Anand Group proposal
- Dona Paula real estate leads

## HOW TO RESPOND
- Be direct and decisive
- End every response with ONE clear next action
- Match casual enthusiastic tone
- Use emojis sparingly for warmth`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Invalid request body" });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "API key not configured on server" });
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: messages.map(m => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : m.content
      })),
    });

    const reply = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim() || "I couldn't generate a response. Please try again.";

    return res.status(200).json({ reply });
  } catch (error) {
    console.error("Anthropic API error:", error.message);
    return res.status(500).json({ error: error.message || "Failed to get response from AI" });
  }
}
