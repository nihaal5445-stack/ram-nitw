"use client";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

export interface FeedbackPrompt { redemption_id: string; mess_id: string; slot: string; meal_date: string; due_at: string }
export const FEEDBACK_EVENT = "ram:feedback-changed";

/** Prompts that are due now (40 min after an accepted scan). Polls every 30 s and on demand. */
export function useFeedbackPrompts(): { prompts: FeedbackPrompt[]; refresh: () => Promise<void> } {
  const [prompts, setPrompts] = useState<FeedbackPrompt[]>([]);
  const refresh = useCallback(async () => {
    if (document.hidden) return;
    const { data, error } = await createClient().rpc("my_feedback_prompts");
    if (!error && data) setPrompts(data as FeedbackPrompt[]);
  }, []);
  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const id = setInterval(() => void refresh(), 30_000);
    const on = () => void refresh();
    window.addEventListener(FEEDBACK_EVENT, on);
    return () => { clearTimeout(first); clearInterval(id); window.removeEventListener(FEEDBACK_EVENT, on); };
  }, [refresh]);
  return { prompts, refresh };
}
