import { Firestore } from "@google-cloud/firestore";
import { EventPublisher } from "../events/EventPublisher";

export class FailureDetector {
  constructor(private db: Firestore, private publisher: EventPublisher) {}

  sweep() {}
}
