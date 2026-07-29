import { Injectable, type MessageEvent } from "@nestjs/common";
import { filter, interval, map, merge, Subject } from "rxjs";

export type UpdateTopic = "supplies" | "production" | "roles" | "members" | "audit" | "ability";

@Injectable()
export class UpdatesService {
  private readonly updates = new Subject<{ organizationId: string; topics: UpdateTopic[] }>();

  publish(organizationId: string, topics: UpdateTopic[]): void {
    this.updates.next({ organizationId, topics });
  }

  forOrganization(organizationId: string) {
    return merge(
      this.updates.pipe(
        filter((update) => update.organizationId === organizationId),
        map(({ topics }): MessageEvent => ({ type: "update", data: topics })),
      ),
      interval(25_000).pipe(map((): MessageEvent => ({ type: "update", data: [] }))),
    );
  }
}
