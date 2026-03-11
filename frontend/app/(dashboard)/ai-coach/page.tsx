"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Bot, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useProjectsQuery } from "@/lib/queries";
import { getAICoachResponse } from "@/lib/api";

type ChatMessage = { id: string; role: "user" | "assistant"; content: string };

export default function AICoachPage() {
  const { data: projects = [], isLoading: loadingProjects } = useProjectsQuery();
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(undefined);
  const activeProjectId = selectedProjectId ?? projects[0]?.id;
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hi! I’m BuildMini, your BuildMind AI coach. Ask me about your project execution or next steps.",
    },
  ]);

  const send = async () => {
    if (!input.trim() || !activeProjectId || isSending) return;
    const message = input.trim();
    setInput("");
    setError(null);
    const userId = `${Date.now()}-user`;
    const aiId = `${Date.now()}-ai`;
    setMessages((prev) => [...prev, { id: userId, role: "user", content: message }]);
    setIsSending(true);
    try {
      const response = await getAICoachResponse(activeProjectId, message);
      const reply = response.message || "I can help with your next steps.";
      setMessages((prev) => [...prev, { id: aiId, role: "assistant", content: reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-zinc-100">BuildMini</h2>
        <p className="text-body mt-1">Chat with BuildMini about your project execution and next steps.</p>
      </div>

      <Card className="glass-panel panel-glow overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-500/25 to-purple-500/25 px-6 py-4">
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-200">BuildMini Chat</p>
          <h3 className="mt-1 text-lg font-semibold text-zinc-100">Project-focused coaching</h3>
        </div>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-zinc-100">BuildMini Chat</CardTitle>
            <p className="text-body">Select a project and ask for guidance.</p>
          </div>
          <select
            value={activeProjectId ?? ""}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="h-10 rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-zinc-100"
            disabled={projects.length === 0}
          >
            {projects.length === 0 ? <option value="">No projects</option> : null}
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </select>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl border px-4 py-3 text-sm ${
                    message.role === "user"
                      ? "border-indigo-500/30 bg-indigo-500/10 text-zinc-100"
                      : "border-white/10 bg-white/5 text-zinc-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {message.role === "assistant" ? <Bot className="h-4 w-4 text-indigo-300" /> : null}
                    <span>{message.content}</span>
                  </div>
                </div>
              </div>
            ))}
            {isSending ? <p className="text-sm text-zinc-400">Generating response...</p> : null}
            {!loadingProjects && projects.length === 0 ? (
              <p className="text-sm text-rose-400">Create a project to chat with the AI coach.</p>
            ) : null}
            {error ? <p className="text-sm text-rose-400">{error}</p> : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Ask the AI coach about your roadmap..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="min-w-[220px] flex-1 border-white/10 bg-black/20 text-zinc-100 placeholder:text-zinc-500"
            />
            <Button
              className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white"
              onClick={() => void send()}
              disabled={!activeProjectId || isSending}
            >
              Send
              <Send className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.section>
  );
}
