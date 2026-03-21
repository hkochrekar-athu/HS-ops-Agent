import { useState, useRef, useEffect } from "react";
import Head from "next/head";

const QUICK_ACTIONS = [
  {
    id: "outreach",
    label: "📧 Draft Client Outreach",
    prompt:
      "Draft a short, warm outreach email to a restaurant owner in Calangute/Baga area. I want to introduce my AI chatbot service ($49). Make it feel local and friendly, not salesy.",
  },
  {
    id: "status",
    label: "📋 Deployment Checklist",
    prompt:
      "Give me a clear, prioritised checklist of everything still pending for my full launch — Hostinger site, Vercel tools, and Gumroad listings. Tell me what to do first.",
  },
  {
    id: "gumroad",
    label: "🛒 Write Gumroad Copy",
    prompt:
      "Write compelling Gumroad listing copy for my Restaurant AI Chatbot at $49. Include a punchy headline, 3-line description, what's included, and who it's for.",
  },
  {
    id: "social",
    label: "📱 Create Social Post",
    prompt:
      "Write a LinkedIn post announcing that Harshada Solutions has launched. Keep it personal, confident, and Goa-flavored. No corporate tone. Max 150 words.",
  },
  {
    id: "nextmove",
    label: "🎯 What's My Next Move?",
    prompt:
      "Based on everything you know about where Harshada Solutions is right now — what is the single most important thing I should focus on this week to get my first paying client?",
  },
  {
    id: "findclients",
    label: "🔍 Find Goa Clients",
    prompt:
      "Search and find me: 1) The names of 5–8 popular restaurants in Calangute, Baga, or Anjuna that likely don't have a chatbot yet and could benefit from mine. 2) 3–5 real estate agencies in Panaji or Porvorim I should approach. Give me their likely contact approach and what angle to use for each.",
  },
  {
    id: "findtools",
    label: "🛠️ Find Tools & Resources",
    prompt:
      "Search and find me the best current tools, directories, or platforms where I can: 1) List Harshada Solutions as an AI agency to get inbound leads. 2) Find freelance or contract AI projects in India. 3) Discover new tools I should be offering clients. Give me specific names and links where possible.",
  },
];

function TypingIndicator() {
  return (
    <div style={{ display: "flex", gap: "5px", alignItems: "center", padding: "12px 16px" }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#c8ff00",
            animation: "bounce 1.2s infinite",
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </div>
  );
}

function MessageBubble({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        marginBottom: 16,
        animation: "fadeSlideIn 0.3s ease forwards",
      }}
    >
      {!isUser && (
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #c8ff00, #8ab800)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            marginRight: 10,
            flexShrink: 0,
            marginTop: 4,
          }}
        >
          ⚡
        </div>
      )}
      <div
        style={{
          maxWidth: "75%",
          padding: "13px 18px",
          borderRadius: isUser ? "20px 20px 4px 20px" : "20px 20px 20px 4px",
          background: isUser
            ? "linear-gradient(135deg, #c8ff00, #a8e000)"
            : "rgba(255,255,255,0.06)",
          color: isUser ? "#0a0f1e" : "#e8edf8",
          fontSize: 14.5,
          lineHeight: 1.65,
          border: isUser ? "none" : "1px solid rgba(200,255,0,0.12)",
          boxShadow: isUser
            ? "0 4px 20px rgba(200,255,0,0.25)"
            : "0 2px 12px rgba(0,0,0,0.3)",
          fontFamily: "'DM Sans', sans-serif",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {msg.content}
      </div>
      {isUser && (
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #1a2a5e, #0f1a3e)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            fontWeight: 700,
            color: "#c8ff00",
            marginLeft: 10,
            flexShrink: 0,
            marginTop: 4,
            border: "2px solid rgba(200,255,0,0.3)",
            fontFamily: "'Space Grotesk', sans-serif",
          }}
        >
          H
        </div>
      )}
    </div>
  );
}

