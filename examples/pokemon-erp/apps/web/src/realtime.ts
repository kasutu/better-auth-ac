import { useEffect, useEffectEvent } from "react";
import { API_ORIGIN } from "./auth-client";

type UpdateTopic = "supplies" | "production" | "roles" | "members" | "audit" | "ability";

export function useRealtime(
  topics: UpdateTopic | readonly UpdateTopic[],
  reload: () => void,
  enabled = true,
) {
  const topicList = typeof topics === "string" ? topics : topics.join(",");
  const onUpdate = useEffectEvent(reload);

  useEffect(() => {
    if (!enabled) return;
    const source = new EventSource(`${API_ORIGIN}/api/updates`, { withCredentials: true });
    source.addEventListener("update", (event) => {
      const changed = JSON.parse(event.data) as UpdateTopic[];
      if (topicList.split(",").some((topic) => changed.includes(topic as UpdateTopic))) onUpdate();
    });
    return () => source.close();
  }, [enabled, topicList]);
}