export default function OpsAgent() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Hey Harshada! ⚡ Your Ops Agent is live and ready.\n\nI know your full business — every project, every pending deployment, every target client. Ask me anything or hit a quick action to get moving.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async (userText) => {
    if (!userText.trim() || loading) return;
    setError("");

    const newMessages = [...messages, { role: "user", content: userText }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }

      setMessages([...newMessages, { role: "assistant", content: data.reply }]);
    } catch (err) {
      setError("Connection error. Check your internet and try again.");
    }

    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <>
      <Head>
        <title>Ops Agent · Harshada Solutions</title>
        <meta name="description" content="Private AI Operations Agent for Harshada Solutions" />
        <meta name="robots" content="noindex" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>" />
      </Head>

      <div
        style={{
          minHeight: "100vh",
          background: "linear-gradient(160deg, #060c1f 0%, #0a1430 50%, #060e24 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "24px 16px 32px",
        }}
      >
        {/* Header */}
        <div
          style={{
            width: "100%",
            maxWidth: 780,
            marginBottom: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: "linear-gradient(135deg, #c8ff00, #8ab800)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                animation: "pulse 2.5s infinite",
              }}
            >
              ⚡
            </div>
            <div>
              <div
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontWeight: 700,
                  fontSize: 20,
                  color: "#ffffff",
                  letterSpacing: "-0.3px",
                }}
              >
                Ops Agent
              </div>
              <div style={{ fontSize: 12, color: "rgba(200,255,0,0.7)", marginTop: 1 }}>
                Harshada Solutions · Always ready
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "rgba(200,255,0,0.08)",
              border: "1px solid rgba(200,255,0,0.2)",
              borderRadius: 20,
              padding: "6px 14px",
            }}
          >
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#c8ff00",
                animation: "pulse 1.8s infinite",
              }}
            />
            <span style={{ fontSize: 12, color: "#c8ff00", fontWeight: 500 }}>
              Online
            </span>
          </div>
        </div>

        {/* Quick Actions */}
        <div
          style={{
            width: "100%",
            maxWidth: 780,
            marginBottom: 20,
            display: "flex",
            flexWrap: "wrap",
            gap: 9,
          }}
        >
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.id}
              onClick={() => sendMessage(action.prompt)}
              disabled={loading}
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(200,255,0,0.18)",
                borderRadius: 20,
                padding: "8px 16px",
                color: "#d4e4ff",
                fontSize: 13,
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 500,
                cursor: loading ? "not-allowed" : "pointer",
                transition: "all 0.2s ease",
                opacity: loading ? 0.5 : 1,
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.background = "rgba(200,255,0,0.1)";
                  e.currentTarget.style.borderColor = "rgba(200,255,0,0.5)";
                  e.currentTarget.style.color = "#c8ff00";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                e.currentTarget.style.borderColor = "rgba(200,255,0,0.18)";
                e.currentTarget.style.color = "#d4e4ff";
              }}
            >
              {action.label}
            </button>
          ))}
        </div>

        {/* Chat Window */}
        <div
          style={{
            width: "100%",
            maxWidth: 780,
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(200,255,0,0.1)",
            borderRadius: 24,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            boxShadow:
              "0 20px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)",
            minHeight: 500,
          }}
        >
          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "24px 20px 16px",
              minHeight: 420,
              maxHeight: "60vh",
            }}
          >
            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} />
            ))}

            {loading && (
              <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, #c8ff00, #8ab800)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                    marginRight: 10,
                    flexShrink: 0,
                  }}
                >
                  ⚡
                </div>
                <div
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(200,255,0,0.12)",
                    borderRadius: "20px 20px 20px 4px",
                  }}
                >
                  <TypingIndicator />
                </div>
              </div>
            )}

            {error && (
              <div
                style={{
                  background: "rgba(255,80,80,0.1)",
                  border: "1px solid rgba(255,80,80,0.3)",
                  borderRadius: 12,
                  padding: "10px 16px",
                  color: "#ff8080",
                  fontSize: 13,
                  marginBottom: 12,
                }}
              >
                ⚠️ {error}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input Area */}
          <div
            style={{
              borderTop: "1px solid rgba(200,255,0,0.08)",
              padding: "16px 20px",
              display: "flex",
              gap: 12,
              alignItems: "flex-end",
              background: "rgba(0,0,0,0.2)",
            }}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height =
                  Math.min(e.target.scrollHeight, 140) + "px";
              }}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything about your business... (Enter to send)"
              rows={1}
              disabled={loading}
              style={{
                flex: 1,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(200,255,0,0.15)",
                borderRadius: 14,
                padding: "12px 16px",
                color: "#e8edf8",
                fontSize: 14.5,
                fontFamily: "'DM Sans', sans-serif",
                lineHeight: 1.5,
                overflow: "hidden",
                transition: "border-color 0.2s",
              }}
              onFocus={(e) =>
                (e.target.style.borderColor = "rgba(200,255,0,0.4)")
              }
              onBlur={(e) =>
                (e.target.style.borderColor = "rgba(200,255,0,0.15)")
              }
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim()}
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background:
                  loading || !input.trim()
                    ? "rgba(200,255,0,0.15)"
                    : "linear-gradient(135deg, #c8ff00, #a0d400)",
                border: "none",
                cursor:
                  loading || !input.trim() ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
                transition: "all 0.2s ease",
                flexShrink: 0,
                boxShadow:
                  loading || !input.trim()
                    ? "none"
                    : "0 4px 16px rgba(200,255,0,0.3)",
              }}
            >
              {loading ? "⏳" : "→"}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: 16,
            fontSize: 11.5,
            color: "rgba(200,220,255,0.25)",
            letterSpacing: "0.5px",
          }}
        >
          Built by Harshada Solutions · Powered by Claude
        </div>
      </div>
    </>
  );
}
